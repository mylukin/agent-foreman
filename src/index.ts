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
  getRecentEntries,
} from "./progress-log.js";
import { generateInitScript, generateMinimalInitScript } from "./init-script.js";
import { generateClaudeMd, mergeClaudeMd, generateHarnessSection, generateFeatureGuidance } from "./prompts.js";
import type { InitMode, Feature } from "./types.js";

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
          }),
      async (argv) => {
        await runSurvey(argv.output, argv.verbose);
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
          }),
      async (argv) => {
        await runStep(argv.feature_id, argv.dryRun, argv.check);
      }
    )
    .command(
      "status",
      "Show current harness status",
      {},
      async () => {
        await runStatus();
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
      "Mark a feature as complete",
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
          }),
      async (argv) => {
        await runComplete(argv.feature_id!, argv.notes);
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
    .demandCommand(1, "You need at least one command")
    .help()
    .version()
    .parseAsync();
}

// ============================================================================
// Command Implementations
// ============================================================================

async function runSurvey(outputPath: string, verbose: boolean) {
  const cwd = process.cwd();

  console.log(chalk.blue("🤖 AI-powered project scan (priority: Gemini > Codex > Claude)"));
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

  console.log(chalk.green(`✓ Survey written to ${outputPath}`));
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

async function runInit(goal: string, mode: InitMode, verbose: boolean) {
  const cwd = process.cwd();
  const { spawnSync } = await import("node:child_process");
  console.log(chalk.blue(`🚀 Initializing harness (mode: ${mode})...`));

  // Step 1: Determine feature source based on project state
  // Priority: survey > existing code scan > goal-based generation
  const surveyPath = path.join(cwd, "docs/PROJECT_SURVEY.md");
  let aiResult;

  try {
    const surveyContent = await fs.readFile(surveyPath, "utf-8");
    console.log(chalk.green(`✓ Found PROJECT_SURVEY.md`));

    // Use survey + goal to generate features
    aiResult = await generateFeaturesFromSurvey(surveyContent, goal);
  } catch {
    // No survey file - check if project has source code
    const empty = await isProjectEmpty(cwd);

    if (empty) {
      // Empty project: generate features from goal description
      console.log(chalk.gray("  New/empty project detected, generating features from goal..."));
      if (verbose) {
        printAgentStatus();
      }

      aiResult = await generateFeaturesFromGoal(goal);
    } else {
      // Has source code: auto-run survey first, then use it
      console.log(chalk.gray("  No PROJECT_SURVEY.md found, auto-generating survey..."));
      if (verbose) {
        printAgentStatus();
      }

      aiResult = await aiScanProject(cwd, { verbose });

      // Auto-save survey for future use
      if (aiResult.success) {
        const tempStructure = await scanDirectoryStructure(cwd);
        const tempSurvey = aiResultToSurvey(aiResult, tempStructure);
        const surveyMarkdown = generateAISurveyMarkdown(tempSurvey, aiResult);

        await fs.mkdir(path.dirname(surveyPath), { recursive: true });
        await fs.writeFile(surveyPath, surveyMarkdown);
        console.log(chalk.green(`✓ Auto-generated docs/PROJECT_SURVEY.md`));
      }
    }
  }

  if (!aiResult.success) {
    console.log(chalk.red(`✗ AI analysis failed: ${aiResult.error}`));
    console.log(chalk.yellow("  Make sure gemini, codex, or claude CLI is installed"));
    process.exit(1);
  }

  console.log(chalk.green(`✓ AI analysis successful (agent: ${aiResult.agentUsed})`));

  const structure = await scanDirectoryStructure(cwd);
  const survey = aiResultToSurvey(aiResult, structure);

  if (verbose) {
    console.log(chalk.gray(`  Found ${survey.features.length} features`));
  }

  // Step 2: Load existing feature list or create new
  let featureList = await loadFeatureList(cwd);

  if (mode === "new" || !featureList) {
    featureList = createEmptyFeatureList(goal);
  } else {
    // Update goal if provided
    featureList.metadata.projectGoal = goal;
  }

  // Step 3: Convert discovered features to Feature objects
  const discoveredFeatures: Feature[] = survey.features.map((df, idx) =>
    discoveredToFeature(df, idx)
  );

  // Step 4: Merge or replace based on mode
  if (mode === "merge") {
    const beforeCount = featureList.features.length;
    featureList.features = mergeFeatures(featureList.features, discoveredFeatures);
    const addedCount = featureList.features.length - beforeCount;
    if (verbose && addedCount > 0) {
      console.log(chalk.gray(`  Added ${addedCount} new features`));
    }
  } else if (mode === "new") {
    featureList.features = discoveredFeatures;
  }
  // mode === "scan" doesn't modify the list

  // Step 5: Save feature list
  if (mode !== "scan") {
    await saveFeatureList(cwd, featureList);
    console.log(chalk.green(`✓ Feature list saved with ${featureList.features.length} features`));
  } else {
    console.log(chalk.yellow(`ℹ Scan mode: ${discoveredFeatures.length} features discovered (not saved)`));
  }

  // Step 6: Generate init.sh
  const initScript =
    survey.commands.install || survey.commands.dev || survey.commands.test
      ? generateInitScript(survey.commands)
      : generateMinimalInitScript();

  await fs.mkdir(path.join(cwd, "ai"), { recursive: true });
  await fs.writeFile(path.join(cwd, "ai/init.sh"), initScript);
  await fs.chmod(path.join(cwd, "ai/init.sh"), 0o755);
  console.log(chalk.green("✓ Generated ai/init.sh"));

  // Step 7: Generate or update CLAUDE.md
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  let claudeMdExists = false;
  let existingClaudeMd = "";

  try {
    existingClaudeMd = await fs.readFile(claudeMdPath, "utf-8");
    claudeMdExists = true;
  } catch {
    // File doesn't exist, will create new
  }

  if (claudeMdExists && existingClaudeMd.trim().length > 0) {
    // Use AI agent to intelligently merge harness section into existing CLAUDE.md
    console.log(chalk.blue("  CLAUDE.md exists, using AI to merge harness section..."));

    const harnessSection = generateHarnessSection(goal);
    const mergePrompt = `You are updating a CLAUDE.md file. Your task is to intelligently merge the new "Long-Task Harness" section into the existing content.

## Existing CLAUDE.md content:
\`\`\`markdown
${existingClaudeMd}
\`\`\`

## New harness section to add:
\`\`\`markdown
${harnessSection}
\`\`\`

## Rules:
1. If the existing file already has a "Long-Task Harness" section or agent-foreman markers, replace it with the new section
2. If the existing file doesn't have the harness section, append it at the END of the file
3. Preserve ALL existing content that is not related to agent-foreman
4. Do NOT modify, delete, or reorganize any existing sections (like "Project Instructions", custom rules, etc.)
5. Keep the document structure clean and readable
6. The harness section should be clearly separated from existing content

## Output:
Return ONLY the complete merged CLAUDE.md content, nothing else. No explanations, no code blocks, just the raw markdown content.`;

    const result = await callAnyAvailableAgent(mergePrompt, { cwd });

    if (result.success && result.output.trim().length > 0) {
      await fs.writeFile(claudeMdPath, result.output.trim() + "\n");
      console.log(chalk.green("✓ Updated CLAUDE.md (merged by AI)"));
    } else {
      // Fallback to programmatic merge
      console.log(chalk.yellow("  AI merge failed, using fallback merge..."));
      const mergedContent = mergeClaudeMd(existingClaudeMd, goal);
      await fs.writeFile(claudeMdPath, mergedContent);
      console.log(chalk.green("✓ Updated CLAUDE.md (fallback merge)"));
    }
  } else {
    // Create new CLAUDE.md
    const claudeMd = generateClaudeMd(goal);
    await fs.writeFile(claudeMdPath, claudeMd);
    console.log(chalk.green("✓ Generated CLAUDE.md"));
  }

  // Step 8: Write progress log entry
  if (mode !== "scan") {
    await appendProgressLog(
      cwd,
      createInitEntry(goal, `mode=${mode}, features=${featureList.features.length}`)
    );
    console.log(chalk.green("✓ Updated ai/progress.md"));
  }

  // Step 9: Suggest git commit (changed from auto-commit to suggestion)
  if (mode !== "scan") {
    console.log(chalk.cyan("\n📝 Suggested git commit:"));
    console.log(chalk.white('   git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"'));
  }

  console.log(chalk.bold.green("\n🎉 Harness initialized successfully!"));
  console.log(chalk.gray("Next: Run 'agent-foreman step' to start working on features"));
}

async function runStep(featureId: string | undefined, dryRun: boolean, runCheck: boolean = false) {
  const cwd = process.cwd();
  const { spawnSync } = await import("node:child_process");

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
  // 4. Feature List Status
  // ─────────────────────────────────────────────────────────────────
  const featureList = await loadFeatureList(cwd);
  if (!featureList) {
    console.log(chalk.red("✗ No feature list found. Run 'agent-foreman init' first."));
    process.exit(1);
  }

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
  // 6. Select Next Feature
  // ─────────────────────────────────────────────────────────────────
  let feature: Feature | undefined;

  if (featureId) {
    feature = findFeatureById(featureList.features, featureId);
    if (!feature) {
      console.log(chalk.red(`✗ Feature '${featureId}' not found.`));
      process.exit(1);
    }
  } else {
    feature = selectNextFeature(featureList.features) ?? undefined;
    if (!feature) {
      console.log(chalk.green("🎉 All features are passing or blocked. Nothing to do!"));
      return;
    }
  }

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

async function runStatus() {
  const cwd = process.cwd();

  const featureList = await loadFeatureList(cwd);
  if (!featureList) {
    console.log(chalk.red("✗ No feature list found. Run 'agent-foreman init <goal>' first."));
    return;
  }

  const stats = getFeatureStats(featureList.features);
  const completion = getCompletionPercentage(featureList.features);
  const recentEntries = await getRecentEntries(cwd, 5);

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
  const next = selectNextFeature(featureList.features);
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

async function runComplete(featureId: string, notes?: string) {
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

  // Update status
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

  console.log(chalk.green(`✓ Marked '${featureId}' as passing`));

  // Suggest git commit (PRD: write clear commit message)
  const shortDesc = feature.description.length > 50
    ? feature.description.substring(0, 47) + "..."
    : feature.description;
  console.log(chalk.cyan("\n📝 Suggested commit:"));
  console.log(chalk.white(`   git add -A && git commit -m "feat(${feature.module}): ${shortDesc}"`));

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

// Run CLI
main().catch((err) => {
  console.error(chalk.red(err.message));
  process.exit(1);
});
