/**
 * 'init' command implementation
 * Initialize or upgrade the long-task harness
 *
 * Also provides:
 * - runInitAnalyze(): Generate ARCHITECTURE.md only (--analyze flag)
 * - runInitScan(): Detect verification capabilities only (--scan flag)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import { saveFeatureList } from "../features/index.js";
import { isGitRepo, gitInit } from "../git-utils.js";
import { detectAndAnalyzeProject, mergeOrCreateFeatures, generateHarnessFiles } from "../init/index.js";
import { aiScanProject, aiResultToSurvey, generateAISurveyMarkdown } from "../scanner/index.js";
import { printAgentStatus, getAgentPriorityString } from "../agents.js";
import { scanDirectoryStructure } from "../project-scanner.js";
import { detectCapabilities, formatExtendedCapabilities } from "../capabilities/index.js";
import { createSpinner } from "../progress.js";
import type { InitMode, TaskType, TDDMode } from "../types/index.js";

/**
 * Options for init command modes
 */
export interface InitOptions {
  analyzeOnly?: boolean;
  analyzeOutput?: string;
  scanOnly?: boolean;
  scanForce?: boolean;
}

/** Default timeout for TDD mode prompt (in milliseconds) */
const TDD_PROMPT_TIMEOUT_MS = 10000; // 10 seconds

/**
 * Prompt user for TDD mode selection with timeout
 * Default is "recommended" (tests suggested but not required)
 * Auto-skips with default if user doesn't respond within timeout
 */
async function promptTDDMode(): Promise<TDDMode | undefined> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    console.log(chalk.bold.cyan("\n📋 TDD Mode Configuration"));
    console.log(chalk.gray("   Select how strictly tests are enforced:"));
    console.log(chalk.gray(`   (Auto-skip in ${TDD_PROMPT_TIMEOUT_MS / 1000}s with default: recommended)\n`));
    console.log(chalk.white("   [1] Strict      - Tests REQUIRED before marking tasks done"));
    console.log(chalk.gray("                     check/done commands fail without tests"));
    console.log(chalk.white("   [2] Recommended - Tests suggested but optional (default)"));
    console.log(chalk.gray("                     TDD guidance shown, but not enforced"));
    console.log(chalk.white("   [3] Disabled    - No TDD guidance or enforcement"));
    console.log(chalk.gray("                     For legacy projects or non-code tasks\n"));

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
      chalk.yellow("   Select TDD enforcement level [1/2/3] (default: 2): "),
      (answer) => {
        if (answered) return; // Already resolved by timeout
        answered = true;
        clearTimeout(timeout);
        rl.close();
        const normalized = answer.trim();

        switch (normalized) {
          case "1":
          case "strict":
            console.log(chalk.green("   ✓ Strict TDD mode enabled\n"));
            resolve("strict");
            break;
          case "3":
          case "disabled":
          case "none":
            console.log(chalk.gray("   → TDD mode disabled\n"));
            resolve("disabled");
            break;
          case "2":
          case "recommended":
          case "":
          default:
            console.log(chalk.gray("   → Using recommended mode (tests suggested but not required)\n"));
            resolve("recommended");
            break;
        }
      }
    );
  });
}

/**
 * Run analyze-only mode (generates ARCHITECTURE.md)
 * Called when --analyze flag is used
 */
