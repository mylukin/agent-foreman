/**
 * Next command - Show next feature to work on or specific feature details
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import type { Feature } from "../types.js";
import type { CachedTDDGuidance } from "../types.js";
import {
  loadFeatureList,
  saveFeatureList,
  selectNextFeature,
  findFeatureById,
  getFeatureStats,
  getCompletionPercentage,
} from "../feature-list.js";
import { getRecentEntries } from "../progress-log.js";
import { generateFeatureGuidance } from "../prompts.js";
import { detectCapabilities } from "../capabilities/index.js";
import { isGitRepo, hasUncommittedChanges } from "../git-utils.js";
import { generateTDDGuidance, type TDDGuidance } from "../tdd-guidance/index.js";
import { generateTDDGuidanceWithAI } from "../tdd-ai-generator.js";

/**
 * Run the next command
 */
export async function runNext(
  featureId: string | undefined,
  dryRun: boolean,
  runCheck: boolean = false,
  allowDirty: boolean = false,
  outputJson: boolean = false,
  quiet: boolean = false,
  refreshGuidance: boolean = false
): Promise<void> {
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
  console.log(chalk.gray("   When done:"));
  console.log(chalk.gray("     1. Verify:   ") + chalk.cyan(`agent-foreman check ${feature.id}`));
  console.log(chalk.gray("     2. Complete: ") + chalk.cyan(`agent-foreman done ${feature.id}`));
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
    // Check cache validity FIRST (unless --refresh-guidance is set)
    // This avoids expensive detectCapabilities call when cache is valid
    const isCacheValid =
      !refreshGuidance &&
      feature.tddGuidance &&
      feature.tddGuidance.forVersion === feature.version;

    let guidance: TDDGuidance | CachedTDDGuidance;
    let isCached = false;
    let isAIGenerated = false;
    let capabilities: Awaited<ReturnType<typeof detectCapabilities>> | null = null;

    if (isCacheValid && feature.tddGuidance) {
      // Use cached AI guidance - no need for capabilities detection
      guidance = feature.tddGuidance;
      isCached = true;
      isAIGenerated = true;
    } else {
      // Cache miss - need to generate new guidance, detect capabilities
      capabilities = await detectCapabilities(cwd, { verbose: false });

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

    // Check TDD mode from metadata
    const tddMode = featureList.metadata.tddMode || "recommended";
    const isStrictTDD = tddMode === "strict";
    const hasRequiredTests =
      feature.testRequirements?.unit?.required ||
      feature.testRequirements?.e2e?.required;

    // Show enforcement warning for strict mode
    if (isStrictTDD || hasRequiredTests) {
      console.log(chalk.bold.red("\n!!! TDD ENFORCEMENT ACTIVE !!!"));
      console.log(
        chalk.red("   Tests are REQUIRED for this feature to pass verification.")
      );
      console.log(
        chalk.red("   The 'check' and 'done' commands will fail without tests.\n")
      );
    }

    // Display TDD guidance header with appropriate styling
    const headerColor = isStrictTDD ? chalk.bold.red : chalk.bold.magenta;
    const headerText = isStrictTDD ? "TDD GUIDANCE (REQUIRED)" : "TDD GUIDANCE";
    console.log(headerColor("═══════════════════════════════════════════════════════════════"));
    console.log(headerColor(`                    ${headerText}`));
    console.log(headerColor("═══════════════════════════════════════════════════════════════\n"));

    // Show TDD workflow instructions for strict mode
    if (isStrictTDD || hasRequiredTests) {
      console.log(chalk.bold.yellow("📋 TDD Workflow (MANDATORY):"));
      console.log(chalk.white("   1. RED:      Create test file(s), write failing tests"));
      console.log(chalk.white("   2. GREEN:    Implement minimum code to pass tests"));
      console.log(chalk.white("   3. REFACTOR: Clean up under test protection"));
      console.log(chalk.white(`   4. CHECK:    Run 'agent-foreman check ${feature.id}'`));
      console.log(chalk.white(`   5. DONE:     Run 'agent-foreman done ${feature.id}'`));
      console.log("");
    }

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
