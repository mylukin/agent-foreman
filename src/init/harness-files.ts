/**
 * Harness file generation orchestration
 *
 * This module generates:
 * - ai/init.sh - Project bootstrap/dev/check script
 * - .claude/rules/*.md - Modular rule files (loaded by Claude Code)
 * - CLAUDE.md - Minimal project-specific content
 * - ai/progress.log - Session handoff audit log
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import type { FeatureList, InitMode } from "../types/index.js";
import type { ExtendedCapabilities } from "../verifier/types/index.js";
import { detectCapabilities } from "../capabilities/index.js";
import { appendProgressLog, createInitEntry } from "../progress-log.js";
import { debugInit } from "../debug.js";
import type { aiResultToSurvey } from "../scanner/index.js";
import { generateOrMergeInitScript } from "./init-script-merge.js";
import { ensureComprehensiveGitignore } from "../gitignore/index.js";
import { copyRulesToProject, hasRulesInstalled } from "../rules/index.js";
import { generateMinimalClaudeMd, generateMinimalAgentsMd } from "../prompts.js";
import { createSpinner } from "../ui/index.js";

/**
 * Context object for init operations
 * Provides dependency injection for all harness generation steps
 */
export interface InitContext {
  cwd: string;
  goal: string;
  mode: InitMode;
  survey: ReturnType<typeof aiResultToSurvey>;
  featureList: FeatureList;
  capabilities?: ExtendedCapabilities;
  agentUsed?: string;
}

/**
 * Prompt user for confirmation before overwriting
 */
async function confirmOverwrite(message: string): Promise<boolean> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(chalk.yellow(`${message} [y/N]: `), (answer) => {
      rl.close();
      const normalized = answer.toLowerCase().trim();
      resolve(normalized === "y" || normalized === "yes");
    });
  });
}

/**
 * Setup Claude rules files in .claude/rules/ directory
 *
 * This is the NEW approach that copies static rule files instead of generating
 * a monolithic harness section. Claude Code automatically loads all .md files
 * from .claude/rules/ as project memory.
 *
 * @param cwd - Current working directory
 * @param goal - Project goal description
 * @param force - Force overwrite existing rule files
 */
async function setupClaudeRules(
  cwd: string,
  goal: string,
  force: boolean = false
): Promise<void> {
  const claudeMdPath = path.join(cwd, "CLAUDE.md");

  // Check if rules already exist and prompt for confirmation in force mode
  if (force && hasRulesInstalled(cwd)) {
    const confirmed = await confirmOverwrite(
      "  .claude/rules/ already exists. Overwrite with fresh rules?"
    );
    if (!confirmed) {
      console.log(chalk.gray("  Skipping rule file overwrite"));
      force = false; // Disable force, preserve existing
    }
  }

  // Step 1: Copy rule template files to .claude/rules/
  const rulesResult = await copyRulesToProject(cwd, { force });

  if (rulesResult.created > 0) {
    console.log(chalk.green(`✓ Created ${rulesResult.created} rule files in .claude/rules/`));
  }
  if (rulesResult.skipped > 0 && !force) {
    console.log(chalk.gray(`  Skipped ${rulesResult.skipped} existing rule files (use --force to overwrite)`));
  }

  // Step 2: Create or update CLAUDE.md with minimal content (just project goal)
  let existingClaudeMd = "";
  let claudeMdExists = false;

  try {
    existingClaudeMd = await fs.readFile(claudeMdPath, "utf-8");
    claudeMdExists = existingClaudeMd.trim().length > 0;
  } catch {
    debugInit("CLAUDE.md doesn't exist, will create new");
  }

  if (claudeMdExists) {
    // Check if existing CLAUDE.md already has a harness section (legacy)
    const hasHarnessSection = existingClaudeMd.includes("## Long-Task Harness") ||
                              existingClaudeMd.includes("# Long-Task Harness");

    if (hasHarnessSection) {
      // Legacy file with harness section - leave it alone, rules in .claude/rules/ take precedence
      console.log(chalk.gray("  CLAUDE.md already has harness section (legacy), rules loaded from .claude/rules/"));
    } else {
      // No harness section - check if it has project goal
      const hasProjectGoal = existingClaudeMd.includes("## Project Goal") ||
                             existingClaudeMd.includes("# Project Goal");

      if (!hasProjectGoal) {
        // Append minimal project goal section
        const goalSection = `\n## Project Goal\n\n${goal}\n`;
        await fs.writeFile(claudeMdPath, existingClaudeMd.trimEnd() + goalSection);
        console.log(chalk.green("✓ Updated CLAUDE.md (added project goal)"));
      } else {
        console.log(chalk.gray("  CLAUDE.md already configured"));
      }
    }
  } else {
    // Create new minimal CLAUDE.md
    const claudeMd = generateMinimalClaudeMd(goal);
    await fs.writeFile(claudeMdPath, claudeMd);
    console.log(chalk.green("✓ Generated CLAUDE.md"));
  }
}

