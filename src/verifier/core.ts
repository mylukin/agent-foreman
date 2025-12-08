/**
 * Core verification orchestration
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import type { Feature, FeatureListMetadata } from "../types.js";
import type {
  AutomatedCheckResult,
  VerificationResult,
  VerifyOptions,
  VerificationMode,
  ExtendedCapabilities,
} from "./verification-types.js";
import {
  getSelectiveTestCommand,
  getE2ETagsForFeature,
} from "../test-discovery.js";
import { detectCapabilities } from "../capabilities/index.js";
import { saveVerificationResult } from "../verification-store/index.js";
import { createStepProgress } from "../progress.js";
import { getGitDiffForFeature } from "./git-operations.js";
import { runAutomatedChecks } from "./check-executor.js";
import { analyzeWithAI } from "./ai-analysis.js";

/**
 * Determine the verification mode for a feature based on its configuration
 * and project-wide TDD settings.
 *
 * TDD mode is activated when:
 * 1. Project metadata has tddMode: "strict", OR
 * 2. Feature has explicit test requirements (required: true)
 *
 * In TDD mode, verification requires tests to exist and pass.
 *
 * @param feature - The feature to check
 * @param metadata - Optional feature list metadata for project-wide settings
 * @returns 'tdd' if strict mode or tests required, otherwise 'ai'
 */
export function determineVerificationMode(
  feature: Feature,
  metadata?: FeatureListMetadata
): VerificationMode {
  // Check project-wide strict TDD mode
  if (metadata?.tddMode === "strict") {
    return "tdd";
  }

  // Check if feature has TDD test requirements
  const hasUnitTestRequirement = feature.testRequirements?.unit?.required === true;
  const hasE2ETestRequirement = feature.testRequirements?.e2e?.required === true;

  // Return 'tdd' if any test requirement is explicitly required
  if (hasUnitTestRequirement || hasE2ETestRequirement) {
    return "tdd";
  }

  // Default to AI-powered verification
  return "ai";
}

/**
 * Verify a feature by running automated checks and AI analysis
 */
