/**
 * TDD verification mode
 * Tests only, no AI analysis
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";

import type { Feature } from "../types.js";
import type {
  VerificationResult,
  CriterionResult,
  VerificationVerdict,
  AutomatedCheckResult,
} from "../verification-types.js";
import type { TestDiscoveryResult } from "../test-discovery.js";
import { detectCapabilities } from "../project-capabilities.js";
import { saveVerificationResult } from "../verification-store.js";
import {
  buildSelectiveTestCommand,
  buildE2ECommand,
  getE2ETagsForFeature,
  type E2EMode,
} from "../test-discovery.js";
import { createSpinner, createStepProgress } from "../progress.js";
import { runCheckWithEnv } from "./check-executor.js";
import type { TDDVerifyOptions } from "./types.js";
import { verifyFeatureAutonomous } from "./autonomous.js";

const execAsync = promisify(exec);

/**
 * Verify a feature using TDD mode (tests only, no AI analysis)
 *
 * TDD verification runs the specified test files and determines the verdict
 * purely from test results. No AI analysis is performed.
 *
 * @param cwd - Current working directory
 * @param feature - The feature to verify
 * @param testFiles - Array of test file paths to run
 * @param options - TDD verification options
 * @returns VerificationResult with verifiedBy='tdd'
 */
export async function verifyFeatureTDD(
  cwd: string,
  feature: Feature,
  testFiles: string[],
  options: TDDVerifyOptions = {}
): Promise<VerificationResult> {
  const { verbose = false, skipE2E = false, e2eTags = getE2ETagsForFeature(feature) } = options;

  console.log(chalk.bold("\n   Verifying feature (TDD): " + feature.id));
  console.log(chalk.cyan(`   Running ${testFiles.length} test file(s)`));

  // If no test files, fall back to AI verification
  if (testFiles.length === 0) {
    console.log(chalk.yellow("   No test files specified, falling back to AI verification"));
    return verifyFeatureAutonomous(cwd, feature, {
      verbose,
      skipE2E,
      e2eTags,
    });
  }

  // Get commit hash for reference
  let commitHash = "unknown";
  try {
    const { stdout } = await execAsync("git rev-parse HEAD", { cwd });
    commitHash = stdout.trim();
  } catch {
    // Ignore git errors
  }

  // Define verification steps
  const steps = ["Detect capabilities", "Run unit tests", ...(skipE2E ? [] : ["Run E2E tests"]), "Save results"];
  const stepProgress = createStepProgress(steps);
  stepProgress.start();

  // Step 1: Detect capabilities
  const capabilities = await detectCapabilities(cwd, { verbose });
  stepProgress.completeStep(true);

  // Step 2: Run unit tests
  const automatedResults: AutomatedCheckResult[] = [];

  // Build selective test command for the specified test files
  const testDiscovery: TestDiscoveryResult = {
    source: "explicit",
    pattern: testFiles[0],
    testFiles,
    confidence: 1.0,
  };

  const selectiveCommand = buildSelectiveTestCommand(capabilities, testFiles[0], testDiscovery);

  if (selectiveCommand) {
    if (verbose) {
      console.log(chalk.gray(`   Test command: ${selectiveCommand}`));
    }

    const spinner = verbose ? createSpinner("Running unit tests") : null;
    const testResult = await runCheckWithEnv(cwd, "test", selectiveCommand, { CI: "true" });
    automatedResults.push(testResult);

    if (spinner) {
      if (testResult.success) {
        spinner.succeed("Unit tests passed");
      } else {
        spinner.fail("Unit tests failed");
      }
    }

    stepProgress.completeStep(testResult.success);
  } else {
    // No test command available
    console.log(chalk.yellow("   No test command available"));
    stepProgress.completeStep(true);
  }

  // Step 3: Run E2E tests if required and not skipped
  if (!skipE2E && feature.testRequirements?.e2e?.required && capabilities.e2eInfo?.available) {
    const e2eMode: E2EMode = e2eTags.length > 0 ? "tags" : "full";
    const e2eCommand = buildE2ECommand(capabilities.e2eInfo, e2eTags, e2eMode);

    if (e2eCommand) {
      if (verbose) {
        console.log(chalk.gray(`   E2E command: ${e2eCommand}`));
      }

      const spinner = verbose ? createSpinner("Running E2E tests") : null;
      const e2eResult = await runCheckWithEnv(cwd, "e2e", e2eCommand, { CI: "true" });
      automatedResults.push(e2eResult);

      if (spinner) {
        if (e2eResult.success) {
          spinner.succeed("E2E tests passed");
        } else {
          spinner.fail("E2E tests failed");
        }
      }

      stepProgress.completeStep(e2eResult.success);
    }
  }

  // Determine verdict purely from test results
  const allTestsPassed = automatedResults.every((r) => r.success);
  const verdict: VerificationVerdict = allTestsPassed ? "pass" : "fail";

  // Build criteria results based on test outcome
  const criteriaResults: CriterionResult[] = feature.acceptance.map((criterion, index) => ({
    criterion,
    index,
    satisfied: allTestsPassed,
    reasoning: allTestsPassed
      ? "All tests passed - criterion verified by TDD workflow"
      : "Tests failed - criterion not verified",
    evidence: testFiles,
    confidence: allTestsPassed ? 1.0 : 0.0,
  }));

  // Build verification result
  const result: VerificationResult = {
    featureId: feature.id,
    timestamp: new Date().toISOString(),
    commitHash,
    changedFiles: [],
    diffSummary: `TDD verification with ${testFiles.length} test file(s)`,
    automatedChecks: automatedResults,
    criteriaResults,
    verdict,
    verifiedBy: "tdd",
    overallReasoning: allTestsPassed
      ? `All ${automatedResults.length} test run(s) passed`
      : `${automatedResults.filter((r) => !r.success).length} test run(s) failed`,
    suggestions: allTestsPassed ? [] : ["Review failing tests and fix implementation"],
    codeQualityNotes: [],
    relatedFilesAnalyzed: testFiles,
  };

  // Save result
  await saveVerificationResult(cwd, result);
  stepProgress.completeStep(true);

  return result;
}