/**
 * Setup OpenCode rules files in .opencode/rules/ directory
 *
 * This generates artifacts compatible with OpenCode:
 * - .opencode/rules/*.md
 * - AGENTS.md (instead of CLAUDE.md)
 * - opencode.json
 */
async function setupOpenCodeRules(
  cwd: string,
  goal: string,
  force: boolean = false
): Promise<void> {
  const agentsMdPath = path.join(cwd, "AGENTS.md");
  const configPath = path.join(cwd, "opencode.json");

  // Step 1: Copy rules to .opencode/rules/
  const rulesResult = await copyRulesToProject(cwd, { force, targetDir: ".opencode/rules" });

  if (rulesResult.created > 0) {
    console.log(chalk.green(`✓ Created ${rulesResult.created} rule files in .opencode/rules/`));
  }
  if (rulesResult.skipped > 0 && !force) {
    console.log(chalk.gray(`  Skipped ${rulesResult.skipped} existing rule files (use --force to overwrite)`));
  }

  // Step 2: Create or update AGENTS.md
  try {
    const exists = await fs.readFile(agentsMdPath, "utf-8").then(() => true).catch(() => false);
    if (!exists) {
      const agentsMd = generateMinimalAgentsMd(goal);
      await fs.writeFile(agentsMdPath, agentsMd);
      console.log(chalk.green("✓ Generated AGENTS.md"));
    } else {
      console.log(chalk.gray("  AGENTS.md already exists"));
    }
  } catch {
    // Ignore error
  }

  // Step 3: Create opencode.json if missing
  try {
    const configExists = await fs.readFile(configPath, "utf-8").then(() => true).catch(() => false);
    if (!configExists) {
      const config = {
        instructions: [".opencode/rules/*.md"],
        "$schema": "https://opencode.ai/config.json"
      };
      await fs.writeFile(configPath, JSON.stringify(config, null, 2));
      console.log(chalk.green("✓ Generated opencode.json"));
    }
  } catch {
    // Ignore error
  }
}

/**
 * Step 6a: Detect and cache project capabilities
 * Returns capabilities that will be used for init.sh generation
 */
export async function generateCapabilities(ctx: InitContext): Promise<ExtendedCapabilities> {
  const spinner = createSpinner();
  const baseMessage = "Detecting project capabilities";
  spinner.start(`${baseMessage}...`);

  const capabilities = await detectCapabilities(ctx.cwd, {
    force: true,
    verbose: false,
    onAgentSelected: (name) => spinner.update(`${baseMessage}... (Using ${name})`),
  });
  ctx.capabilities = capabilities;

  spinner.succeed("Capabilities detected and cached");
  return capabilities;
}

/**
 * Step 6b: Ensure comprehensive .gitignore exists
 */
export async function generateGitignore(ctx: InitContext): Promise<void> {
  const result = await ensureComprehensiveGitignore(ctx.cwd);

  if (result.action === "created") {
    console.log(chalk.green(`✓ Created .gitignore (templates: ${result.templates?.join(", ") || "minimal"})`));
  } else if (result.action === "updated") {
    console.log(chalk.green(`✓ Updated .gitignore (templates: ${result.templates?.join(", ") || "minimal"})`));
  }
}

