/**
 * Plugin Marketplace Installer
 *
 * Registers the agent-foreman marketplace in Claude Code's known_marketplaces.json
 * so users can install the plugin via `/plugin install agent-foreman`
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync, cpSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import chalk from "chalk";
import { compareVersions } from "./version.js";
import { copyRulesToProject, hasRulesInstalled } from "./rules/index.js";

// These imports will be available after running embed-assets.ts
// For development, we provide fallback behavior
let EMBEDDED_PLUGINS: Record<string, string> = {};
let EMBEDDED_PLUGINS_VERSION = "0.0.0";

try {
  const embedded = await import("./embedded-assets.generated.js");
  EMBEDDED_PLUGINS = embedded.EMBEDDED_PLUGINS;
  EMBEDDED_PLUGINS_VERSION = embedded.EMBEDDED_VERSION;
} catch {
  // Not in compiled mode or generated file doesn't exist
}

// Plugin identifiers
const MARKETPLACE_NAME = "agent-foreman-plugins";
const PLUGIN_NAME = "agent-foreman";
const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

// Dynamic path getters to support HOME override in tests
function getClaudeDir(): string {
  return join(process.env.HOME || homedir(), ".claude");
}

function getClaudePluginsDir(): string {
  return join(getClaudeDir(), "plugins");
}

function getKnownMarketplacesFile(): string {
  return join(getClaudePluginsDir(), "known_marketplaces.json");
}

function getInstalledPluginsFile(): string {
  return join(getClaudePluginsDir(), "installed_plugins_v2.json");
}

function getSettingsFile(): string {
  return join(getClaudeDir(), "settings.json");
}

function getMarketplacesDir(): string {
  return join(getClaudePluginsDir(), "marketplaces");
}

function getCacheDir(): string {
  return join(getClaudePluginsDir(), "cache");
}

function getLocalMarketplaceDir(): string {
  return join(getMarketplacesDir(), MARKETPLACE_NAME);
}

/**
 * Marketplace registry types
 */
interface MarketplaceEntry {
  source: {
    source: "url" | "github" | "git" | "npm" | "file" | "directory";
    repo?: string;
    url?: string;
    path?: string;
  };
  installLocation: string;
  lastUpdated: string;
}

interface KnownMarketplaces {
  [key: string]: MarketplaceEntry;
}

interface PluginInstallation {
  scope: "user" | "project";
  projectPath?: string;
  installPath: string;
  version: string;
  installedAt: string;
  lastUpdated: string;
  isLocal?: boolean;
  gitCommitSha?: string;
}

interface PluginRegistry {
  version: number;
  plugins: Record<string, PluginInstallation[]>;
}

interface Settings {
  enabledPlugins?: Record<string, boolean>;
  [key: string]: unknown;
}

/**
 * Check if running in compiled binary mode
 *
 * This function uses multiple signals to distinguish between:
 * 1. Compiled standalone binary (return true) - can self-update via GitHub Releases
 * 2. npm installed package (return false) - update via npm
 * 3. Development mode (return false) - no embedded plugins
 *
 * Detection logic:
 * - Must have embedded plugins (compiled binaries have these bundled)
 * - Must NOT be running via a known runtime (node, bun, deno)
 * - Must NOT have runtime manager paths in execPath (.nvm, .fnm, .bun, etc.)
 *
 * @returns true if running as compiled standalone binary, false otherwise
 */
export function isCompiledBinary(): boolean {
  // 1. Must have embedded plugins - compiled binaries have these bundled
  if (Object.keys(EMBEDDED_PLUGINS).length === 0) {
    return false;
  }

  // 2. Check if process.execPath is a known runtime
  // When running via npm/npx, execPath will be node/bun/deno
  const execPath = process.execPath.toLowerCase();
  const basename = execPath.split(/[/\\]/).pop() || "";

  // Known runtime executables - if we're running via these, it's not a compiled binary
  const runtimes = ["node", "node.exe", "bun", "bun.exe", "deno", "deno.exe"];
  if (runtimes.includes(basename)) {
    return false;
  }

  // 3. Additional path-based check for runtime managers
  // These paths indicate npm/version manager installs, not compiled binaries
  const runtimePaths = [".nvm", ".fnm", ".bun", "nodejs", "node_modules"];
  if (runtimePaths.some((p) => execPath.includes(p))) {
    return false;
  }

  // All checks passed - this is a compiled binary
  return true;
}

