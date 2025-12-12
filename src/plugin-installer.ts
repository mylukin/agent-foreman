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

// These imports will be available after running embed-assets.ts
// For development, we provide fallback behavior
let EMBEDDED_PLUGINS: Record<string, string> = {};
let EMBEDDED_PLUGINS_VERSION = "0.0.0";

try {
  const embedded = await import("./plugins-bundle.generated.js");
  EMBEDDED_PLUGINS = embedded.EMBEDDED_PLUGINS;
  EMBEDDED_PLUGINS_VERSION = embedded.EMBEDDED_PLUGINS_VERSION;
} catch {
  // Not in compiled mode or generated file doesn't exist
}

// Claude Code plugin structure
const CLAUDE_DIR = join(homedir(), ".claude");
const CLAUDE_PLUGINS_DIR = join(CLAUDE_DIR, "plugins");
const KNOWN_MARKETPLACES_FILE = join(CLAUDE_PLUGINS_DIR, "known_marketplaces.json");
const INSTALLED_PLUGINS_FILE = join(CLAUDE_PLUGINS_DIR, "installed_plugins_v2.json");
const SETTINGS_FILE = join(CLAUDE_DIR, "settings.json");
const MARKETPLACES_DIR = join(CLAUDE_PLUGINS_DIR, "marketplaces");
const CACHE_DIR = join(CLAUDE_PLUGINS_DIR, "cache");

const MARKETPLACE_NAME = "agent-foreman-plugins";
const PLUGIN_NAME = "agent-foreman";
const PLUGIN_KEY = `${PLUGIN_NAME}@${MARKETPLACE_NAME}`;

// Local marketplace directory (where we install embedded files)
const LOCAL_MARKETPLACE_DIR = join(MARKETPLACES_DIR, MARKETPLACE_NAME);

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
 * This checks multiple signals to determine if we're running as a compiled
 * Bun binary vs npm/node execution:
 *
 * 1. Must have embedded plugins (packaged at build time)
 * 2. process.execPath must NOT be a known runtime (node, bun, etc.)
 *
 * The second check is crucial because npm installs can also have embedded
 * plugins, but they run via the node runtime.
 */
export function isCompiledBinary(): boolean {
  // Must have embedded plugins
  if (Object.keys(EMBEDDED_PLUGINS).length === 0) {
    return false;
  }

  // Check if process.execPath is a known runtime
  // For npm installs, execPath is node/bun runtime
  // For compiled binaries, execPath IS the binary itself
  const execPath = process.execPath.toLowerCase();
  const basename = execPath.split(/[/\\]/).pop() || "";

  // Known runtime executables that indicate npm/node execution
  const runtimes = ["node", "node.exe", "bun", "bun.exe", "deno", "deno.exe"];

  if (runtimes.includes(basename)) {
    return false;
  }

  // Additional check: if path contains .nvm, .fnm, .bun, nodejs - it's a runtime
  const runtimePaths = [".nvm", ".fnm", ".bun", "nodejs", "node_modules"];
  if (runtimePaths.some((p) => execPath.includes(p))) {
    return false;
  }

  return true;
}

/**
 * Check if embedded plugins are available
 *
 * This is true for both compiled binaries AND npm installed packages
 * that have been built with the plugins embedded.
 */
export function hasEmbeddedPlugins(): boolean {
  return Object.keys(EMBEDDED_PLUGINS).length > 0;
}

/**
 * Read known marketplaces registry
 */
function readKnownMarketplaces(): KnownMarketplaces {
  if (!existsSync(KNOWN_MARKETPLACES_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(KNOWN_MARKETPLACES_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Write known marketplaces registry
 */
function writeKnownMarketplaces(marketplaces: KnownMarketplaces): void {
  const dir = dirname(KNOWN_MARKETPLACES_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(KNOWN_MARKETPLACES_FILE, JSON.stringify(marketplaces, null, 2), "utf-8");
}

/**
 * Read installed plugins registry
 */
function readInstalledPlugins(): PluginRegistry {
  if (!existsSync(INSTALLED_PLUGINS_FILE)) {
    return { version: 2, plugins: {} };
  }
  try {
    return JSON.parse(readFileSync(INSTALLED_PLUGINS_FILE, "utf-8"));
  } catch {
    return { version: 2, plugins: {} };
  }
}

/**
 * Write installed plugins registry
 */
function writeInstalledPlugins(registry: PluginRegistry): void {
  const dir = dirname(INSTALLED_PLUGINS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(INSTALLED_PLUGINS_FILE, JSON.stringify(registry, null, 2), "utf-8");
}

/**
 * Read settings
 */
function readSettings(): Settings {
  if (!existsSync(SETTINGS_FILE)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(SETTINGS_FILE, "utf-8"));
  } catch {
    return {};
  }
}

/**
 * Write settings
 */
function writeSettings(settings: Settings): void {
  const dir = dirname(SETTINGS_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2), "utf-8");
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
  return Boolean(installations && installations.length > 0);
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
    marketplaceDir: LOCAL_MARKETPLACE_DIR,
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
  // Create marketplace directory structure
  if (!existsSync(LOCAL_MARKETPLACE_DIR)) {
    mkdirSync(LOCAL_MARKETPLACE_DIR, { recursive: true });
  }

  // Create .claude-plugin directory
  const pluginConfigDir = join(LOCAL_MARKETPLACE_DIR, ".claude-plugin");
  if (!existsSync(pluginConfigDir)) {
    mkdirSync(pluginConfigDir, { recursive: true });
  }

  // Create plugins/agent-foreman directory
  const pluginDir = join(LOCAL_MARKETPLACE_DIR, "plugins", PLUGIN_NAME);
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
        agents: ["./agents/foreman.md"],
        skills: [
          "./skills/project-analyze",
          "./skills/init-harness",
          "./skills/feature-next",
          "./skills/feature-run"
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
  const marketplaces = readKnownMarketplaces();
  const now = new Date().toISOString();

  marketplaces[MARKETPLACE_NAME] = {
    source: {
      source: "directory",
      path: LOCAL_MARKETPLACE_DIR
    },
    installLocation: LOCAL_MARKETPLACE_DIR,
    lastUpdated: now
  };

  writeKnownMarketplaces(marketplaces);
}

/**
 * Install plugin to cache and register in installed_plugins_v2.json
 */
function installPlugin(): void {
  const cacheDir = join(CACHE_DIR, MARKETPLACE_NAME, PLUGIN_NAME, EMBEDDED_PLUGINS_VERSION);

  // Create cache directory
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true });
  }

  // Copy plugin files from marketplace to cache
  const sourcePluginDir = join(LOCAL_MARKETPLACE_DIR, "plugins", PLUGIN_NAME);
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
  const cacheDir = join(CACHE_DIR, MARKETPLACE_NAME);
  if (existsSync(cacheDir)) {
    rmSync(cacheDir, { recursive: true, force: true });
  }

  // Step 5: Remove marketplace directory
  if (existsSync(LOCAL_MARKETPLACE_DIR)) {
    rmSync(LOCAL_MARKETPLACE_DIR, { recursive: true, force: true });
  }
}

/**
 * Check and auto-install on CLI startup (for compiled binary)
 * This is silent and non-intrusive
 */
export async function checkAndInstallPlugins(): Promise<void> {
  // Skip if not in compiled mode
  if (!isCompiledBinary()) {
    return;
  }

  // Skip if marketplace is already registered (user can manage via /plugin)
  if (isMarketplaceRegistered()) {
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