export async function verifyFeature(
  cwd: string,
  feature: Feature,
  options: VerifyOptions = {}
): Promise<VerificationResult> {
  const {
    verbose = false,
    skipChecks = false,
    testMode = "full",
    testPattern,
    skipE2E = false,
    e2eTags = getE2ETagsForFeature(feature),
    e2eMode,
  } = options;

  console.log(chalk.bold("\n   Verifying feature: " + feature.id));

  // Determine verification mode based on feature configuration
  const verificationMode = determineVerificationMode(feature);
  const modeColor = verificationMode === "tdd" ? chalk.cyan : chalk.blue;
  console.log(chalk.gray(`   Verification mode: ${modeColor(verificationMode.toUpperCase())}`));

  // Show test mode if not default
  if (testMode !== "full") {
    const modeLabel = testMode === "quick" ? chalk.cyan("quick (selective tests)") : chalk.yellow("skip tests");
    console.log(chalk.gray(`   Test mode: ${modeLabel}`));
  }

  // Show E2E mode if relevant
  if (skipE2E) {
    console.log(chalk.gray(`   E2E tests: skipped`));
  } else if (e2eMode) {
    const e2eLabel = e2eMode === "full"
      ? "full (all E2E tests)"
      : e2eMode === "smoke"
        ? "@smoke only"
        : `tags: ${e2eTags.join(", ")}`;
    console.log(chalk.gray(`   E2E mode: ${e2eLabel}`));
  }

  // Define verification steps for progress tracking
  const steps = skipChecks
    ? ["Get git diff", "Analyze with AI", "Save results"]
    : ["Get git diff", "Detect capabilities", "Run automated checks", "Analyze with AI", "Save results"];

  const stepProgress = createStepProgress(steps);
  stepProgress.start();

  // Step 1: Get git diff (and optionally detect capabilities in parallel)
  let diff: string;
  let changedFiles: string[];
  let commitHash: string;
  let capabilities: ExtendedCapabilities | null = null;

  if (!skipChecks) {
    // Parallelize git diff and capability detection when checks are enabled
    const [diffResult, capabilitiesResult] = await Promise.all([
      getGitDiffForFeature(cwd),
      detectCapabilities(cwd, { verbose }),
    ]);
    diff = diffResult.diff;
    changedFiles = diffResult.files;
    commitHash = diffResult.commitHash;
    capabilities = capabilitiesResult;
    stepProgress.completeStep(true); // Git diff done
    stepProgress.completeStep(true); // Capabilities done
  } else {
    // Skip checks mode - only get git diff
    const diffResult = await getGitDiffForFeature(cwd);
    diff = diffResult.diff;
    changedFiles = diffResult.files;
    commitHash = diffResult.commitHash;
    stepProgress.completeStep(true);
  }

  if (verbose) {
    console.log(chalk.gray(`   Changed files: ${changedFiles.length}`));
    changedFiles.slice(0, 5).forEach((f) => console.log(chalk.gray(`     - ${f}`)));
    if (changedFiles.length > 5) {
      console.log(chalk.gray(`     ... and ${changedFiles.length - 5} more`));
    }
  }

  // Step 2: Run automated checks (capabilities already detected in parallel above)
  let automatedResults: AutomatedCheckResult[] = [];

  if (!skipChecks && capabilities) {
    // Capabilities already detected above via Promise.all

    // Check if ai/init.sh exists for init script mode
    const initScriptPath = path.join(cwd, "ai/init.sh");
    let useInitScript = false;
    try {
      await fs.access(initScriptPath);
      useInitScript = true;
      if (verbose) {
        console.log(chalk.gray(`   Found ai/init.sh - using init script mode`));
      }
    } catch {
      // Init script doesn't exist, use direct command mode
    }

    // Handle selective testing for quick mode
    let selectiveTestCommand: string | null = null;
    let testDiscovery;

    if (testMode === "quick") {
      // Use explicit pattern or auto-discover
      const featureWithPattern = testPattern
        ? { ...feature, testPattern }
        : feature;
      const selectiveResult = await getSelectiveTestCommand(
        cwd,
        featureWithPattern,
        capabilities,
        changedFiles
      );
      selectiveTestCommand = selectiveResult.command;
      testDiscovery = selectiveResult.discovery;

      if (verbose && testDiscovery.source !== "none") {
        console.log(chalk.gray(`   Test discovery source: ${testDiscovery.source}`));
        if (testDiscovery.pattern) {
          console.log(chalk.gray(`   Test pattern: ${testDiscovery.pattern}`));
        }
      }
    }

    automatedResults = await runAutomatedChecks(cwd, capabilities, {
      verbose,
      testMode,
      selectiveTestCommand,
      testDiscovery,
      skipE2E,
      e2eInfo: capabilities.e2eInfo,
      e2eTags,
      e2eMode,
      useInitScript,
      initScriptPath,
    });
    const allPassed = automatedResults.every((r) => r.success);
    stepProgress.completeStep(allPassed);
  }

  // Step 3: AI Analysis
  const aiResult = await analyzeWithAI(
    cwd,
    feature,
    diff,
    changedFiles,
    automatedResults,
    options
  );
  stepProgress.completeStep(aiResult.verdict !== "fail");

  // Step 4: Build verification result
  const result: VerificationResult = {
    featureId: feature.id,
    timestamp: new Date().toISOString(),
    commitHash,
    changedFiles,
    diffSummary: `${changedFiles.length} files changed`,
    automatedChecks: automatedResults,
    criteriaResults: aiResult.criteriaResults,
    verdict: aiResult.verdict,
    verifiedBy: aiResult.agentUsed,
    overallReasoning: aiResult.overallReasoning,
    suggestions: aiResult.suggestions,
    codeQualityNotes: aiResult.codeQualityNotes,
    relatedFilesAnalyzed: changedFiles,
  };

  // Step 5: Save result
  await saveVerificationResult(cwd, result);
  stepProgress.completeStep(true);

  return result;
}