export async function runInitAnalyze(outputPath: string, verbose: boolean): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.blue(`🤖 AI-powered project analysis (priority: ${getAgentPriorityString()})`));
  if (verbose) {
    printAgentStatus();
  }

  const aiResult = await aiScanProject(cwd, { verbose });

  if (!aiResult.success) {
    console.log(chalk.red(`✗ AI analysis failed: ${aiResult.error}`));
    console.log(chalk.yellow("  Make sure gemini, codex, or claude CLI is installed"));
    process.exit(1);
  }

  console.log(chalk.green(`✓ AI analysis successful (agent: ${aiResult.agentUsed})`));

  const structure = await scanDirectoryStructure(cwd);
  const survey = aiResultToSurvey(aiResult, structure);

  const markdown = generateAISurveyMarkdown(survey, aiResult);
  const fullPath = path.join(cwd, outputPath);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, markdown);

  console.log(chalk.green(`✓ Analysis written to ${outputPath}`));

  console.log(chalk.gray(`  Tech stack: ${survey.techStack.language}/${survey.techStack.framework}`));
  console.log(chalk.gray(`  Modules: ${survey.modules.length}`));
  console.log(chalk.gray(`  Features: ${survey.features.length}`));
  console.log(chalk.gray(`  Completion: ${survey.completion.overall}%`));

  if (aiResult.summary) {
    console.log(chalk.cyan("\n📝 Summary:"));
    console.log(chalk.white(`  ${aiResult.summary}`));
  }

  if (aiResult.recommendations && aiResult.recommendations.length > 0) {
    console.log(chalk.cyan("\n💡 Recommendations:"));
    aiResult.recommendations.forEach((rec, i) => {
      console.log(chalk.white(`  ${i + 1}. ${rec}`));
    });
  }
}

/**
 * Run scan-only mode (detects verification capabilities)
 * Called when --scan flag is used
 */
export async function runInitScan(force: boolean, verbose: boolean): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.blue("🔍 Detecting project verification capabilities..."));

  if (force) {
    console.log(chalk.gray("   (forcing re-detection, ignoring cache)"));
  }

  const spinner = createSpinner("Detecting capabilities");

  try {
    const capabilities = await detectCapabilities(cwd, {
      force,
      verbose,
    });

    spinner.succeed("Capabilities detected");
    console.log(formatExtendedCapabilities(capabilities));

    // Show custom rules if any
    if (capabilities.customRules && capabilities.customRules.length > 0) {
      console.log(chalk.blue("\n  Custom Rules:"));
      for (const rule of capabilities.customRules) {
        console.log(chalk.white(`    ${rule.id}: ${rule.description}`));
        console.log(chalk.gray(`      Command: ${rule.command}`));
      }
    }

    // Show cache info
    console.log(chalk.gray(`\n  Detected at: ${capabilities.detectedAt}`));
    console.log(chalk.gray(`  Cache: ai/capabilities.json`));
  } catch (error) {
    spinner.fail(`Detection failed: ${(error as Error).message}`);
    process.exit(1);
  }
}

/**
 * Run the init command
 */
export async function runInit(
  goal: string,
  mode: InitMode,
  verbose: boolean,
  taskType?: TaskType,
  options?: InitOptions
): Promise<void> {
  // Handle analyze-only mode
  if (options?.analyzeOnly) {
    return runInitAnalyze(options.analyzeOutput || "docs/ARCHITECTURE.md", verbose);
  }

  // Handle scan-only mode
  if (options?.scanOnly) {
    return runInitScan(options.scanForce || false, verbose);
  }

  const cwd = process.cwd();
  const taskTypeInfo = taskType ? `, task-type: ${taskType}` : "";
  console.log(chalk.blue(`🚀 Initializing harness (mode: ${mode}${taskTypeInfo})...`));

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

  // Step 1.5: Prompt for TDD mode (only for new or merge mode)
  let tddMode: TDDMode | undefined;
  if (mode !== "scan") {
    tddMode = await promptTDDMode();
  }

  // Step 2-4: Merge or create features based on mode
  const featureList = await mergeOrCreateFeatures(
    cwd,
    analysisResult.survey,
    goal,
    mode,
    verbose,
    tddMode
  );

  // Apply taskType to all features if specified
  if (taskType) {
    featureList.features = featureList.features.map((f) => ({
      ...f,
      taskType,
    }));
    // Save updated feature list with taskType
    await saveFeatureList(cwd, featureList);
    console.log(chalk.gray(`  Applied task-type "${taskType}" to ${featureList.features.length} features`));
  }

  // Step 5-8: Generate harness files (init.sh, CLAUDE.md, progress.log)
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

  console.log(chalk.gray("\nNext: Run 'agent-foreman next' to start working on tasks"));
}
