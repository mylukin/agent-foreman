/**
 * Check command - AI-powered verification of feature completion
 */

import chalk from "chalk";

import {
  loadFeatureList,
  saveFeatureList,
  findFeatureById,
  updateFeatureVerification,
} from "../feature-list.js";
import { appendProgressLog, createVerifyEntry } from "../progress-log.js";
import { verifyTDDGate } from "../test-gate.js";
import {
  verifyFeature,
  verifyFeatureAutonomous,
  createVerificationSummary,
  formatVerificationResult,
} from "../verifier/index.js";

/**
 * Run the check command
 */
export async function runCheck(
  featureId: string,
  verbose: boolean,
  skipChecks: boolean,
  autonomous: boolean = false,
  testMode: "full" | "quick" | "skip" = "full",
  testPattern?: string,
  skipE2E: boolean = false,
  e2eMode?: "full" | "smoke" | "tags" | "skip"
): Promise<void> {
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

  // ─────────────────────────────────────────────────────────────────
  // TDD Gate: Verify test files exist before verification
  // ─────────────────────────────────────────────────────────────────
  const strictMode = featureList.metadata.tddMode === "strict";
  const hasRequiredTests =
    feature.testRequirements?.unit?.required ||
    feature.testRequirements?.e2e?.required;

  if (strictMode || hasRequiredTests) {
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

    if (strictMode) {
      console.log(
        chalk.cyan("   Mode: STRICT TDD (tests required by project configuration)")
      );
    } else {
      console.log(chalk.cyan("   Mode: Feature requires tests (testRequirements.required: true)"));
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
    console.log(chalk.yellow("\n   Options:"));
    console.log(chalk.gray(`   1. Fix issues and run 'agent-foreman check ${featureId}' again`));
    console.log(chalk.gray(`   2. Mark as failed: 'agent-foreman fail ${featureId} -r "reason"'`));
  } else {
    console.log(chalk.yellow("\n   ⚠ Needs review. Some criteria could not be verified automatically."));
  }
}
