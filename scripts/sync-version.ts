#!/usr/bin/env bun
/**
 * Version Sync Script
 *
 * Synchronizes version numbers across all config files:
 * - package.json (source of truth, updated by npm version)
 * - .claude-plugin/marketplace.json (metadata.version + plugins[0].version)
 * - plugins/agent-foreman/.claude-plugin/plugin.json (version)
 *
 * Usage:
 *   bun scripts/sync-version.ts           # Sync from package.json
 *   bun scripts/sync-version.ts 0.1.87    # Sync specific version
 *
 * Lifecycle:
 *   npm version patch → triggers "version" hook → this script runs
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT_DIR = join(import.meta.dirname, "..");

const FILES = {
  packageJson: join(ROOT_DIR, "package.json"),
  marketplaceJson: join(ROOT_DIR, ".claude-plugin/marketplace.json"),
  pluginJson: join(ROOT_DIR, "plugins/agent-foreman/.claude-plugin/plugin.json"),
};

/**
 * Read and parse JSON file
 */
function readJson(filePath: string): Record<string, unknown> {
  const content = readFileSync(filePath, "utf-8");
  return JSON.parse(content);
}

/**
 * Write JSON file with consistent formatting
 */
function writeJson(filePath: string, data: Record<string, unknown>): void {
  const content = JSON.stringify(data, null, 2) + "\n";
  writeFileSync(filePath, content, "utf-8");
}

/**
 * Get version from package.json or CLI argument
 */
function getVersion(): string {
  // Check CLI argument first
  const cliVersion = process.argv[2];
  if (cliVersion && /^\d+\.\d+\.\d+/.test(cliVersion)) {
    return cliVersion;
  }

  // Read from package.json
  const pkg = readJson(FILES.packageJson);
  return pkg.version as string;
}

/**
 * Update marketplace.json
 */
function updateMarketplace(version: string): void {
  const data = readJson(FILES.marketplaceJson);

  // Update metadata.version
  if (data.metadata && typeof data.metadata === "object") {
    (data.metadata as Record<string, unknown>).version = version;
  }

  // Update plugins[0].version
  if (Array.isArray(data.plugins) && data.plugins.length > 0) {
    (data.plugins[0] as Record<string, unknown>).version = version;
  }

  writeJson(FILES.marketplaceJson, data);
  console.log(`  ✓ ${FILES.marketplaceJson}`);
}

/**
 * Update plugin.json
 */
function updatePlugin(version: string): void {
  const data = readJson(FILES.pluginJson);
  data.version = version;
  writeJson(FILES.pluginJson, data);
  console.log(`  ✓ ${FILES.pluginJson}`);
}

/**
 * Main entry point
 */
function main(): void {
  const version = getVersion();
  console.log(`Syncing version: ${version}`);

  try {
    updateMarketplace(version);
    updatePlugin(version);
    console.log("\nVersion sync complete!");
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }
}

main();
