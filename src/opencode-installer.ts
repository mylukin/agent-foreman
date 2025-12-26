/**
 * OpenCode Plugin Installer
 *
 * Installs the agent-foreman plugin files into the current project's .opencode/ directory.
 * This allows any OpenCode project to use agent-foreman via:
 *   agent-foreman install --opencode
 */

import { existsSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import chalk from "chalk";

// Get the directory where this module is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Get the path to the plugin source files
 * Works both in development and after npm install
 */
function getPluginSourceDir(): string {
  // In compiled/installed mode, plugins are relative to the package
  const possiblePaths = [
    join(__dirname, "..", "plugins", "agent-foreman"),
    join(__dirname, "..", "..", "plugins", "agent-foreman"),
    join(process.cwd(), "plugins", "agent-foreman"),
  ];

  for (const p of possiblePaths) {
    if (existsSync(join(p, "opencode-plugin.js"))) {
      return p;
    }
  }

  throw new Error("Could not find plugin source files. Make sure agent-foreman is properly installed.");
}

/**
 * Install OpenCode plugin to the current project
 */
export async function installOpencodePlugin(targetDir: string = process.cwd()): Promise<{
  success: boolean;
  filesCreated: string[];
  error?: string;
}> {
  const filesCreated: string[] = [];

  try {
    const sourceDir = getPluginSourceDir();

    // Create .opencode directories
    const pluginDir = join(targetDir, ".opencode", "plugin");
    const commandDir = join(targetDir, ".opencode", "command");

    if (!existsSync(pluginDir)) {
      mkdirSync(pluginDir, { recursive: true });
    }
    if (!existsSync(commandDir)) {
      mkdirSync(commandDir, { recursive: true });
    }

    // Copy plugin file
    const pluginSource = join(sourceDir, "opencode-plugin.js");
    const pluginTarget = join(pluginDir, "agent-foreman.js");
    if (existsSync(pluginSource)) {
      const content = readFileSync(pluginSource, "utf-8");
      writeFileSync(pluginTarget, content, "utf-8");
      filesCreated.push(".opencode/plugin/agent-foreman.js");
    }

    // Copy command file
    const commandSource = join(sourceDir, "opencode", "command", "agent-foreman.md");
    const commandTarget = join(commandDir, "agent-foreman.md");
    if (existsSync(commandSource)) {
      const content = readFileSync(commandSource, "utf-8");
      writeFileSync(commandTarget, content, "utf-8");
      filesCreated.push(".opencode/command/agent-foreman.md");
    }

    // Create or update package.json in .opencode if needed for plugin dependencies
    const opencodePackageJson = join(targetDir, ".opencode", "package.json");
    if (!existsSync(opencodePackageJson)) {
      const packageContent = {
        name: "opencode-plugins",
        private: true,
        type: "module",
        dependencies: {
          "@opencode-ai/plugin": "latest",
        },
      };
      writeFileSync(opencodePackageJson, JSON.stringify(packageContent, null, 2), "utf-8");
      filesCreated.push(".opencode/package.json");
    }

    return { success: true, filesCreated };
  } catch (error) {
    return {
      success: false,
      filesCreated,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if OpenCode plugin is installed in the current project
 */
export function isOpencodePluginInstalled(targetDir: string = process.cwd()): boolean {
  const pluginPath = join(targetDir, ".opencode", "plugin", "agent-foreman.js");
  return existsSync(pluginPath);
}

/**
 * Run OpenCode plugin installation with CLI output
 */
export async function runOpencodeInstall(force: boolean = false): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.cyan("Agent Foreman OpenCode Plugin Installer"));
  console.log(chalk.gray("─".repeat(40)));
  console.log();

  // Check if already installed
  if (!force && isOpencodePluginInstalled(cwd)) {
    console.log(chalk.green("✓ OpenCode plugin is already installed"));
    console.log(chalk.gray("  Use --force to reinstall"));
    console.log();
    console.log(chalk.white("Installed files:"));
    console.log(chalk.gray("  .opencode/plugin/agent-foreman.js"));
    console.log(chalk.gray("  .opencode/command/agent-foreman.md"));
    return;
  }

  console.log(chalk.white("Installing OpenCode plugin to current project..."));
  console.log(chalk.gray(`  Target: ${cwd}`));
  console.log();

  const result = await installOpencodePlugin(cwd);

  if (result.success) {
    console.log(chalk.green("✓ OpenCode plugin installed successfully!"));
    console.log();
    console.log(chalk.white("Files created:"));
    for (const file of result.filesCreated) {
      console.log(chalk.gray(`  ${file}`));
    }
    console.log();
    console.log(chalk.white("Next steps:"));
    console.log(chalk.gray("  1. Install plugin dependencies:"));
    console.log(chalk.cyan("     cd .opencode && npm install"));
    console.log(chalk.gray("  2. Restart OpenCode to load the plugin"));
    console.log(chalk.gray("  3. Use /agent-foreman commands in your session"));
    console.log();
    console.log(chalk.white("Quick start:"));
    console.log(chalk.cyan("  /agent-foreman init \"your project goal\""));
    console.log(chalk.cyan("  /agent-foreman status"));
    console.log(chalk.cyan("  /agent-foreman run"));
  } else {
    console.error(chalk.red(`✗ Failed to install: ${result.error}`));
    process.exit(1);
  }
}
