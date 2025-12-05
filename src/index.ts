#!/usr/bin/env node
/**
 * agent-foreman CLI
 * Long Task Harness for AI agents
 */
import yargs from "yargs";
import { hideBin } from "yargs/helpers";
import chalk from "chalk";
import * as fs from "node:fs/promises";
import * as path from "node:path";

import { aiScanProject, aiResultToSurvey, generateAISurveyMarkdown, generateFeaturesFromSurvey, generateFeaturesFromGoal } from "./ai-scanner.js";
import { printAgentStatus, callAnyAvailableAgent } from "./agents.js";
import { scanDirectoryStructure, isProjectEmpty } from "./project-scanner.js";
import {
  loadFeatureList,
  saveFeatureList,
  selectNextFeature,
  findFeatureById,
  updateFeatureStatus,
  updateFeatureVerification,
  mergeFeatures,
  createEmptyFeatureList,
  discoveredToFeature,
  getFeatureStats,
  getCompletionPercentage,
} from "./feature-list.js";
import {
  appendProgressLog,
  readProgressLog,
  createInitEntry,
  createStepEntry,
  createVerifyEntry,
  getRecentEntries,
} from "./progress-log.js";
import { generateInitScript, generateMinimalInitScript } from "./init-script.js";
import { generateClaudeMd, generateHarnessSection, generateFeatureGuidance } from "./prompts.js";
import {
  verifyFeature,
  verifyFeatureAutonomous,
  createVerificationSummary,
  formatVerificationResult,
} from "./verifier.js";
import {
  detectCapabilities,
  formatExtendedCapabilities,
} from "./project-capabilities.js";
import type { FeatureVerificationSummary } from "./verification-types.js";
import type { InitMode, Feature } from "./types.js";
import { isGitRepo, hasUncommittedChanges, gitAdd, gitCommit, gitInit } from "./git-utils.js";
import { generateTDDGuidance, generateUnitTestSkeleton, type TDDGuidance } from "./tdd-guidance.js";
import { generateTDDGuidanceWithAI } from "./tdd-ai-generator.js";
import type { CachedTDDGuidance } from "./types.js";
import { verifyTestFilesExist, discoverFeatureTestFiles } from "./test-gate.js";
import {
  detectAndAnalyzeProject,
  mergeOrCreateFeatures,
  generateHarnessFiles,
} from "./init-helpers.js";
import { createSpinner, createProgressBar } from "./progress.js";
import { interactiveUpgradeCheck, getCurrentVersion } from "./upgrade.js";

/**
 * Auto-detect project goal from README or package.json
 */
