#!/usr/bin/env node
/**
 * Postinstall script to install agent-foreman plugin to ~/.claude/
 *
 * This script runs automatically after npm install to:
 * 1. Copy slash commands to ~/.claude/commands/
 * 2. Create symlink for plugin in ~/.claude/plugins/
 */

import { promises as fs } from "fs";
import { homedir } from "os";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const COMMAND_FILES = [
  "foreman-survey.md",
  "foreman-init.md",
  "foreman-step.md",
];

async function installCommands() {
  const claudeCommandsDir = join(homedir(), ".claude", "commands");
  const sourceDir = join(__dirname, "..", "plugins", "agent-foreman", "commands");

  // Create ~/.claude/commands/ if it doesn't exist
  await fs.mkdir(claudeCommandsDir, { recursive: true });

  let installed = 0;
  let skipped = 0;

  for (const file of COMMAND_FILES) {
    const sourcePath = join(sourceDir, file);
    const destPath = join(claudeCommandsDir, file);

    try {
      // Check if source file exists
      await fs.access(sourcePath);

      // Check if destination already exists
      try {
        await fs.access(destPath);
        // File exists, skip it
        skipped++;
        continue;
      } catch {
        // File doesn't exist, copy it
      }

      await fs.copyFile(sourcePath, destPath);
      installed++;
    } catch {
      // Source file doesn't exist, skip silently
      continue;
    }
  }

  return { installed, skipped };
}

async function installPlugin() {
  const claudePluginsDir = join(homedir(), ".claude", "plugins");
  const pluginSource = join(__dirname, "..", "plugins", "agent-foreman");
  const pluginDest = join(claudePluginsDir, "agent-foreman");

  // Create ~/.claude/plugins/ if it doesn't exist
  await fs.mkdir(claudePluginsDir, { recursive: true });

  // Check if plugin already exists
  try {
    const stats = await fs.lstat(pluginDest);
    if (stats.isSymbolicLink() || stats.isDirectory()) {
      return { installed: false, reason: "already exists" };
    }
  } catch {
    // Doesn't exist, proceed to create
  }

  // Create symlink to plugin directory
  try {
    await fs.symlink(pluginSource, pluginDest, "dir");
    return { installed: true };
  } catch (err) {
    // If symlink fails, try copying the directory
    try {
      await copyDir(pluginSource, pluginDest);
      return { installed: true, method: "copy" };
    } catch {
      return { installed: false, reason: err.message };
    }
  }
}

async function copyDir(src, dest) {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = join(src, entry.name);
    const destPath = join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

async function main() {
  try {
    // Install commands
    const cmdResult = await installCommands();

    if (cmdResult.installed > 0) {
      console.log(
        `\n✓ Installed ${cmdResult.installed} foreman command${cmdResult.installed > 1 ? "s" : ""} to ~/.claude/commands/`
      );
      console.log("  Available commands: /foreman-survey, /foreman-init, /foreman-step");
    } else if (cmdResult.skipped > 0) {
      console.log("\n✓ Foreman commands already installed");
    }

    // Install plugin
    const pluginResult = await installPlugin();

    if (pluginResult.installed) {
      console.log("✓ Installed agent-foreman plugin to ~/.claude/plugins/");
      console.log("  Plugin provides: foreman agent, skills (project-survey, init-harness, feature-step)");
    } else if (pluginResult.reason === "already exists") {
      console.log("✓ Agent-foreman plugin already installed");
    } else {
      console.warn(`⚠ Could not install plugin: ${pluginResult.reason}`);
    }

    console.log("\n  Run 'agent-foreman --help' to get started");
  } catch (err) {
    // Don't fail npm install on errors
    console.warn("\n⚠ Could not complete installation:", err.message);
    console.warn("  Run 'agent-foreman install-commands' to install manually");
  }
}

main();
