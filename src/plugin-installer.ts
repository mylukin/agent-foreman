/**
 * Plugin Auto-Installer
 *
 * Automatically installs/updates bundled plugins to ~/.claude/plugins/
 * when running from a compiled binary.
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { createInterface } from "node:readline";
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

const CLAUDE_PLUGINS_DIR = join(homedir(), ".claude", "plugins");
const PLUGIN_NAME = "agent-foreman";
const TARGET_DIR = join(CLAUDE_PLUGINS_DIR, PLUGIN_NAME);
const VERSION_FILE = join(TARGET_DIR, ".version");

/**
 * Check if running in compiled binary mode
 */
export function isCompiledBinary(): boolean {
  // In compiled mode, we'll have embedded plugins
  return Object.keys(EMBEDDED_PLUGINS).length > 0;
}

/**
 * Get installed plugin version
 */
function getInstalledVersion(): string | null {
  if (!existsSync(VERSION_FILE)) {
    return null;
  }
  try {
    return readFileSync(VERSION_FILE, "utf-8").trim();
  } catch {
    return null;
  }
}

/**
 * Prompt user for confirmation (Y/n)
 */
async function promptConfirm(message: string): Promise<boolean> {
  // Check for non-interactive mode
  if (process.env.CI || process.env.NO_PLUGIN_UPDATE || !process.stdin.isTTY) {
    return false;
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} [Y/n]: `, (answer) => {
      rl.close();
      const normalized = answer.trim().toLowerCase();
      resolve(normalized === "" || normalized === "y" || normalized === "yes");
    });
  });
}

/**
 * Install plugins to target directory
 */
function installPlugins(): void {
  // Create target directory
  if (!existsSync(TARGET_DIR)) {
    mkdirSync(TARGET_DIR, { recursive: true });
  }

  // Write each plugin file
  for (const [relativePath, content] of Object.entries(EMBEDDED_PLUGINS)) {
    // Only install files under agent-foreman/
    if (!relativePath.startsWith(`${PLUGIN_NAME}/`)) {
      continue;
    }

    // Remove the plugin name prefix (e.g., "agent-foreman/commands/foo.md" -> "commands/foo.md")
    const targetRelativePath = relativePath.substring(PLUGIN_NAME.length + 1);
    const targetPath = join(TARGET_DIR, targetRelativePath);

    // Ensure directory exists
    const targetDirPath = dirname(targetPath);
    if (!existsSync(targetDirPath)) {
      mkdirSync(targetDirPath, { recursive: true });
    }

    // Write file
    writeFileSync(targetPath, content, "utf-8");
  }

  // Write version file
  writeFileSync(VERSION_FILE, EMBEDDED_PLUGINS_VERSION, "utf-8");
}

/**
 * Check and install/update plugins
 * Called on CLI startup
 */
export async function checkAndInstallPlugins(): Promise<void> {
  // Skip if not in compiled mode
  if (!isCompiledBinary()) {
    return;
  }

  const installedVersion = getInstalledVersion();

  // Case 1: No plugins installed (first run)
  if (installedVersion === null) {
    console.log(chalk.cyan("Installing agent-foreman plugin..."));
    try {
      installPlugins();
      console.log(chalk.green("✓ Plugins installed successfully\n"));
    } catch (error) {
      console.warn(
        chalk.yellow(`⚠ Failed to install plugins: ${error instanceof Error ? error.message : error}`)
      );
      console.warn(chalk.yellow("  CLI will continue without plugin installation.\n"));
    }
    return;
  }

  // Case 2: Same version (skip silently)
  if (installedVersion === EMBEDDED_PLUGINS_VERSION) {
    return;
  }

  // Case 3: Different version (prompt user)
  console.log(
    chalk.cyan(`New plugin version available (${installedVersion} → ${EMBEDDED_PLUGINS_VERSION})`)
  );

  const shouldUpdate = await promptConfirm("Update plugins?");

  if (shouldUpdate) {
    try {
      installPlugins();
      console.log(chalk.green("✓ Plugins updated successfully\n"));
    } catch (error) {
      console.warn(
        chalk.yellow(`⚠ Failed to update plugins: ${error instanceof Error ? error.message : error}`)
      );
    }
  } else {
    console.log(chalk.gray("Skipping plugin update.\n"));
  }
}
