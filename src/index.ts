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
} from "./capability-detector.js";
import type { FeatureVerificationSummary } from "./verification-types.js";
import type { InitMode, Feature } from "./types.js";
import { isGitRepo, hasUncommittedChanges, gitAdd, gitCommit } from "./git-utils.js";
import {
  detectAndAnalyzeProject,
  mergeOrCreateFeatures,
  generateHarnessFiles,
} from "./init-helpers.js";
import { createSpinner, createProgressBar } from "./progress.js";

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
  await yargs(hideBin(process.argv))
    .scriptName("agent-foreman")
    .usage("$0 <command> [options]")
    .command(
      "survey [output]",
      "Generate AI-powered project survey report",
      (yargs) =>
        yargs
          .positional("output", {
            describe: "Output path for survey markdown",
            type: "string",
            default: "docs/PROJECT_SURVEY.md",
          })
          .option("verbose", {
            alias: "v",
            type: "boolean",
            default: false,
            describe: "Show detailed output",
          })
          .option("bilingual", {
            alias: "b",
            type: "boolean",
            default: false,
            describe: "Include inline Chinese translations (legacy format)",
          })
          .option("zh", {
            type: "boolean",
            default: false,
            describe: "Also generate Chinese translation file (PROJECT_SURVEY.zh-CN.md)",
          }),
      async (argv) => {
        await runSurvey(argv.output, argv.verbose, argv.bilingual, argv.zh);
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
      "step [feature_id]",
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
          }),
      async (argv) => {
        await runStep(argv.feature_id, argv.dryRun, argv.check, argv.allowDirty, argv.json, argv.quiet);
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
      "complete <feature_id>",
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
          }),
      async (argv) => {
        await runComplete(argv.feature_id!, argv.notes, !argv.noCommit, argv.skipVerify, argv.verbose, !argv.noAutonomous);
      }
    )
    .command(
      "verify <feature_id>",
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
          }),
      async (argv) => {
        await runVerify(argv.feature_id!, argv.verbose, argv.skipChecks, !argv.noAutonomous);
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
          .option("ai", {
            type: "boolean",
            default: false,
            describe: "Force AI-based detection (skip presets)",
          })
          .option("verbose", {
            alias: "v",
            type: "boolean",
            default: false,
            describe: "Show detailed detection output",
          }),
      async (argv) => {
        await runDetectCapabilities(argv.force, argv.ai, argv.verbose);
      }
    )
    .command(
      "install-commands",
      "Install foreman slash commands to ~/.claude/commands/",
      (yargs) =>
        yargs.option("force", {
          alias: "f",
          type: "boolean",
          default: false,
          describe: "Force overwrite existing commands",
        }),
      async (argv) => {
        await runInstallCommands(argv.force);
      }
    )
    .demandCommand(1, "You need at least one command")
    .help()
    .version()
    .parseAsync();
}

// ============================================================================
// Command Implementations
// ============================================================================

async function runSurvey(outputPath: string, verbose: boolean, bilingual: boolean = false, generateZh: boolean = false) {
  const cwd = process.cwd();

  console.log(chalk.blue("🤖 AI-powered project scan (priority: Codex > Gemini > Claude)"));
  if (verbose) {
    printAgentStatus();
  }

  const spinner = createSpinner("Analyzing project with AI");
  const aiResult = await aiScanProject(cwd, { verbose });

  if (!aiResult.success) {
    spinner.fail(`AI analysis failed: ${aiResult.error}`);
    console.log(chalk.yellow("  Make sure gemini, codex, or claude CLI is installed"));
    process.exit(1);
  }

  spinner.succeed(`AI analysis successful (agent: ${aiResult.agentUsed})`);

  const structure = await scanDirectoryStructure(cwd);
  const survey = aiResultToSurvey(aiResult, structure);

  // Generate English-only markdown by default, or bilingual if flag is set
  const markdown = generateAISurveyMarkdown(survey, aiResult, { bilingual });
  const fullPath = path.join(cwd, outputPath);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, markdown);

  console.log(chalk.green(`✓ Survey written to ${outputPath}`));

  // Generate Chinese translation file if requested
  if (generateZh) {
    const zhPath = outputPath.replace(/\.md$/, ".zh-CN.md");
    const zhMarkdown = generateAISurveyMarkdown(survey, aiResult, { language: "zh-CN" });
    await fs.writeFile(path.join(cwd, zhPath), zhMarkdown);
    console.log(chalk.green(`✓ Chinese translation written to ${zhPath}`));
  }

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

  // Step 1: Detect project type and analyze with AI
  const spinner = createSpinner("Analyzing project with AI");
  const analysisResult = await detectAndAnalyzeProject(cwd, goal, verbose);

  if (!analysisResult.success || !analysisResult.survey) {
    spinner.fail(`AI analysis failed: ${analysisResult.error}`);
    console.log(chalk.yellow("  Make sure gemini, codex, or claude CLI is installed"));
    process.exit(1);
  }

  spinner.succeed(`AI analysis successful (agent: ${analysisResult.agentUsed})`);

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

  // Step 5-8: Generate harness files (init.sh, CLAUDE.md, progress.md)
  await generateHarnessFiles(cwd, analysisResult.survey, featureList, goal, mode);

  console.log(chalk.bold.green("\n🎉 Harness initialized successfully!"));
  console.log(chalk.gray("Next: Run 'agent-foreman step' to start working on features"));
}

