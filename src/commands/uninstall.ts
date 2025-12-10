/**
 * Uninstall Command
 *
 * Remove the agent-foreman Claude Code plugin:
 * 1. Disable plugin in settings.json
 * 2. Remove from installed_plugins_v2.json
 * 3. Remove from known_marketplaces.json
 * 4. Delete cache and marketplace directories
 */

import chalk from "chalk";
import {
  fullUninstall,
  getPluginInstallInfo,
} from "../plugin-installer.js";

export async function runUninstall(): Promise<void> {
  const info = getPluginInstallInfo();

  console.log(chalk.cyan("Agent Foreman Plugin Uninstaller"));
  console.log(chalk.gray("─".repeat(40)));
  console.log();

  // Show current state
  console.log(chalk.white("Current Status:"));
  console.log(`  Marketplace: ${info.isMarketplaceRegistered ? chalk.green("✓ registered") : chalk.gray("not registered")}`);
  console.log(`  Plugin:      ${info.isPluginInstalled ? chalk.green(`✓ installed (${info.installedVersion})`) : chalk.gray("not installed")}`);
  console.log(`  Enabled:     ${info.isPluginEnabled ? chalk.green("✓ yes") : chalk.gray("no")}`);
  console.log();

  // Check if anything to uninstall
  if (!info.isMarketplaceRegistered && !info.isPluginInstalled && !info.isPluginEnabled) {
    console.log(chalk.gray("Nothing to uninstall - plugin is not installed."));
    console.log();
    console.log(chalk.white("To install the plugin:"));
    console.log(chalk.cyan("  agent-foreman install"));
    return;
  }

  // Perform uninstallation
  console.log(chalk.cyan("Uninstalling plugin..."));
  console.log();

  try {
    fullUninstall();

    console.log(chalk.green("✓ Plugin uninstalled successfully!"));
    console.log();
    console.log(chalk.white("Steps completed:"));
    if (info.isPluginEnabled) {
      console.log(chalk.gray("  • Disabled in settings.json"));
    }
    if (info.isPluginInstalled) {
      console.log(chalk.gray("  • Removed from installed_plugins_v2.json"));
      console.log(chalk.gray("  • Deleted plugin cache"));
    }
    if (info.isMarketplaceRegistered) {
      console.log(chalk.gray("  • Removed from known_marketplaces.json"));
      console.log(chalk.gray("  • Deleted marketplace files"));
    }
    console.log();
    console.log(chalk.yellow("⚡ Restart Claude Code to complete removal"));
  } catch (error) {
    console.error(chalk.red(`✗ Failed to uninstall plugin: ${error instanceof Error ? error.message : error}`));
    process.exit(1);
  }
}