async function detectProjectGoal(cwd: string): Promise<string> {
  // Try package.json description first
  try {
    const pkgPath = path.join(cwd, "package.json");
    const pkgContent = await fs.readFile(pkgPath, "utf-8");
    const pkg = JSON.parse(pkgContent);
    if (pkg.description && pkg.description.length > 10) {
      console.log(chalk.gray(`  Auto-detected goal from package.json`));
      return pkg.description;
    }
  } catch {
    // No package.json or no description
  }

  // Try README first line (usually project title/description)
  try {
    const readmeNames = ["README.md", "README", "readme.md", "Readme.md"];
    for (const name of readmeNames) {
      try {
        const readmePath = path.join(cwd, name);
        const content = await fs.readFile(readmePath, "utf-8");
        const lines = content.split("\n").filter((l) => l.trim());
        // Skip markdown headers, get first meaningful line
        for (const line of lines.slice(0, 5)) {
          const clean = line.replace(/^#+\s*/, "").trim();
          if (clean.length > 10 && !clean.startsWith("!") && !clean.startsWith("[")) {
            console.log(chalk.gray(`  Auto-detected goal from ${name}`));
            return clean;
          }
        }
      } catch {
        // Try next README variant
      }
    }
  } catch {
    // No README found
  }

  // Fallback: use directory name
  const dirName = path.basename(cwd);
  console.log(chalk.yellow(`  No description found, using directory name: ${dirName}`));
  return `Development of ${dirName}`;
}

async function main() {
  // Run interactive upgrade check (prompts user if new version available)
  await interactiveUpgradeCheck();

  await yargs(hideBin(process.argv))
    .scriptName("agent-foreman")
    .usage("$0 <command> [options]")
    .command(
      "analyze [output]",
      "Generate AI-powered project analysis report",
      (yargs) =>
        yargs
          .positional("output", {
            describe: "Output path for survey markdown",
            type: "string",
            default: "docs/ARCHITECTURE.md",
          })
          .option("verbose", {
            alias: "v",
            type: "boolean",
            default: false,
            describe: "Show detailed output",
          }),
      async (argv) => {
        await runAnalyze(argv.output, argv.verbose);
      }
    )
    .command(
      "init [goal]",
      "Initialize or upgrade the long-task harness",
      (yargs) =>
        yargs
          .positional("goal", {
            describe: "Project goal description (auto-detected if not provided)",
            type: "string",
          })
          .option("mode", {
            alias: "m",
            describe: "Init mode: merge, new, or scan",
            type: "string",
            default: "merge",
            choices: ["merge", "new", "scan"] as const,
          })
          .option("verbose", {
            alias: "v",
            type: "boolean",
            default: false,
          }),
      async (argv) => {
        const goal = argv.goal || (await detectProjectGoal(process.cwd()));
        await runInit(goal, argv.mode as InitMode, argv.verbose);
      }
    )
    .command(
      "next [feature_id]",
      "Show next feature to work on or specific feature details",
      (yargs) =>
        yargs
          .positional("feature_id", {
            describe: "Specific feature ID to work on",
            type: "string",
          })
          .option("dry-run", {
            alias: "d",
            type: "boolean",
            default: false,
            describe: "Show plan without making changes",
          })
          .option("check", {
            alias: "c",
            type: "boolean",
            default: false,
            describe: "Run basic tests before showing next task",
          })
          .option("allow-dirty", {
            type: "boolean",
            default: false,
            describe: "Allow running with uncommitted changes",
          })
          .option("json", {
            type: "boolean",
            default: false,
            describe: "Output as JSON for scripting",
          })
          .option("quiet", {
            alias: "q",
            type: "boolean",
            default: false,
            describe: "Suppress decorative output",
          })
          .option("refresh-guidance", {
            type: "boolean",
            default: false,
            describe: "Force regenerate TDD guidance (ignore cache)",
          }),
      async (argv) => {
        await runNext(argv.feature_id, argv.dryRun, argv.check, argv.allowDirty, argv.json, argv.quiet, argv.refreshGuidance);
      }
    )
    .command(
      "status",
      "Show current harness status",
      (yargs) =>
        yargs
          .option("json", {
            type: "boolean",
            default: false,
            describe: "Output as JSON for scripting",
          })
          .option("quiet", {
            alias: "q",
            type: "boolean",
            default: false,
            describe: "Suppress decorative output",
          }),
      async (argv) => {
        await runStatus(argv.json, argv.quiet);
      }
    )
    .command(
      "impact <feature_id>",
      "Analyze impact of changes to a feature",
      (yargs) =>
        yargs.positional("feature_id", {
          describe: "Feature ID to analyze",
          type: "string",
          demandOption: true,
        }),
      async (argv) => {
        await runImpact(argv.feature_id!);
      }
    )
    .command(
      "done <feature_id>",
      "Verify and mark a feature as complete",
      (yargs) =>
        yargs
          .positional("feature_id", {
            describe: "Feature ID to mark complete",
            type: "string",
            demandOption: true,
          })
          .option("notes", {
            alias: "n",
            type: "string",
            describe: "Additional notes",
          })
          .option("no-commit", {
            type: "boolean",
            default: false,
            describe: "Skip automatic git commit",
          })
          .option("skip-verify", {
            type: "boolean",
            default: false,
            describe: "Skip AI verification (not recommended)",
          })
          .option("verbose", {
            alias: "v",
            type: "boolean",
            default: false,
            describe: "Show detailed verification output",
          })
          .option("no-autonomous", {
            type: "boolean",
            default: false,
            describe: "Disable autonomous AI exploration (use diff-based)",
          })
          .option("quick", {
            alias: "q",
            type: "boolean",
            default: true,
            describe: "Run only related tests (selective test execution, default)",
          })
          .option("full", {
            type: "boolean",
            default: false,
            describe: "Force full test suite",
          })
          .option("test-pattern", {
            type: "string",
            describe: "Explicit test pattern to use (e.g., \"tests/auth/**\")",
          })
          .option("skip-e2e", {
            type: "boolean",
            default: false,
            describe: "Skip E2E tests entirely (run unit tests only)",
          }),
      async (argv) => {
        // Determine test mode: --full > --quick (default)
        // Quick mode is now the default for faster iteration
        const testMode = argv.full ? "full" : "quick";
        // Determine E2E mode:
        // - --skip-e2e: skip
        // - --full (explicit): full E2E
        // - quick (default): tags (or smoke if no feature tags)
        const e2eMode = argv.skipE2e
          ? "skip"
          : argv.full
            ? "full"
            : undefined; // Quick mode: determined by tags in verifier
        await runDone(
          argv.feature_id!,
          argv.notes,
          !argv.noCommit,
          argv.skipVerify,
          argv.verbose,
          !argv.noAutonomous,
          testMode,
          argv.testPattern,
          argv.skipE2e,
          e2eMode
        );
      }
    )
    .command(
      "check <feature_id>",
      "AI-powered verification of feature completion",
      (yargs) =>
        yargs
          .positional("feature_id", {
            describe: "Feature ID to verify",
            type: "string",
            demandOption: true,
          })
          .option("verbose", {
            alias: "v",
            type: "boolean",
            default: false,
            describe: "Show detailed AI reasoning",
          })
          .option("skip-checks", {
            alias: "s",
            type: "boolean",
            default: false,
            describe: "Skip automated checks, AI only",
          })
          .option("no-autonomous", {
            type: "boolean",
            default: false,
            describe: "Disable autonomous AI exploration (use diff-based)",
          })
          .option("quick", {
            alias: "q",
            type: "boolean",
            default: true,
            describe: "Run only related tests (selective test execution, default)",
          })
          .option("full", {
            type: "boolean",
            default: false,
            describe: "Force full test suite",
          })
          .option("test-pattern", {
            type: "string",
            describe: "Explicit test pattern to use (e.g., \"tests/auth/**\")",
          })
          .option("skip-e2e", {
            type: "boolean",
            default: false,
            describe: "Skip E2E tests entirely (run unit tests only)",
          }),
      async (argv) => {
        // Determine test mode: --full > --quick (default)
        const testMode = argv.full ? "full" : "quick";
        // Determine E2E mode same as complete command
        const e2eMode = argv.skipE2e
          ? "skip"
          : argv.full
            ? "full"
            : undefined; // Quick mode: determined by tags in verifier
        await runCheck(argv.feature_id!, argv.verbose, argv.skipChecks, !argv.noAutonomous, testMode, argv.testPattern, argv.skipE2e, e2eMode);
      }
    )
    .command(
      "agents",
      "Show available AI agents status",
      {},
      async () => {
        printAgentStatus();
      }
    )
    .command(
      "detect-capabilities",
      "Detect or refresh project verification capabilities",
      (yargs) =>
        yargs
          .option("force", {
            alias: "f",
            type: "boolean",
            default: false,
            describe: "Force re-detection even if cache exists",
          })
          .option("verbose", {
            alias: "v",
            type: "boolean",
            default: false,
            describe: "Show detailed detection output",
          }),
      async (argv) => {
        await runDetectCapabilities(argv.force, argv.verbose);
      }
    )
    .demandCommand(1, "You need at least one command")
    .help()
    .version(getCurrentVersion())
    .parseAsync();
}

// ============================================================================
// Command Implementations
// ============================================================================

async function runAnalyze(outputPath: string, verbose: boolean) {
  const cwd = process.cwd();

  console.log(chalk.blue("🤖 AI-powered project analysis (priority: Codex > Gemini > Claude)"));
  if (verbose) {
    printAgentStatus();
  }

  // Note: Don't use spinner here as aiScanProject has its own progress indicators
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
 * Initialize the agent-foreman harness
 * Refactored to use helper functions for better maintainability
 */
async function runInit(goal: string, mode: InitMode, verbose: boolean) {
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

  // Step 2-4: Merge or create features based on mode
  const featureList = await mergeOrCreateFeatures(
    cwd,
    analysisResult.survey,
    goal,
    mode,
    verbose
  );

  // Step 5-8: Generate harness files (init.sh, CLAUDE.md, progress.log)
  await generateHarnessFiles(cwd, analysisResult.survey, featureList, goal, mode);

  console.log(chalk.bold.green("\n🎉 Harness initialized successfully!"));
  console.log(chalk.gray("Next: Run 'agent-foreman next' to start working on features"));
}

async function runNext(
  featureId: string | undefined,
  dryRun: boolean,
  runCheck: boolean = false,
  allowDirty: boolean = false,
  outputJson: boolean = false,
  quiet: boolean = false,
  refreshGuidance: boolean = false
) {
  const cwd = process.cwd();
  const { spawnSync } = await import("node:child_process");

  // ─────────────────────────────────────────────────────────────────
  // Clean Working Directory Check (PRD requirement)
  // ─────────────────────────────────────────────────────────────────
  if (!allowDirty && isGitRepo(cwd) && hasUncommittedChanges(cwd)) {
    if (outputJson) {
      console.log(JSON.stringify({ error: "Working directory not clean" }));
    } else {
      console.log(chalk.red("\n✗ Working directory is not clean."));
      console.log(chalk.yellow("  You have uncommitted changes. Before starting a new task:"));
      console.log(chalk.white("  • Commit your changes: git add -A && git commit -m \"...\""));
      console.log(chalk.white("  • Or stash them: git stash"));
      console.log(chalk.gray("\n  Use --allow-dirty to bypass this check."));
    }
    process.exit(1);
  }

  // Load feature list
  const featureList = await loadFeatureList(cwd);
  if (!featureList) {
    if (outputJson) {
      console.log(JSON.stringify({ error: "No feature list found" }));
    } else {
      console.log(chalk.red("✗ No feature list found. Run 'agent-foreman init' first."));
    }
    process.exit(1);
  }

  // Select feature
  let feature: Feature | undefined;

  if (featureId) {
    feature = findFeatureById(featureList.features, featureId);
    if (!feature) {
      if (outputJson) {
        console.log(JSON.stringify({ error: `Feature '${featureId}' not found` }));
      } else {
        console.log(chalk.red(`✗ Feature '${featureId}' not found.`));
      }
      process.exit(1);
    }
  } else {
    feature = selectNextFeature(featureList.features) ?? undefined;
    if (!feature) {
      if (outputJson) {
        console.log(JSON.stringify({ complete: true, message: "All features passing" }));
      } else {
        console.log(chalk.green("🎉 All features are passing or blocked. Nothing to do!"));
      }
      return;
    }
  }

  // JSON output mode - return feature data and exit
  if (outputJson) {
    const stats = getFeatureStats(featureList.features);
    const completion = getCompletionPercentage(featureList.features);

    // Generate TDD guidance for JSON output (suppress all console output during detection)
    let tddGuidance: TDDGuidance | null = null;
    try {
      // Temporarily suppress console output during capability detection
      const originalLog = console.log;
      // eslint-disable-next-line @typescript-eslint/no-empty-function
      console.log = () => {};
      try {
        const capabilities = await detectCapabilities(cwd, { verbose: false });
        tddGuidance = generateTDDGuidance(feature, capabilities, cwd);
      } finally {
        console.log = originalLog;
      }
    } catch {
      // Ignore errors in guidance generation for JSON mode
    }

    const output = {
      feature: {
        id: feature.id,
        description: feature.description,
        module: feature.module,
        priority: feature.priority,
        status: feature.status,
        acceptance: feature.acceptance,
        dependsOn: feature.dependsOn,
        notes: feature.notes || null,
      },
      stats: {
        passing: stats.passing,
        failing: stats.failing,
        needsReview: stats.needs_review,
        total: featureList.features.length,
      },
      completion,
      cwd,
      tddGuidance,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Quiet mode - minimal output
  if (quiet) {
    console.log(`Feature: ${feature.id}`);
    console.log(`Description: ${feature.description}`);
    console.log(`Status: ${feature.status}`);
    console.log(`Acceptance:`);
    feature.acceptance.forEach((a, i) => console.log(`  ${i + 1}. ${a}`));
    return;
  }

  console.log(chalk.bold.blue("\n═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold.blue("                    EXTERNAL MEMORY SYNC"));
  console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════\n"));

  // ─────────────────────────────────────────────────────────────────
  // 1. Current Directory (pwd)
  // ─────────────────────────────────────────────────────────────────
  console.log(chalk.bold("📁 Current Directory:"));
  console.log(chalk.white(`   ${cwd}\n`));

  // ─────────────────────────────────────────────────────────────────
  // 2. Git History (recent commits)
  // ─────────────────────────────────────────────────────────────────
  console.log(chalk.bold("📜 Recent Git Commits:"));
  const gitLog = spawnSync("git", ["log", "--oneline", "-5"], { cwd, encoding: "utf-8" });
  if (gitLog.status === 0 && gitLog.stdout.trim()) {
    gitLog.stdout.trim().split("\n").forEach((line) => {
      console.log(chalk.gray(`   ${line}`));
    });
  } else {
    console.log(chalk.yellow("   No git history found"));
  }
  console.log("");

  // ─────────────────────────────────────────────────────────────────
  // 3. Progress Log (recent entries)
  // ─────────────────────────────────────────────────────────────────
  console.log(chalk.bold("📝 Recent Progress:"));
  const recentEntries = await getRecentEntries(cwd, 5);
  if (recentEntries.length > 0) {
    for (const entry of recentEntries) {
      const typeColor =
        entry.type === "INIT" ? chalk.blue :
        entry.type === "STEP" ? chalk.green :
        entry.type === "CHANGE" ? chalk.yellow : chalk.magenta;
      console.log(
        chalk.gray(`   ${entry.timestamp.substring(0, 16)} `) +
        typeColor(`[${entry.type}]`) +
        chalk.white(` ${entry.summary}`)
      );
    }
  } else {
    console.log(chalk.yellow("   No progress entries yet"));
  }
  console.log("");

  // ─────────────────────────────────────────────────────────────────
  // 4. Feature List Status (already loaded above)
  // ─────────────────────────────────────────────────────────────────
  const stats = getFeatureStats(featureList.features);
  const completion = getCompletionPercentage(featureList.features);

  console.log(chalk.bold("📊 Feature Status:"));
  console.log(chalk.green(`   ✓ Passing: ${stats.passing}`) +
    chalk.red(` | ✗ Failing: ${stats.failing}`) +
    chalk.yellow(` | ⚠ Review: ${stats.needs_review}`) +
    chalk.gray(` | Blocked: ${stats.blocked}`));

  const barWidth = 30;
  const filledWidth = Math.round((completion / 100) * barWidth);
  const progressBar = chalk.green("█".repeat(filledWidth)) + chalk.gray("░".repeat(barWidth - filledWidth));
  console.log(chalk.white(`   Progress: [${progressBar}] ${completion}%\n`));

  // ─────────────────────────────────────────────────────────────────
  // 5. Run Basic Tests (optional --check flag)
  // ─────────────────────────────────────────────────────────────────
  if (runCheck) {
    console.log(chalk.bold("🧪 Running Basic Tests:"));
    const initScript = path.join(cwd, "ai/init.sh");
    try {
      await fs.access(initScript);
      const testResult = spawnSync("bash", [initScript, "check"], {
        cwd,
        encoding: "utf-8",
        timeout: 60000,
      });
      if (testResult.status === 0) {
        console.log(chalk.green("   ✓ All checks passed"));
      } else {
        console.log(chalk.red("   ✗ Some checks failed:"));
        if (testResult.stdout) {
          testResult.stdout.split("\n").slice(0, 10).forEach((line) => {
            if (line.trim()) console.log(chalk.gray(`   ${line}`));
          });
        }
        if (testResult.stderr) {
          testResult.stderr.split("\n").slice(0, 5).forEach((line) => {
            if (line.trim()) console.log(chalk.red(`   ${line}`));
          });
        }
      }
    } catch {
      console.log(chalk.yellow("   ai/init.sh not found, skipping tests"));
    }
    console.log("");
  }

  // ─────────────────────────────────────────────────────────────────
  // 6. Display Feature Info
  // ─────────────────────────────────────────────────────────────────
  console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold.blue("                     NEXT TASK"));
  console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════\n"));

  console.log(chalk.bold(`📋 Feature: ${chalk.cyan(feature.id)}`));
  console.log(chalk.gray(`   Module: ${feature.module} | Priority: ${feature.priority}`));
  console.log(
    chalk.gray(`   Status: `) +
      (feature.status === "passing"
        ? chalk.green(feature.status)
        : feature.status === "needs_review"
          ? chalk.yellow(feature.status)
          : chalk.red(feature.status))
  );
  console.log("");
  console.log(chalk.bold("   Description:"));
  console.log(chalk.white(`   ${feature.description}`));
  console.log("");
  console.log(chalk.bold("   Acceptance Criteria:"));
  feature.acceptance.forEach((a, i) => {
    console.log(chalk.white(`   ${i + 1}. ${a}`));
  });

  if (feature.dependsOn.length > 0) {
    console.log("");
    console.log(chalk.yellow(`   ⚠ Depends on: ${feature.dependsOn.join(", ")}`));
  }

  if (feature.notes) {
    console.log("");
    console.log(chalk.gray(`   Notes: ${feature.notes}`));
  }

  console.log("");
  console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════"));
  console.log(chalk.gray("   When done, run: ") + chalk.cyan(`agent-foreman done ${feature.id}`));
  console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════\n"));

  if (dryRun) {
    console.log(chalk.yellow("   [Dry run - no changes made]"));
  }

  // Output feature guidance (for AI consumption)
  console.log(generateFeatureGuidance(feature));

  // ─────────────────────────────────────────────────────────────────
  // TDD Guidance Section (display only, not in quiet mode)
  // ─────────────────────────────────────────────────────────────────
  try {
    const capabilities = await detectCapabilities(cwd, { verbose: false });

    // Check cache validity (unless --refresh-guidance is set)
    const isCacheValid =
      !refreshGuidance &&
      feature.tddGuidance &&
      feature.tddGuidance.forVersion === feature.version;

    let guidance: TDDGuidance | CachedTDDGuidance;
    let isCached = false;
    let isAIGenerated = false;

    if (isCacheValid && feature.tddGuidance) {
      // Use cached AI guidance
      guidance = feature.tddGuidance;
      isCached = true;
      isAIGenerated = true;
    } else {
      // Try AI generation
      const aiGuidance = await generateTDDGuidanceWithAI(feature, capabilities, cwd);

      if (aiGuidance) {
        // Save to feature in JSON
        feature.tddGuidance = aiGuidance;
        // Update feature in list and save
        featureList.features = featureList.features.map((f) =>
          f.id === feature.id ? { ...f, tddGuidance: aiGuidance } : f
        );
        await saveFeatureList(cwd, featureList);
        guidance = aiGuidance;
        isAIGenerated = true;
      } else {
        // Fallback to regex-based
        guidance = generateTDDGuidance(feature, capabilities, cwd);
      }
    }

    console.log(chalk.bold.magenta("\n═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold.magenta("                    TDD GUIDANCE"));
    console.log(chalk.bold.magenta("═══════════════════════════════════════════════════════════════\n"));

    // Show source indicator
    if (isCached) {
      console.log(chalk.gray(`   (cached from ${(guidance as CachedTDDGuidance).generatedAt})`));
    } else if (isAIGenerated) {
      console.log(chalk.gray(`   (AI-generated by ${(guidance as CachedTDDGuidance).generatedBy})`));
    } else {
      console.log(chalk.yellow(`   (fallback: regex-based)`));
    }

    // Suggested test file paths
    console.log(chalk.bold("\n📝 Suggested Test Files:"));
    if (guidance.suggestedTestFiles.unit.length > 0) {
      console.log(chalk.cyan(`   Unit: ${guidance.suggestedTestFiles.unit[0]}`));
    }
    if (guidance.suggestedTestFiles.e2e.length > 0) {
      console.log(chalk.blue(`   E2E:  ${guidance.suggestedTestFiles.e2e[0]}`));
    }

    // Display based on guidance type
    if (isAIGenerated) {
      // AI-generated guidance - show unit test cases with assertions
      const aiGuidance = guidance as CachedTDDGuidance;
      console.log(chalk.bold("\n📋 Unit Test Cases:"));
      aiGuidance.unitTestCases.forEach((tc, i) => {
        console.log(chalk.green(`   ${i + 1}. ${tc.name}`));
        if (tc.assertions.length > 0) {
          tc.assertions.slice(0, 2).forEach((a) => {
            console.log(chalk.gray(`      → ${a}`));
          });
          if (tc.assertions.length > 2) {
            console.log(chalk.gray(`      → ... ${tc.assertions.length - 2} more assertions`));
          }
        }
      });

      // E2E scenarios if any
      if (aiGuidance.e2eScenarios.length > 0) {
        console.log(chalk.bold("\n🎭 E2E Scenarios:"));
        aiGuidance.e2eScenarios.forEach((sc, i) => {
          console.log(chalk.blue(`   ${i + 1}. ${sc.name}`));
          sc.steps.slice(0, 3).forEach((step) => {
            console.log(chalk.gray(`      → ${step}`));
          });
          if (sc.steps.length > 3) {
            console.log(chalk.gray(`      → ... ${sc.steps.length - 3} more steps`));
          }
        });
      }
    } else {
      // Regex-based guidance - show acceptance mapping
      const regexGuidance = guidance as TDDGuidance;
      console.log(chalk.bold("\n📋 Acceptance → Test Mapping:"));
      regexGuidance.acceptanceMapping.forEach((m, i) => {
        console.log(chalk.gray(`   ${i + 1}. "${m.criterion}"`));
        console.log(chalk.green(`      → Unit: ${m.unitTestCase}`));
        if (m.e2eScenario) {
          console.log(chalk.blue(`      → E2E:  ${m.e2eScenario}`));
        }
      });

      // Test skeleton preview (first 3 test cases)
      const testCasesPreview = regexGuidance.testCaseStubs.unit.slice(0, 3);
      if (testCasesPreview.length > 0 && capabilities?.testFramework) {
        const framework = capabilities.testFramework.toLowerCase();
        const supportedFrameworks = ["vitest", "jest", "mocha"];
        if (supportedFrameworks.includes(framework)) {
          console.log(chalk.bold("\n📄 Test Skeleton Preview:"));
          console.log(chalk.gray(`   Framework: ${capabilities.testFramework}`));
          console.log(chalk.gray("   ```"));
          testCasesPreview.forEach((testCase) => {
            console.log(chalk.white(`   it("${testCase}", () => { ... });`));
          });
          if (regexGuidance.testCaseStubs.unit.length > 3) {
            console.log(chalk.gray(`   // ... ${regexGuidance.testCaseStubs.unit.length - 3} more test cases`));
          }
          console.log(chalk.gray("   ```"));
        }
      }
    }

    console.log(chalk.bold.magenta("\n═══════════════════════════════════════════════════════════════\n"));
  } catch {
    // Silently skip TDD guidance if capabilities detection fails
  }
}

async function runStatus(outputJson: boolean = false, quiet: boolean = false) {
  const cwd = process.cwd();

  const featureList = await loadFeatureList(cwd);
  if (!featureList) {
    if (outputJson) {
      console.log(JSON.stringify({ error: "No feature list found" }));
    } else {
      console.log(chalk.red("✗ No feature list found. Run 'agent-foreman init <goal>' first."));
    }
    return;
  }

  const stats = getFeatureStats(featureList.features);
  const next = selectNextFeature(featureList.features);
  const completion = getCompletionPercentage(featureList.features);
  const recentEntries = await getRecentEntries(cwd, 5);

  // JSON output mode
  if (outputJson) {
    const output = {
      goal: featureList.metadata.projectGoal,
      updatedAt: featureList.metadata.updatedAt,
      stats: {
        passing: stats.passing,
        failing: stats.failing,
        needsReview: stats.needs_review,
        blocked: stats.blocked,
        deprecated: stats.deprecated,
        total: featureList.features.length,
      },
      completion,
      recentActivity: recentEntries.map((e) => ({
        type: e.type,
        timestamp: e.timestamp,
        summary: e.summary,
      })),
      nextFeature: next
        ? { id: next.id, description: next.description, status: next.status }
        : null,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  // Quiet mode - minimal output
  if (quiet) {
    console.log(`${completion}% complete | ${stats.passing}/${featureList.features.length} passing`);
    if (next) {
      console.log(`Next: ${next.id}`);
    }
    return;
  }

  // Normal output
  console.log("");
  console.log(chalk.bold.blue("📊 Project Status"));
  console.log(chalk.gray(`   Goal: ${featureList.metadata.projectGoal}`));
  console.log(chalk.gray(`   Last updated: ${featureList.metadata.updatedAt}`));
  console.log("");

  console.log(chalk.bold("   Feature Status:"));
  console.log(chalk.green(`   ✓ Passing: ${stats.passing}`));
  console.log(chalk.yellow(`   ⚠ Needs Review: ${stats.needs_review}`));
  console.log(chalk.red(`   ✗ Failing: ${stats.failing}`));
  console.log(chalk.gray(`   ⏸ Blocked: ${stats.blocked}`));
  console.log(chalk.gray(`   ⊘ Deprecated: ${stats.deprecated}`));
  console.log("");

  // Progress bar
  const barWidth = 30;
  const filledWidth = Math.round((completion / 100) * barWidth);
  const emptyWidth = barWidth - filledWidth;
  const progressBar = chalk.green("█".repeat(filledWidth)) + chalk.gray("░".repeat(emptyWidth));
  console.log(chalk.bold(`   Completion: [${progressBar}] ${completion}%`));
  console.log("");

  // Recent activity
  if (recentEntries.length > 0) {
    console.log(chalk.bold("   Recent Activity:"));
    for (const entry of recentEntries) {
      const typeColor =
        entry.type === "INIT"
          ? chalk.blue
          : entry.type === "STEP"
            ? chalk.green
            : entry.type === "CHANGE"
              ? chalk.yellow
              : chalk.magenta;
      console.log(
        chalk.gray(`   ${entry.timestamp.substring(0, 10)} `) +
          typeColor(`[${entry.type}]`) +
          chalk.white(` ${entry.summary}`)
      );
    }
    console.log("");
  }

  // Next feature
  if (next) {
    console.log(chalk.bold("   Next Up:"));
    console.log(chalk.white(`   → ${next.id}: ${next.description}`));
    console.log("");
  }
}

async function runImpact(featureId: string) {
  const cwd = process.cwd();

  const featureList = await loadFeatureList(cwd);
  if (!featureList) {
    console.log(chalk.red("✗ No feature list found."));
    return;
  }

  const feature = findFeatureById(featureList.features, featureId);
  if (!feature) {
    console.log(chalk.red(`✗ Feature '${featureId}' not found.`));
    return;
  }

  // Find dependent features
  const dependents = featureList.features.filter((f) => f.dependsOn.includes(featureId));

  // Find same-module features
  const sameModule = featureList.features.filter(
    (f) => f.module === feature.module && f.id !== featureId && f.status !== "deprecated"
  );

  console.log("");
  console.log(chalk.bold.blue(`🔍 Impact Analysis: ${featureId}`));
  console.log("");

  if (dependents.length > 0) {
    console.log(chalk.bold.yellow("   ⚠ Directly Affected Features:"));
    for (const f of dependents) {
      console.log(chalk.yellow(`   → ${f.id} (${f.status}) - depends on this feature`));
    }
    console.log("");
  }

  if (sameModule.length > 0) {
    console.log(chalk.bold.gray("   📁 Same Module (review recommended):"));
    for (const f of sameModule.slice(0, 10)) {
      console.log(chalk.gray(`   → ${f.id} (${f.status})`));
    }
    if (sameModule.length > 10) {
      console.log(chalk.gray(`   ... and ${sameModule.length - 10} more`));
    }
    console.log("");
  }

  if (dependents.length === 0 && sameModule.length === 0) {
    console.log(chalk.green("   ✓ No other features appear to be affected"));
    console.log("");
  }

  // Recommendations
  if (dependents.length > 0) {
    console.log(chalk.bold("   Recommendations:"));
    console.log(chalk.white("   1. Review and test dependent features"));
    console.log(chalk.white("   2. Mark uncertain features as 'needs_review'"));
    console.log(chalk.white("   3. Update feature notes with impact details"));
    console.log("");
  }
}

async function runCheck(
  featureId: string,
  verbose: boolean,
  skipChecks: boolean,
  autonomous: boolean = false,
  testMode: "full" | "quick" | "skip" = "full",
  testPattern?: string,
  skipE2E: boolean = false,
  e2eMode?: "full" | "smoke" | "tags" | "skip"
) {
  const cwd = process.cwd();

  // Load feature list
  const featureList = await loadFeatureList(cwd);
  if (!featureList) {
    console.log(chalk.red("✗ No feature list found. Run 'agent-foreman init' first."));
    process.exit(1);
  }

  // Find feature
  const feature = findFeatureById(featureList.features, featureId);
  if (!feature) {
    console.log(chalk.red(`✗ Feature '${featureId}' not found.`));
    process.exit(1);
  }

  console.log(chalk.bold.blue("\n═══════════════════════════════════════════════════════════════"));
  console.log(chalk.bold.blue("                    FEATURE VERIFICATION"));
  console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════\n"));

  console.log(chalk.bold(`📋 Feature: ${chalk.cyan(feature.id)}`));
  console.log(chalk.gray(`   Module: ${feature.module} | Priority: ${feature.priority}`));
  if (autonomous) {
    console.log(chalk.cyan(`   Mode: Autonomous AI exploration`));
  }
  if (testMode === "quick") {
    console.log(chalk.cyan(`   Test mode: Quick (selective tests)`));
  }
  console.log("");
  console.log(chalk.bold("📝 Acceptance Criteria:"));
  feature.acceptance.forEach((a, i) => {
    console.log(chalk.white(`   ${i + 1}. ${a}`));
  });

  // Derive skipE2E from feature.e2eTags: undefined or empty array means skip
  const featureSkipsE2E = !feature.e2eTags || feature.e2eTags.length === 0;
  const effectiveSkipE2E = skipE2E || featureSkipsE2E;

  // Run verification (choose mode)
  const verifyOptions = {
    verbose,
    skipChecks,
    testMode,
    testPattern,
    skipE2E: effectiveSkipE2E,
    e2eTags: feature.e2eTags,
    e2eMode,
  };
  const result = autonomous
    ? await verifyFeatureAutonomous(cwd, feature, verifyOptions)
    : await verifyFeature(cwd, feature, verifyOptions);

  // Display result
  console.log(formatVerificationResult(result, verbose));

  // Update feature with verification summary
  const summary = createVerificationSummary(result);
  featureList.features = updateFeatureVerification(
    featureList.features,
    featureId,
    summary
  );

  // Save feature list
  await saveFeatureList(cwd, featureList);

  // Log to progress
  await appendProgressLog(
    cwd,
    createVerifyEntry(
      featureId,
      result.verdict,
      `Verified ${featureId}: ${result.verdict}`
    )
  );

  console.log(chalk.gray(`\n   Results saved to ai/verification/results.json`));
  console.log(chalk.gray(`   Feature list updated with verification summary`));

  // Suggest next action
  if (result.verdict === "pass") {
    console.log(chalk.green("\n   ✓ Feature verified successfully!"));
    console.log(chalk.cyan(`   Run 'agent-foreman done ${featureId}' to mark as passing`));
  } else if (result.verdict === "fail") {
    console.log(chalk.red("\n   ✗ Verification failed. Review the criteria above and fix issues."));
  } else {
    console.log(chalk.yellow("\n   ⚠ Needs review. Some criteria could not be verified automatically."));
  }
}

/**
 * Prompt user for yes/no confirmation
 */
async function promptConfirmation(message: string): Promise<boolean> {
  const readline = await import("node:readline");
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise((resolve) => {
    rl.question(`${message} (y/n): `, (answer) => {
      rl.close();
      resolve(answer.toLowerCase() === "y" || answer.toLowerCase() === "yes");
    });
  });
}

async function runDone(
  featureId: string,
  notes?: string,
  autoCommit: boolean = true,
  skipVerify: boolean = false,
  verbose: boolean = false,
  autonomous: boolean = false,
  testMode: "full" | "quick" | "skip" = "full",
  testPattern?: string,
  skipE2E: boolean = false,
  e2eMode?: "full" | "smoke" | "tags" | "skip"
) {
  const cwd = process.cwd();

  const featureList = await loadFeatureList(cwd);
  if (!featureList) {
    console.log(chalk.red("✗ No feature list found."));
    process.exit(1);
  }

  const feature = findFeatureById(featureList.features, featureId);
  if (!feature) {
    console.log(chalk.red(`✗ Feature '${featureId}' not found.`));
    process.exit(1);
  }

  // ─────────────────────────────────────────────────────────────────
  // Test File Gate: Verify required test files exist before verification
  // ─────────────────────────────────────────────────────────────────
  if (feature.testRequirements) {
    console.log(chalk.bold.blue("\n═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold.blue("                    TEST FILE VERIFICATION"));
    console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════\n"));

    const gateResult = await verifyTestFilesExist(cwd, feature);

    if (!gateResult.passed) {
      console.log(chalk.red("   ✗ Required test files are missing:"));

      if (gateResult.missingUnitTests.length > 0) {
        console.log(chalk.yellow("\n   Missing Unit Tests:"));
        gateResult.missingUnitTests.forEach((pattern) => {
          console.log(chalk.white(`     • ${pattern}`));
        });
      }

      if (gateResult.missingE2ETests.length > 0) {
        console.log(chalk.yellow("\n   Missing E2E Tests:"));
        gateResult.missingE2ETests.forEach((pattern) => {
          console.log(chalk.white(`     • ${pattern}`));
        });
      }

      if (gateResult.errors.length > 0) {
        console.log(chalk.red("\n   Errors:"));
        gateResult.errors.forEach((error) => {
          console.log(chalk.red(`     • ${error}`));
        });
      }

      console.log(chalk.cyan("\n   Create the required tests before completing this feature."));
      console.log(chalk.gray("   See TDD guidance from 'agent-foreman next' for test file suggestions."));
      process.exit(1);
    }

    console.log(chalk.green("   ✓ All required test files exist"));
    if (gateResult.foundTestFiles.length > 0) {
      console.log(chalk.gray(`   Found: ${gateResult.foundTestFiles.slice(0, 3).join(", ")}${gateResult.foundTestFiles.length > 3 ? ` and ${gateResult.foundTestFiles.length - 3} more` : ""}`));
    }
    console.log("");
  }

  // Step 1: Run verification (unless skipped)
  if (skipVerify) {
    console.log(chalk.yellow("⚠ Skipping verification (--skip-verify flag)"));
    console.log(chalk.gray("  Note: It's recommended to run verification before marking complete"));
  } else {
    console.log(chalk.bold.blue("\n═══════════════════════════════════════════════════════════════"));
    console.log(chalk.bold.blue("                    FEATURE VERIFICATION"));
    console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════\n"));

    console.log(chalk.bold(`📋 Feature: ${chalk.cyan(feature.id)}`));
    console.log(chalk.gray(`   Module: ${feature.module} | Priority: ${feature.priority}`));
    if (autonomous) {
      console.log(chalk.cyan(`   Mode: Autonomous AI exploration`));
    }
    if (testMode === "quick") {
      console.log(chalk.cyan(`   Test mode: Quick (selective tests)`));
    }
    console.log("");
    console.log(chalk.bold("📝 Acceptance Criteria:"));
    feature.acceptance.forEach((a, i) => {
      console.log(chalk.white(`   ${i + 1}. ${a}`));
    });

    // Derive skipE2E from feature.e2eTags: undefined or empty array means skip
    const featureSkipsE2E = !feature.e2eTags || feature.e2eTags.length === 0;
    const effectiveSkipE2E = skipE2E || featureSkipsE2E;

    // Run verification (choose mode)
    const verifyOptions = {
      verbose,
      skipChecks: false,
      testMode,
      testPattern,
      skipE2E: effectiveSkipE2E,
      e2eTags: feature.e2eTags,
      e2eMode,
    };
    const result = autonomous
      ? await verifyFeatureAutonomous(cwd, feature, verifyOptions)
      : await verifyFeature(cwd, feature, verifyOptions);

    // Display result
    console.log(formatVerificationResult(result, verbose));

    // Update feature with verification summary
    const summary = createVerificationSummary(result);
    featureList.features = updateFeatureVerification(
      featureList.features,
      featureId,
      summary
    );

    // Save verification summary to feature list
    await saveFeatureList(cwd, featureList);

    // Log verification to progress
    await appendProgressLog(
      cwd,
      createVerifyEntry(
        featureId,
        result.verdict,
        `Verified ${featureId}: ${result.verdict}`
      )
    );

    console.log(chalk.gray(`\n   Results saved to ai/verification/results.json`));

    // Handle verdict
    if (result.verdict === "fail") {
      console.log(chalk.red("\n   ✗ Verification failed. Feature NOT marked as complete."));
      console.log(chalk.yellow("   Fix the issues above and run again."));
      process.exit(1);
    }

    if (result.verdict === "needs_review") {
      console.log(chalk.yellow("\n   ⚠ Some criteria could not be verified automatically."));
      const confirmed = await promptConfirmation(chalk.yellow("   Do you still want to mark this feature as complete?"));
      if (!confirmed) {
        console.log(chalk.gray("\n   Feature NOT marked as complete."));
        process.exit(0);
      }
      console.log(chalk.gray("   Proceeding with user confirmation..."));
    }

    // Verdict is "pass" or user confirmed "needs_review"
    console.log(chalk.green("\n   ✓ Verification passed!"));
  }

  // Discover and populate testFiles if testRequirements defined
  if (feature.testRequirements) {
    const discoveredFiles = await discoverFeatureTestFiles(cwd, feature);
    if (discoveredFiles.length > 0) {
      // Update feature with discovered test files
      featureList.features = featureList.features.map((f) =>
        f.id === featureId ? { ...f, testFiles: discoveredFiles } : f
      );
    }
  }

  // Step 2: Update status to passing
  featureList.features = updateFeatureStatus(
    featureList.features,
    featureId,
    "passing",
    notes || feature.notes
  );
  // Save
  await saveFeatureList(cwd, featureList);

  // Log progress
  await appendProgressLog(
    cwd,
    createStepEntry(featureId, "passing", "./ai/init.sh check", `Completed ${featureId}`)
  );

  console.log(chalk.green(`\n✓ Marked '${featureId}' as passing`));

  // Auto-commit or suggest (PRD: write clear commit message)
  const shortDesc = feature.description.length > 50
    ? feature.description.substring(0, 47) + "..."
    : feature.description;

  const commitMessage = `feat(${feature.module}): ${feature.description}

Feature: ${featureId}

🤖 Generated with agent-foreman`;

  if (autoCommit && isGitRepo(cwd)) {
    // Auto-commit all changes
    const addResult = gitAdd(cwd, "all");
    if (!addResult.success) {
      console.log(chalk.yellow(`\n⚠ Failed to stage changes: ${addResult.error}`));
      console.log(chalk.cyan("📝 Suggested commit:"));
      console.log(chalk.white(`   git add -A && git commit -m "feat(${feature.module}): ${shortDesc}"`));
    } else {
      const commitResult = gitCommit(cwd, commitMessage);
      if (commitResult.success) {
        console.log(chalk.green(`\n✓ Committed: ${commitResult.commitHash?.substring(0, 7)}`));
        console.log(chalk.gray(`  feat(${feature.module}): ${shortDesc}`));
      } else if (commitResult.error === "Nothing to commit") {
        console.log(chalk.gray("\n  No changes to commit"));
      } else {
        console.log(chalk.yellow(`\n⚠ Failed to commit: ${commitResult.error}`));
        console.log(chalk.cyan("📝 Suggested commit:"));
        console.log(chalk.white(`   git add -A && git commit -m "feat(${feature.module}): ${shortDesc}"`));
      }
    }
  } else {
    console.log(chalk.cyan("\n📝 Suggested commit:"));
    console.log(chalk.white(`   git add -A && git commit -m "feat(${feature.module}): ${shortDesc}"`));
  }

  // Show next feature
  const next = selectNextFeature(featureList.features);
  if (next) {
    console.log(chalk.gray(`\n  Next up: ${next.id}`));
  } else {
    console.log(chalk.green("\n  🎉 All features are now passing!"));

    // Auto-regenerate ARCHITECTURE.md when all features complete
    console.log(chalk.blue("\n📊 Regenerating project survey..."));
    try {
      const aiResult = await aiScanProject(cwd, { verbose: false });
      if (aiResult.success) {
        const structure = await scanDirectoryStructure(cwd);
        const survey = aiResultToSurvey(aiResult, structure);

        // Replace survey.features with actual features from feature index
        // Show actual status (passing/failing) instead of AI confidence
        survey.features = featureList.features.map((f) => ({
          id: f.id,
          description: f.description,
          module: f.module,
          source: "feature_list" as const,
          confidence: f.status === "passing" ? 1.0 : 0.0,
          status: f.status,
        }));

        // Override completion to 100% since all features are passing
        const passingCount = featureList.features.filter((f) => f.status === "passing").length;
        const totalCount = featureList.features.length;
        survey.completion = {
          overall: Math.round((passingCount / totalCount) * 100),
          byModule: Object.fromEntries(
            survey.modules.map((m) => [m.name, 100])
          ),
          notes: [
            "All features are passing",
            `Completed ${passingCount}/${totalCount} features`,
            `Last updated: ${new Date().toISOString().split("T")[0]}`
          ]
        };
        const markdown = generateAISurveyMarkdown(survey, aiResult);
        const surveyPath = path.join(cwd, "docs/ARCHITECTURE.md");
        await fs.mkdir(path.dirname(surveyPath), { recursive: true });
        await fs.writeFile(surveyPath, markdown);
        console.log(chalk.green("✓ Updated docs/ARCHITECTURE.md (100% complete)"));
      }
    } catch {
      console.log(chalk.yellow("⚠ Could not regenerate survey (AI agent unavailable)"));
    }
  }
}

/**
 * Run detect-capabilities command
 */
async function runDetectCapabilities(
  force: boolean,
  verbose: boolean
) {
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

// Run CLI
main().catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
