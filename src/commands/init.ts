/**
 * Init command - Initialize or upgrade the long-task harness
 */

import chalk from "chalk";

import type { InitMode, TDDMode } from "../types.js";
import { isGitRepo, gitInit } from "../git-utils.js";
import {
  detectAndAnalyzeProject,
  mergeOrCreateFeatures,
  generateHarnessFiles,
} from "../init-helpers.js";
import { featureListExists, loadFeatureList } from "../feature-list.js";

/** Default timeout for TDD mode prompt (in milliseconds) */
const TDD_PROMPT_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Prompt user for TDD mode selection with timeout
 * Default is "recommended" (tests suggested but not required)
 */
async function promptTDDMode(): Promise<TDDMode | undefined> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(chalk.bold.cyan("\n📋 TDD Mode Configuration"));
    console.log(chalk.gray("   Strict mode requires tests for all features."));
    console.log(chalk.gray("   The 'check' and 'done' commands will fail without tests."));
    console.log(chalk.gray(`   (Auto-skip in ${TDD_PROMPT_TIMEOUT_MS / 1000}s with default: recommended)\n`));

    let answered = false;

    // Set timeout to auto-resolve with default
    const timeout = setTimeout(() => {
      if (!answered) {
        answered = true;
        rl.close();
        console.log(chalk.gray("\n   → Timeout: Using recommended mode (tests suggested but not required)\n"));
        resolve("recommended");
      }
    }, TDD_PROMPT_TIMEOUT_MS);

    rl.question(
      chalk.yellow("   Enable strict TDD mode? (tests required for all features) [y/N]: "),
      (answer) => {
        if (answered) return; // Already resolved by timeout
        answered = true;
        clearTimeout(timeout);
        rl.close();
        const normalized = answer.toLowerCase().trim();
        if (normalized === "y" || normalized === "yes") {
          console.log(chalk.green("   ✓ Strict TDD mode enabled\n"));
          resolve("strict");
        } else {
          // Default is recommended (empty or "n" or "no")
          console.log(chalk.gray("   → Using recommended mode (tests suggested but not required)\n"));
          resolve("recommended");
        }
      }
    );
  });
}

/**
 * Initialize the agent-foreman harness
 * Refactored to use helper functions for better maintainability
 */
export async function runInit(goal: string, mode: InitMode, verbose: boolean): Promise<void> {
  const cwd = process.cwd();
  console.log(chalk.blue(`🚀 Initializing harness (mode: ${mode})...`));

  // Step 0: Ensure git repository exists (required for agent-foreman)
  if (!isGitRepo(cwd)) {
    console.log(chalk.yellow("  Not a git repository, initializing..."));
    const initResult = gitInit(cwd);
    if (!initResult.success) {
      console.log(chalk.red(`✗ Failed to initialize git: ${initResult.error}`));
      process.exit(1);
    }
    console.log(chalk.green("✓ Git repository initialized"));
  }

  // Step 1: Detect project type and analyze with AI
  // Note: Don't use spinner here as detectAndAnalyzeProject has its own progress indicators
  console.log(chalk.gray("  Analyzing project..."));
  const analysisResult = await detectAndAnalyzeProject(cwd, goal, verbose);

  if (!analysisResult.success || !analysisResult.survey) {
    console.log(chalk.red(`✗ AI analysis failed: ${analysisResult.error}`));
    console.log(chalk.yellow("  Make sure gemini, codex, or claude CLI is installed"));
    process.exit(1);
  }

  console.log(chalk.green(`✓ AI analysis successful (agent: ${analysisResult.agentUsed})`));

  if (verbose) {
    console.log(chalk.gray(`  Found ${analysisResult.survey.features.length} features`));
  }

  // Step 1.5: Check for existing feature list (protection against accidental overwrite)
  const listExists = await featureListExists(cwd);
  if (listExists && mode !== "new") {
    console.log(chalk.yellow("\n⚠ Feature list already exists. Preserving existing tasks."));
    console.log(chalk.gray("  Use --mode new to force regeneration"));
    console.log(chalk.gray("  Skipping feature generation...\n"));
    // Continue to generate harness files (init.sh, etc.) but skip feature list generation
  }

  // Step 1.6: Prompt for TDD mode (only for new or merge mode, and if not skipping)
  let tddMode: TDDMode | undefined;
  if (mode !== "scan" && (!listExists || mode === "new")) {
    tddMode = await promptTDDMode();
  }

  // Step 2-4: Merge or create features based on mode (skip if list exists and not forcing)
  let featureList;
  const shouldSkipFeatureGeneration = listExists && mode !== "new";

  if (shouldSkipFeatureGeneration) {
    // Load existing feature list instead of generating new
    featureList = await loadFeatureList(cwd);
    if (!featureList) {
      // This shouldn't happen since we checked listExists, but handle gracefully
      console.log(chalk.red("  Error: Could not load existing feature list"));
      process.exit(1);
    }
  } else {
    // Generate or merge features as normal
    featureList = await mergeOrCreateFeatures(
      cwd,
      analysisResult.survey,
      goal,
      mode,
      verbose,
      tddMode
    );
  }

  // Step 5-8: Generate harness files (init.sh, CLAUDE.md/AGENTS.md, progress.log)
  await generateHarnessFiles(
    cwd,
    analysisResult.survey,
    featureList,
    goal,
    mode,
    analysisResult.agentUsed
  );

  console.log(chalk.bold.green("\n🎉 Harness initialized successfully!"));

  // Show TDD mode reminder if strict mode enabled
  if (tddMode === "strict") {
    console.log(chalk.bold.red("\n!!! STRICT TDD MODE ENABLED !!!"));
    console.log(chalk.yellow("   All features require tests to pass verification."));
    console.log(chalk.yellow("   Write tests BEFORE implementation (RED → GREEN → REFACTOR)."));
  }

  console.log(chalk.gray("\nNext: Run 'agent-foreman next' to start working on features"));
}