/**
 * Step 7: Generate or merge init.sh script
 */
export async function generateInitScript(ctx: InitContext): Promise<void> {
  if (!ctx.capabilities) {
    throw new Error("Capabilities must be detected before generating init.sh");
  }

  const initScriptPath = path.join(ctx.cwd, "ai/init.sh");
  let existingInitScript = "";
  let initScriptExists = false;

  try {
    existingInitScript = await fs.readFile(initScriptPath, "utf-8");
    initScriptExists = existingInitScript.trim().length > 0;
  } catch {
    debugInit("ai/init.sh doesn't exist");
  }

  await generateOrMergeInitScript(
    ctx.cwd,
    ctx.capabilities,
    ctx.survey,
    ctx.mode,
    existingInitScript,
    initScriptExists
  );
}

/**
 * Step 8: Setup Rules (Claude or OpenCode)
 */
export async function generateRules(ctx: InitContext): Promise<void> {
  const forceRules = ctx.mode === "new";

  // Heuristic to determine if we should generate OpenCode artifacts
  // 1. Agent used was 'opencode'
  // 2. .opencode directory already exists (from install --opencode)
  // 3. User explicitly requested it (future flag?)
  
  let useOpenCode = ctx.agentUsed === "opencode";
  
  if (!useOpenCode) {
    try {
      const stats = await fs.stat(path.join(ctx.cwd, ".opencode"));
      useOpenCode = stats.isDirectory();
    } catch {
      // .opencode doesn't exist
    }
  }

  if (useOpenCode) {
    await setupOpenCodeRules(ctx.cwd, ctx.goal, forceRules);
  } else {
    await setupClaudeRules(ctx.cwd, ctx.goal, forceRules);
  }
}

/**
 * Step 9: Append to progress log
 */
export async function generateProgressLog(ctx: InitContext): Promise<void> {
  if (ctx.mode === "scan") return;

  await appendProgressLog(
    ctx.cwd,
    createInitEntry(ctx.goal, `mode=${ctx.mode}, features=${ctx.featureList.features.length}`)
  );
  console.log(chalk.green("✓ Updated ai/progress.log"));
}

/**
 * Show suggested git commit command
 */
export function showGitSuggestion(ctx: InitContext): void {
  if (ctx.mode === "scan") return;

  console.log(chalk.cyan("\n📝 Suggested git commit:"));
  console.log(chalk.white('   git add ai/ .claude/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"'));
}

/**
 * Step 6-8: Generate harness files (init.sh, .claude/rules/, CLAUDE.md, progress.log)
 *
 * IMPORTANT: This function now runs capabilities detection FIRST to ensure
 * init.sh uses the same commands that verification will use (single source of truth).
 *
 * NEW APPROACH: Uses modular .claude/rules/ files instead of monolithic CLAUDE.md.
 * Claude Code automatically loads all .md files from .claude/rules/ as project memory.
 */
export async function generateHarnessFiles(
  cwd: string,
  survey: ReturnType<typeof aiResultToSurvey>,
  featureList: FeatureList,
  goal: string,
  mode: InitMode,
  agentUsed?: string
): Promise<void> {
  // Create context for dependency injection
  const ctx: InitContext = { cwd, goal, mode, survey, featureList, agentUsed };

  // Step 6a: Detect project capabilities (creates ai/capabilities.json)
  await generateCapabilities(ctx);

  // Step 6b: Ensure comprehensive .gitignore exists
  await generateGitignore(ctx);

  // Step 7: Generate/merge init.sh
  await generateInitScript(ctx);

  // Step 8: Setup Rules (Claude or OpenCode)
  await generateRules(ctx);

  // Step 9: Write progress log entry
  await generateProgressLog(ctx);

  // Show git suggestion
  showGitSuggestion(ctx);
}
