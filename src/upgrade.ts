/**
 * Auto-upgrade utility for agent-foreman
 * Checks npm registry for newer versions and prompts user for upgrade
 */

import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import { readFileSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import * as readline from "node:readline";
import chalk from "chalk";
import { isCompiledBinary } from "./plugin-installer.js";
import {
  fetchLatestGitHubVersion,
  performBinaryUpgrade,
  canWriteToExecutable,
} from "./binary-upgrade.js";

const PACKAGE_NAME = "agent-foreman";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_FILE = ".agent-foreman-upgrade-check";
const PLUGIN_DIR = ".claude/plugins/marketplaces/agent-foreman";

// Try to import embedded version (available in compiled binary)
let EMBEDDED_VERSION: string | null = null;
try {
  const embedded = await import("./version.generated.js");
  EMBEDDED_VERSION = embedded.EMBEDDED_VERSION;
} catch {
  // Not in compiled mode or generated file doesn't exist
}

export interface UpgradeCheckResult {
  needsUpgrade: boolean;
  currentVersion: string;
  latestVersion: string | null;
  error?: string;
}

export interface UpgradeResult {
  success: boolean;
  fromVersion: string;
  toVersion: string;
  error?: string;
}

/**
 * Get the cache file path in user's home directory
 */
function getCacheFilePath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return path.join(homeDir, CACHE_FILE);
}

/**
 * Get the plugin directory path in user's home directory
 */
function getPluginDirPath(): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || "/tmp";
  return path.join(homeDir, PLUGIN_DIR);
}

/**
 * Get the current package version from package.json
 * Uses embedded version in compiled binary, falls back to package.json
 */
export function getCurrentVersion(): string {
  // Try embedded version first (compiled binary mode)
  if (EMBEDDED_VERSION) {
    return EMBEDDED_VERSION;
  }

  // Fall back to package.json (development mode)
  try {
    // Get the directory of this module
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const pkgPath = path.join(__dirname, "..", "package.json");
    // Use fs import instead of require() for ESM compatibility
    const pkgContent = readFileSync(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);
    return pkg.version || "0.0.0";
  } catch {
    return "0.0.0";
  }
}

/**
 * Check if we should perform an upgrade check based on throttle interval
 */
async function shouldCheckForUpgrade(): Promise<boolean> {
  try {
    const cacheFile = getCacheFilePath();
    const stat = await fs.stat(cacheFile);
    const lastCheck = stat.mtime.getTime();
    const now = Date.now();
    return now - lastCheck >= CHECK_INTERVAL_MS;
  } catch {
    // Cache file doesn't exist, should check
    return true;
  }
}

/**
 * Update the last check timestamp
 */
async function updateLastCheckTime(): Promise<void> {
  try {
    const cacheFile = getCacheFilePath();
    await fs.writeFile(cacheFile, new Date().toISOString());
  } catch {
    // Ignore write errors for cache file
  }
}

/**
 * Fetch the latest version from npm registry
 */
export async function fetchLatestVersion(): Promise<string | null> {
  return new Promise((resolve) => {
    try {
      const result = spawnSync("npm", ["view", PACKAGE_NAME, "version"], {
        encoding: "utf-8",
        timeout: 10000, // 10 second timeout
      });

      if (result.status === 0 && result.stdout) {
        resolve(result.stdout.trim());
      } else {
        resolve(null);
      }
    } catch {
      resolve(null);
    }
  });
}

/**
 * Compare two semantic version strings
 * Returns: 1 if v1 > v2, -1 if v1 < v2, 0 if equal
 */
export function compareVersions(v1: string, v2: string): number {
  const parts1 = v1.split(".").map((p) => parseInt(p, 10) || 0);
  const parts2 = v2.split(".").map((p) => parseInt(p, 10) || 0);

  // Pad arrays to same length
  const maxLen = Math.max(parts1.length, parts2.length);
  while (parts1.length < maxLen) parts1.push(0);
  while (parts2.length < maxLen) parts2.push(0);

  for (let i = 0; i < maxLen; i++) {
    if (parts1[i] > parts2[i]) return 1;
    if (parts1[i] < parts2[i]) return -1;
  }

  return 0;
}

/**
 * Check if an upgrade is available
 * Uses GitHub API for binary mode, npm registry for npm mode
 */