/**
 * Check if embedded plugins are available
 *
 * This is true for both compiled binaries AND npm installed packages
 * that have been built with the plugins embedded.
 *
 * Use this function to check if install/uninstall commands are available,
 * rather than isCompiledBinary() which is only true for standalone binaries.
 *
 * @returns true if embedded plugins are available
 */
export function hasEmbeddedPlugins(): boolean {
  return Object.keys(EMBEDDED_PLUGINS).length > 0;
}

/**
 * Read known marketplaces registry
 */
function readKnownMarketplaces(): KnownMarketplaces {
  const knownMarketplacesFile = getKnownMarketplacesFile();
  if (!existsSync(knownMarketplacesFile)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(knownMarketplacesFile, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Write known marketplaces registry
 */
function writeKnownMarketplaces(marketplaces: KnownMarketplaces): void {
  const knownMarketplacesFile = getKnownMarketplacesFile();
  const dir = dirname(knownMarketplacesFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(knownMarketplacesFile, JSON.stringify(marketplaces, null, 2), "utf-8");
}

/**
 * Read installed plugins registry
 */
function readInstalledPlugins(): PluginRegistry {
  const installedPluginsFile = getInstalledPluginsFile();
  if (!existsSync(installedPluginsFile)) {
    return { version: 2, plugins: {} };
  }
  try {
    return JSON.parse(readFileSync(installedPluginsFile, "utf-8"));
  } catch {
    return { version: 2, plugins: {} };
  }
}

/**
 * Write installed plugins registry
 */
function writeInstalledPlugins(registry: PluginRegistry): void {
  const installedPluginsFile = getInstalledPluginsFile();
  const dir = dirname(installedPluginsFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(installedPluginsFile, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Read settings
 */
function readSettings(): Settings {
  const settingsFile = getSettingsFile();
  if (!existsSync(settingsFile)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(settingsFile, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Write settings
 */
function writeSettings(settings: Settings): void {
  const settingsFile = getSettingsFile();
  const dir = dirname(settingsFile);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(settingsFile, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Check if marketplace is registered
 */
export function isMarketplaceRegistered(): boolean {
  const marketplaces = readKnownMarketplaces();
  return MARKETPLACE_NAME in marketplaces;
}

/**
 * Check if plugin is installed
 */
export function isPluginInstalled(): boolean {
  const registry = readInstalledPlugins();
  const installations = registry.plugins[PLUGIN_KEY];
  return !!(installations && installations.length > 0);
}

/**
 * Check if plugin is enabled
 */
export function isPluginEnabled(): boolean {
  const settings = readSettings();
  return settings.enabledPlugins?.[PLUGIN_KEY] === true;
}

/**
 * Get installation info
 */
export function getPluginInstallInfo(): {
  marketplaceDir: string;
  bundledVersion: string;
  isMarketplaceRegistered: boolean;
  isPluginInstalled: boolean;
  isPluginEnabled: boolean;
  installedVersion: string | null;
} {
  const registry = readInstalledPlugins();
  const installations = registry.plugins[PLUGIN_KEY];
  const userInstall = installations?.find(i => i.scope === "user");

  return {
    marketplaceDir: getLocalMarketplaceDir(),
    bundledVersion: EMBEDDED_PLUGINS_VERSION,
    isMarketplaceRegistered: isMarketplaceRegistered(),
    isPluginInstalled: isPluginInstalled(),
    isPluginEnabled: isPluginEnabled(),
    installedVersion: userInstall?.version || null,
  };
}

/**
 * Install embedded plugin files to local marketplace directory
 */
function installMarketplaceFiles(): void {
  const localMarketplaceDir = getLocalMarketplaceDir();
  // Create marketplace directory structure
  if (!existsSync(localMarketplaceDir)) {
    mkdirSync(localMarketplaceDir, { recursive: true });
  }

  // Create .claude-plugin directory
  const pluginConfigDir = join(localMarketplaceDir, ".claude-plugin");
  if (!existsSync(pluginConfigDir)) {
    mkdirSync(pluginConfigDir, { recursive: true });
  }

  // Create plugins/agent-foreman directory
  const pluginDir = join(localMarketplaceDir, "plugins", PLUGIN_NAME);
  if (!existsSync(pluginDir)) {
    mkdirSync(pluginDir, { recursive: true });
  }

  // Write marketplace.json
  const marketplaceJson = {
    name: MARKETPLACE_NAME,
    owner: {
      name: "Lukin",
      email: "mylukin@gmail.com",
      url: "https://github.com/mylukin"
    },
    metadata: {
      description: "Long Task Harness for AI agents - feature-driven development with external memory",
      version: EMBEDDED_PLUGINS_VERSION
    },
    plugins: [
      {
        name: PLUGIN_NAME,
        source: `./plugins/${PLUGIN_NAME}`,
        description: "Long Task Harness providing external memory, feature-driven workflow, and clean agent handoffs",
        version: EMBEDDED_PLUGINS_VERSION,
        author: {
          name: "Lukin",
          url: "https://github.com/mylukin"
        },
        homepage: "https://github.com/mylukin/agent-foreman",
        repository: "https://github.com/mylukin/agent-foreman",
        license: "MIT",
        keywords: [
          "long-task",
          "harness",
          "feature-driven",
          "agent-memory",
          "handoff",
          "ai-agent",
          "claude-code"
        ],
        agents: [
          "./agents/foreman.md",
          "./agents/pm.md",
          "./agents/ux.md",
          "./agents/tech.md",
          "./agents/qa.md",
          "./agents/breakdown-writer.md",
          "./agents/implementer.md"
        ],
        skills: [
          "./skills/project-analyze",
          "./skills/init-harness",
          "./skills/feature-next",
          "./skills/feature-run",
          "./skills/foreman-spec"
        ]
      }
    ]
  };
  writeFileSync(join(pluginConfigDir, "marketplace.json"), JSON.stringify(marketplaceJson, null, 2), "utf-8");

  // Write embedded plugin files
  for (const [relativePath, content] of Object.entries(EMBEDDED_PLUGINS)) {
    // Only install files under agent-foreman/
    if (!relativePath.startsWith(`${PLUGIN_NAME}/`)) {
      continue;
    }

    // Path: plugins/agent-foreman/{rest}
    const targetRelativePath = relativePath.substring(PLUGIN_NAME.length + 1);
    const targetPath = join(pluginDir, targetRelativePath);

    // Ensure directory exists
    const targetDirPath = dirname(targetPath);
    if (!existsSync(targetDirPath)) {
      mkdirSync(targetDirPath, { recursive: true });
    }

    // Write file
    writeFileSync(targetPath, content, "utf-8");
  }
}

/**
 * Register marketplace in known_marketplaces.json
 */
function registerMarketplace(): void {
  const localMarketplaceDir = getLocalMarketplaceDir();
  const marketplaces = readKnownMarketplaces();
  const now = new Date().toISOString();

  marketplaces[MARKETPLACE_NAME] = {
    source: {
      source: "directory",
      path: localMarketplaceDir
    },
    installLocation: localMarketplaceDir,
    lastUpdated: now
  };

  writeKnownMarketplaces(marketplaces);
}

/**
 * Install plugin to cache and register in installed_plugins_v2.json
 */
function installPlugin(): void {
  const localMarketplaceDir = getLocalMarketplaceDir();
  const cacheDir = join(getCacheDir(), MARKETPLACE_NAME, PLUGIN_NAME, EMBEDDED_PLUGINS_VERSION);

  // Create cache directory
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  // Copy plugin files from marketplace to cache
  const sourcePluginDir = join(localMarketplaceDir, "plugins", PLUGIN_NAME);
  if (existsSync(sourcePluginDir)) {
    cpSync(sourcePluginDir, cacheDir, { recursive: true });
  }

  // Register in installed_plugins_v2.json
  const registry = readInstalledPlugins();
  const now = new Date().toISOString();

  const newInstallation: PluginInstallation = {
    scope: "user",
    installPath: cacheDir,
    version: EMBEDDED_PLUGINS_VERSION,
    installedAt: now,
    lastUpdated: now,
    isLocal: true
  };

  // Replace existing user-scope installation or add new one
  const existingInstalls = registry.plugins[PLUGIN_KEY] || [];
  const filteredInstalls = existingInstalls.filter(i => i.scope !== "user");
  registry.plugins[PLUGIN_KEY] = [newInstallation, ...filteredInstalls];

  writeInstalledPlugins(registry);
}

/**
 * Enable plugin in settings.json
 */
function enablePlugin(): void {
  const settings = readSettings();

  if (!settings.enabledPlugins) {
    settings.enabledPlugins = {};
  }

  settings.enabledPlugins[PLUGIN_KEY] = true;

  writeSettings(settings);
}

/**
 * Full installation: marketplace + plugin + enable
 */
export function fullInstall(): void {
  // Step 1: Install marketplace files
  installMarketplaceFiles();

  // Step 2: Register marketplace
  registerMarketplace();

  // Step 3: Install plugin to cache
  installPlugin();

  // Step 4: Enable plugin
  enablePlugin();
}

/**
 * Uninstall: remove from all registries
 */
export function fullUninstall(): void {
  // Step 1: Disable plugin in settings
  const settings = readSettings();
  if (settings.enabledPlugins) {
    delete settings.enabledPlugins[PLUGIN_KEY];
    writeSettings(settings);
  }

  // Step 2: Remove from installed_plugins_v2.json
  const registry = readInstalledPlugins();
  if (registry.plugins[PLUGIN_KEY]) {
    delete registry.plugins[PLUGIN_KEY];
    writeInstalledPlugins(registry);
  }

  // Step 3: Remove from known_marketplaces.json
  const marketplaces = readKnownMarketplaces();
  if (marketplaces[MARKETPLACE_NAME]) {
    delete marketplaces[MARKETPLACE_NAME];
    writeKnownMarketplaces(marketplaces);
  }

  // Step 4: Remove cache directory
  const cacheDir = join(getCacheDir(), MARKETPLACE_NAME);
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }

  // Step 5: Remove marketplace directory
  const localMarketplaceDir = getLocalMarketplaceDir();
  if (existsSync(localMarketplaceDir)) {
    rmSync(localMarketplaceDir, { recursive: true, force: true });
  }
}

/**
 * Check and auto-install/update on CLI startup (for compiled binary)
 * This is silent and non-intrusive
 *
 * Behavior:
 * - First run: install marketplace and plugin
 * - Upgrade: if bundled version > installed version, update plugin files
 * - Also updates project-level .claude/rules/ if they exist
 */
export async function checkAndInstallPlugins(): Promise<void> {
  // Skip if not in compiled mode
  if (!isCompiledBinary()) {
    return;
  }

  // Check if marketplace is already registered
  if (isMarketplaceRegistered()) {
    // Already installed - check if update is needed
    const info = getPluginInstallInfo();
    const installedVersion = info.installedVersion || "0.0.0";
    const bundledVersion = info.bundledVersion;

    // Compare versions: if bundled > installed, update
    if (compareVersions(bundledVersion, installedVersion) > 0) {
      console.log(chalk.cyan(`Updating agent-foreman plugin (${installedVersion} → ${bundledVersion})...`));
      try {
        fullInstall();
        console.log(chalk.green("✓ Plugin updated"));

        // Also update project rules if they exist
        await updateProjectRulesIfExists();

        console.log(chalk.gray("  Restart Claude Code to use the updated plugin\n"));
      } catch (error) {
        console.warn(
          chalk.yellow(`⚠ Failed to update plugin: ${error instanceof Error ? error.message : error}`)
        );
      }
    }
    return;
  }

  // First run: silently install marketplace
  console.log(chalk.cyan("Registering agent-foreman plugin marketplace..."));
  try {
    fullInstall();
    console.log(chalk.green("✓ Plugin installed and enabled"));
    console.log(chalk.gray("  Restart Claude Code to use the plugin\n"));
  } catch (error) {
    console.warn(
      chalk.yellow(`⚠ Failed to install plugin: ${error instanceof Error ? error.message : error}`)
    );
  }
}

/**
 * Update project-level .claude/rules/ if they already exist
 * This is called during auto-update to keep project rules in sync
 */
async function updateProjectRulesIfExists(): Promise<void> {
  const cwd = process.cwd();

  // Only update if rules already exist (project has been initialized)
  if (!hasRulesInstalled(cwd)) {
    return;
  }

  try {
    const result = await copyRulesToProject(cwd, { force: true });
    if (result.created > 0) {
      console.log(chalk.green(`✓ Updated ${result.created} project rules`));
    }
  } catch {
    // Silent failure for auto-update - non-critical
  }
}
