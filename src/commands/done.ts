/**
 * Done command - Verify and mark a feature as complete
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import {
  loadFeatureList,
  saveFeatureList,
  findFeatureById,
  selectNextFeature,
  updateFeatureStatus,
  updateFeatureVerification,
  getFeatureStats,
  getCompletionPercentage,
} from "../feature-list.js";
import {
  appendProgressLog,
  createStepEntry,
  createVerifyEntry,
} from "../progress-log.js";
import {
  verifyFeature,
  verifyFeatureAutonomous,
  createVerificationSummary,
  formatVerificationResult,
} from "../verifier/index.js";
import { isGitRepo, gitAdd, gitCommit } from "../git-utils.js";
import { verifyTestFilesExist, discoverFeatureTestFiles, verifyTDDGate } from "../test-gate.js";
import { aiScanProject, aiResultToSurvey, generateAISurveyMarkdown } from "../ai-scanner.js";
import { scanDirectoryStructure } from "../project-scanner.js";
import { promptConfirmation } from "./helpers.js";

/**
 * Run the done command
 */
export async function runDone(
  featureId: string,
  notes?: string,
  autoCommit: boolean = true,
  skipCheck: boolean = false,
  verbose: boolean = false,
  autonomous: boolean = false,
  testMode: "full" | "quick" | "skip" = "full",
  testPattern?: string,
  skipE2E: boolean = false,
  e2eMode?: "full" | "smoke" | "tags" | "skip",
  loopMode: boolean = false
): Promise<void> {
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
  // Strict TDD Mode: Adjust skipCheck behavior
  // ─────────────────────────────────────────────────────────────────
  const isStrictMode = featureList.metadata.tddMode === "strict";
  const hasRequiredTests =
    feature.testRequirements?.unit?.required ||
    feature.testRequirements?.e2e?.required;

  // In strict mode, warn if skipping check
  if (skipCheck && isStrictMode) {
    console.log(
      chalk.bold.yellow("\n⚠ WARNING: Strict TDD mode is enabled but verification is being skipped.")
    );
    console.log(
      chalk.yellow("   In strict mode, tests are required for all features.")
    );
    console.log(chalk.gray("   Use --no-skip-check to enforce TDD verification.\n"));
  }

  // ─────────────────────────────────────────────────────────────────
  // TDD Gate: Verify test files exist (strict mode or explicit requirements)
  // ─────────────────────────────────────────────────────────────────
  if (isStrictMode || hasRequiredTests) {
    console.log(
      chalk.bold.magenta(
        "\n═══════════════════════════════════════════════════════════════"
      )
    );
    console.log(
      chalk.bold.magenta(
        "                    TDD VERIFICATION GATE"
      )
    );
    console.log(
      chalk.bold.magenta(
        "═══════════════════════════════════════════════════════════════\n"
      )
    );

    if (isStrictMode) {
      console.log(
        chalk.cyan("   Mode: STRICT TDD (tests required by project configuration)")
      );
    } else {
      console.log(
        chalk.cyan("   Mode: Feature requires tests (testRequirements.required: true)")
      );
    }

    const gateResult = await verifyTDDGate(cwd, feature, featureList.metadata);

    if (!gateResult.passed) {
      console.log(
        chalk.red("\n   ✗ TDD GATE FAILED: Required test files are missing")
      );

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

      console.log(chalk.bold.yellow("\n   TDD Workflow Required:"));
      console.log(chalk.gray("   1. Create test file(s) matching the pattern(s) above"));
      console.log(chalk.gray("   2. Write failing tests for acceptance criteria"));
      console.log(chalk.gray("   3. Implement the feature to make tests pass"));
      console.log(chalk.gray(`   4. Run 'agent-foreman check ${featureId}' again`));

      console.log(
        chalk.cyan(`\n   Run 'agent-foreman next ${featureId}' for TDD guidance\n`)
      );
      process.exit(1);
    }

    console.log(chalk.green("   ✓ Test files exist"));
    if (gateResult.foundTestFiles.length > 0) {
      const displayFiles = gateResult.foundTestFiles.slice(0, 3);
      const moreCount = gateResult.foundTestFiles.length - 3;
      console.log(
        chalk.gray(
          `     Found: ${displayFiles.join(", ")}${moreCount > 0 ? ` +${moreCount} more` : ""}`
        )
      );
    }
    console.log("");
  }

  // ─────────────────────────────────────────────────────────────────
  // Legacy Test File Gate (for non-strict mode with testRequirements)
  // ─────────────────────────────────────────────────────────────────
  if (feature.testRequirements && !isStrictMode && !hasRequiredTests) {
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
  if (skipCheck) {
    console.log(chalk.yellow("⚠ Skipping verification (default behavior)"));
    console.log(chalk.gray("  Tip: Run 'agent-foreman check <id>' first, or use --no-skip-check to verify"));
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

    // Loop mode: Output explicit continuation reminder
    if (loopMode) {
      const stats = getFeatureStats(featureList.features);
      const total = featureList.features.length;
      const completed = stats.passing;
      const percent = getCompletionPercentage(featureList.features);

      console.log(chalk.bold.cyan("\n══════════════════════════════════════════════════════════════"));
      console.log(chalk.bold.cyan("                   FEATURE LOOP MODE ACTIVE"));
      console.log(chalk.bold.cyan("══════════════════════════════════════════════════════════════\n"));

      console.log(chalk.white(`   Completed: ${featureId} (${completed}/${total} features)`));
      console.log(chalk.white(`   Next up: ${next.id}`));
      console.log(chalk.white(`   Progress: ${percent}% complete`));

      console.log(chalk.bold.yellow("\n   LOOP INSTRUCTION (DO NOT IGNORE):"));
      console.log(chalk.white("   You are in ALL-FEATURES loop mode. Continue workflow:"));
      console.log(chalk.gray("   1. agent-foreman next"));
      console.log(chalk.gray("   2. Implement feature"));
      console.log(chalk.gray("   3. agent-foreman check <feature_id>"));
      console.log(chalk.gray("   4. agent-foreman done <feature_id>"));
      console.log(chalk.gray("   5. REPEAT until all features processed"));

      console.log(chalk.bold.green("\n   ➤ Do NOT stop. Continue to next feature NOW."));
      console.log(chalk.bold.cyan("══════════════════════════════════════════════════════════════\n"));
    }
  } else {
    // All features processed
    if (loopMode) {
      // Loop mode completion summary
      const stats = getFeatureStats(featureList.features);

      console.log(chalk.bold.green("\n══════════════════════════════════════════════════════════════"));
      console.log(chalk.bold.green("                   FEATURE LOOP COMPLETE"));
      console.log(chalk.bold.green("══════════════════════════════════════════════════════════════\n"));

      console.log(chalk.white("   All features have been processed.\n"));

      console.log(chalk.bold("   Summary:"));
      console.log(chalk.green(`   ✓ Passing: ${stats.passing}`));
      if (stats.failed > 0) {
        console.log(chalk.red(`   ✗ Failed: ${stats.failed}`));
      }
      if (stats.blocked > 0) {
        console.log(chalk.yellow(`   ⚠ Blocked: ${stats.blocked}`));
      }
      if (stats.needs_review > 0) {
        console.log(chalk.yellow(`   ⏳ Needs Review: ${stats.needs_review}`));
      }

      console.log(chalk.gray("\n   Run 'agent-foreman status' for details."));
      console.log(chalk.bold.green("══════════════════════════════════════════════════════════════\n"));
    } else {
      console.log(chalk.green("\n  🎉 All features are now passing!"));
    }

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