export async function checkForUpgrade(): Promise<UpgradeCheckResult> {
  const currentVersion = getCurrentVersion();
  const isBinary = isCompiledBinary();

  try {
    // Use GitHub API for binary, npm registry for npm install
    const latestVersion = isBinary
      ? await fetchLatestGitHubVersion()
      : await fetchLatestVersion();

    if (!latestVersion) {
      return {
        needsUpgrade: false,
        currentVersion,
        latestVersion: null,
        error: isBinary
          ? "Could not fetch latest version from GitHub"
          : "Could not fetch latest version from npm",
      };
    }

    const needsUpgrade = compareVersions(latestVersion, currentVersion) > 0;

    return {
      needsUpgrade,
      currentVersion,
      latestVersion,
    };
  } catch (err) {
    return {
      needsUpgrade: false,
      currentVersion,
      latestVersion: null,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Prompt user for yes/no confirmation
 */
async function promptUserConfirmation(message: string): Promise<boolean> {
  // Check if stdin is a TTY (interactive terminal)
  if (!process.stdin.isTTY) {
    // Non-interactive mode, skip prompt
    return false;
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(message, (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

/**
 * Check if Claude Code plugin directory exists
 */
async function pluginDirExists(): Promise<boolean> {
  try {
    const pluginDir = getPluginDirPath();
    await fs.access(pluginDir);
    return true;
  } catch {
    return false;
  }
}

/**
 * Update Claude Code plugin by git pull
 */
async function updatePlugin(): Promise<{ success: boolean; error?: string }> {
  const pluginDir = getPluginDirPath();

  try {
    // Check if plugin directory exists
    if (!(await pluginDirExists())) {
      return { success: true }; // No plugin to update, skip silently
    }

    // Check if it's a git repository
    const gitCheckResult = spawnSync("git", ["rev-parse", "--git-dir"], {
      cwd: pluginDir,
      encoding: "utf-8",
      timeout: 5000,
    });

    if (gitCheckResult.status !== 0) {
      return { success: true }; // Not a git repo, skip silently
    }

    // Perform git pull
    console.log(chalk.gray("  Updating Claude Code plugin..."));
    const pullResult = spawnSync("git", ["pull", "--ff-only"], {
      cwd: pluginDir,
      encoding: "utf-8",
      timeout: 30000,
    });

    if (pullResult.status !== 0) {
      return {
        success: false,
        error: pullResult.stderr || "Git pull failed",
      };
    }

    console.log(chalk.green("  ✓ Claude Code plugin updated"));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Perform npm global upgrade
 */
function performNpmUpgrade(): { success: boolean; error?: string } {
  try {
    console.log(chalk.gray("  Installing latest npm package..."));
    const result = spawnSync("npm", ["install", "-g", `${PACKAGE_NAME}@latest`], {
      encoding: "utf-8",
      timeout: 60000, // 60 second timeout
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      return {
        success: false,
        error: result.stderr || "npm install failed",
      };
    }

    console.log(chalk.green("  ✓ npm package updated"));
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}

/**
 * Perform full upgrade: npm package + Claude Code plugin
 * Routes to binary upgrade for compiled binaries, npm upgrade otherwise
 */
export async function performInteractiveUpgrade(
  currentVersion: string,
  latestVersion: string
): Promise<UpgradeResult> {
  // Binary mode: use GitHub releases
  if (isCompiledBinary()) {
    // Check write permissions
    if (!canWriteToExecutable()) {
      console.log(chalk.yellow("\n⚠ Cannot write to executable location."));
      console.log(chalk.gray("  Try running with elevated permissions or download manually:"));
      console.log(chalk.cyan("  https://github.com/mylukin/agent-foreman/releases/latest\n"));
      return {
        success: false,
        fromVersion: currentVersion,
        toVersion: latestVersion,
        error: "Insufficient permissions to update binary",
      };
    }

    const result = await performBinaryUpgrade(currentVersion, latestVersion);

    if (result.success) {
      // Update plugin after binary upgrade
      const pluginResult = await updatePlugin();
      if (!pluginResult.success) {
        console.log(chalk.yellow(`  ⚠ Plugin update failed: ${pluginResult.error}`));
      }
    }

    return {
      success: result.success,
      fromVersion: currentVersion,
      toVersion: latestVersion,
      error: result.error,
    };
  }

  // npm mode: existing logic
  console.log(chalk.blue("\n📦 Upgrading agent-foreman..."));

  // Step 1: Upgrade npm package
  const npmResult = performNpmUpgrade();
  if (!npmResult.success) {
    return {
      success: false,
      fromVersion: currentVersion,
      toVersion: latestVersion,
      error: `npm upgrade failed: ${npmResult.error}`,
    };
  }

  // Step 2: Update Claude Code plugin (if exists)
  const pluginResult = await updatePlugin();
  if (!pluginResult.success) {
    console.log(chalk.yellow(`  ⚠ Plugin update failed: ${pluginResult.error}`));
    // Don't fail the whole upgrade if plugin update fails
  }

  console.log(chalk.green(`\n✓ Upgraded from v${currentVersion} to v${latestVersion}`));

  return {
    success: true,
    fromVersion: currentVersion,
    toVersion: latestVersion,
  };
}

/**
 * Main interactive upgrade check function
 * Called on CLI startup, prompts user if upgrade is available
 */
export async function interactiveUpgradeCheck(): Promise<void> {
  try {
    // Check if we should check for upgrades (throttled)
    if (!(await shouldCheckForUpgrade())) {
      return;
    }

    // Update last check time
    await updateLastCheckTime();

    // Check for upgrade
    const result = await checkForUpgrade();

    if (!result.needsUpgrade || !result.latestVersion) {
      return;
    }

    // Show upgrade notification
    console.log(
      chalk.yellow(
        `\n⬆ New version available: v${result.currentVersion} → v${result.latestVersion}`
      )
    );

    // Prompt user for confirmation
    const confirmed = await promptUserConfirmation(
      chalk.cyan("  Do you want to upgrade now? (y/n): ")
    );

    const isBinary = isCompiledBinary();
    const manualUpgradeHint = isBinary
      ? "https://github.com/mylukin/agent-foreman/releases/latest"
      : "npm install -g agent-foreman@latest";

    if (confirmed) {
      const upgradeResult = await performInteractiveUpgrade(
        result.currentVersion,
        result.latestVersion
      );

      if (upgradeResult.success) {
        console.log(chalk.gray("  Run 'agent-foreman' again to use the new version.\n"));
        process.exit(0); // Exit after successful upgrade
      } else {
        console.log(chalk.red(`  Upgrade failed: ${upgradeResult.error}`));
        console.log(chalk.gray(`  You can manually upgrade: ${manualUpgradeHint}\n`));
      }
    } else {
      console.log(chalk.gray(`  Skipping upgrade. Manual upgrade: ${manualUpgradeHint}\n`));
    }
  } catch {
    // Silently ignore any errors during upgrade check
  }
}

/**
 * Force an upgrade check (ignoring throttle)
 * Returns the check result for display purposes
 */
export async function forceUpgradeCheck(): Promise<UpgradeCheckResult> {
  await updateLastCheckTime();
  return checkForUpgrade();
}