async function runStep(
  featureId: string | undefined,
  dryRun: boolean,
  runCheck: boolean = false,
  allowDirty: boolean = false,
  outputJson: boolean = false,
  quiet: boolean = false
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
  console.log(chalk.gray("   When done, run: ") + chalk.cyan(`agent-foreman complete ${feature.id}`));
  console.log(chalk.bold.blue("═══════════════════════════════════════════════════════════════\n"));

  if (dryRun) {
    console.log(chalk.yellow("   [Dry run - no changes made]"));
  }

  // Output feature guidance (for AI consumption)
  console.log(generateFeatureGuidance(feature));
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
  const completion = getCompletionPercentage(featureList.features);
  const recentEntries = await getRecentEntries(cwd, 5);
  const next = selectNextFeature(featureList.features);

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

async function runVerify(featureId: string, verbose: boolean, skipChecks: boolean, autonomous: boolean = false) {
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
  console.log("");
  console.log(chalk.bold("📝 Acceptance Criteria:"));
  feature.acceptance.forEach((a, i) => {
    console.log(chalk.white(`   ${i + 1}. ${a}`));
  });

  // Run verification (choose mode)
  const result = autonomous
    ? await verifyFeatureAutonomous(cwd, feature, { verbose, skipChecks })
    : await verifyFeature(cwd, feature, { verbose, skipChecks });

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
    console.log(chalk.cyan(`   Run 'agent-foreman complete ${featureId}' to mark as passing`));
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

async function runComplete(
  featureId: string,
  notes?: string,
  autoCommit: boolean = true,
  skipVerify: boolean = false,
  verbose: boolean = false,
  autonomous: boolean = false
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
    console.log("");
    console.log(chalk.bold("📝 Acceptance Criteria:"));
    feature.acceptance.forEach((a, i) => {
      console.log(chalk.white(`   ${i + 1}. ${a}`));
    });

    // Run verification (choose mode)
    const result = autonomous
      ? await verifyFeatureAutonomous(cwd, feature, { verbose, skipChecks: false })
      : await verifyFeature(cwd, feature, { verbose, skipChecks: false });

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

    // Auto-regenerate PROJECT_SURVEY.md when all features complete
    console.log(chalk.blue("\n📊 Regenerating project survey..."));
    try {
      const aiResult = await aiScanProject(cwd, { verbose: false });
      if (aiResult.success) {
        const structure = await scanDirectoryStructure(cwd);
        const survey = aiResultToSurvey(aiResult, structure);

        // Replace survey.features with actual features from feature_list.json
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
        const surveyPath = path.join(cwd, "docs/PROJECT_SURVEY.md");
        await fs.mkdir(path.dirname(surveyPath), { recursive: true });
        await fs.writeFile(surveyPath, markdown);
        console.log(chalk.green("✓ Updated docs/PROJECT_SURVEY.md (100% complete)"));
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
  forceAI: boolean,
  verbose: boolean
) {
  const cwd = process.cwd();

  console.log(chalk.blue("🔍 Detecting project verification capabilities..."));

  if (force) {
    console.log(chalk.gray("   (forcing re-detection, ignoring cache)"));
  }
  if (forceAI) {
    console.log(chalk.gray("   (forcing AI-based detection)"));
  }

  const spinner = createSpinner("Detecting capabilities");

  try {
    const capabilities = await detectCapabilities(cwd, {
      force,
      forceAI,
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
 * Install foreman slash commands to ~/.claude/commands/
 */
async function runInstallCommands(force: boolean) {
  const { homedir } = await import("node:os");
  const { fileURLToPath } = await import("node:url");
  const { dirname } = await import("node:path");

  const COMMAND_FILES = [
    "foreman-survey.md",
    "foreman-init.md",
    "foreman-step.md",
  ];

  const claudeCommandsDir = path.join(homedir(), ".claude", "commands");

  // Find commands directory relative to the installed package
  // When running from source: src/index.ts -> ../commands
  // When running from dist: dist/index.js -> ../commands
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  const sourceDir = path.join(__dirname, "..", "commands");

  console.log(chalk.blue("📦 Installing foreman slash commands..."));

  try {
    // Create ~/.claude/commands/ if it doesn't exist
    await fs.mkdir(claudeCommandsDir, { recursive: true });

    let installed = 0;
    let skipped = 0;
    let overwritten = 0;

    for (const file of COMMAND_FILES) {
      const sourcePath = path.join(sourceDir, file);
      const destPath = path.join(claudeCommandsDir, file);

      try {
        // Check if source file exists
        await fs.access(sourcePath);

        // Check if destination already exists
        let exists = false;
        try {
          await fs.access(destPath);
          exists = true;
        } catch {
          // File doesn't exist
        }

        if (exists && !force) {
          console.log(chalk.gray(`   Skipped: ${file} (already exists)`));
          skipped++;
          continue;
        }

        await fs.copyFile(sourcePath, destPath);

        if (exists) {
          console.log(chalk.yellow(`   Overwritten: ${file}`));
          overwritten++;
        } else {
          console.log(chalk.green(`   Installed: ${file}`));
          installed++;
        }
      } catch (err) {
        console.log(chalk.red(`   Failed: ${file} - ${(err as Error).message}`));
      }
    }

    console.log("");
    if (installed > 0 || overwritten > 0) {
      console.log(chalk.green(`✓ Installed ${installed + overwritten} command(s) to ~/.claude/commands/`));
    }
    if (skipped > 0) {
      console.log(chalk.gray(`  Skipped ${skipped} existing command(s). Use --force to overwrite.`));
    }
    console.log("");
    console.log(chalk.cyan("  Available commands:"));
    console.log(chalk.white("    /foreman-survey - Analyze project structure"));
    console.log(chalk.white("    /foreman-init   - Initialize harness"));
    console.log(chalk.white("    /foreman-step   - Work on next feature"));
  } catch (err) {
    console.error(chalk.red(`\n✗ Installation failed: ${(err as Error).message}`));
    process.exit(1);
  }
}

// Run CLI
main().catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
