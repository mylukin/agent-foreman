/**
 * Autonomous verification mode
 * AI explores the codebase itself to verify acceptance criteria
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";

import type { Feature } from "../types.js";
import type {
  AutomatedCheckResult,
  VerificationResult,
  VerifyOptions,
  CriterionResult,
  VerificationVerdict,
} from "../verification-types.js";
import { detectCapabilities } from "../project-capabilities.js";
import { saveVerificationResult } from "../verification-store.js";
import { callAnyAvailableAgent } from "../agents.js";
import { getE2ETagsForFeature } from "../test-discovery.js";
import { createSpinner, createStepProgress } from "../progress.js";
import { runAutomatedChecks } from "./check-executor.js";
import { RETRY_CONFIG, isTransientError, calculateBackoff } from "./ai-analysis.js";

const execAsync = promisify(exec);

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Build autonomous verification prompt
 * The AI explores the codebase itself to verify acceptance criteria
 */
export function buildAutonomousVerificationPrompt(
  cwd: string,
  feature: Feature,
  automatedResults: AutomatedCheckResult[]
): string {
  const criteriaList = feature.acceptance
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const automatedSummary = automatedResults.length > 0
    ? automatedResults.map(r =>
        `- ${r.type.toUpperCase()}: ${r.success ? "PASSED" : "FAILED"}${r.duration ? ` (${r.duration}ms)` : ""}`
      ).join("\n")
    : "No automated checks were run.";

  return `You are a software verification expert. Verify if a feature's acceptance criteria are satisfied.

## Working Directory

${cwd}

You are currently working in this directory. Explore it using your available tools.

## Feature Information

- **ID**: ${feature.id}
- **Description**: ${feature.description}
- **Module**: ${feature.module}

## Acceptance Criteria to Verify

${criteriaList}

## Automated Check Results

${automatedSummary}

## Your Task

Perform autonomous exploration to verify EACH acceptance criterion:

1. **Explore the codebase**: Read source files, tests, and configs as needed
2. **Find evidence**: Look for code that implements each criterion
3. **Check tests**: Verify that tests exist and cover the functionality
4. **Assess completeness**: Determine if each criterion is fully satisfied

For each criterion, you must:
- Read the relevant source files
- Check for test coverage
- Verify the implementation matches the requirement

## Output

After your exploration, return ONLY a JSON object (no markdown, no explanation):

{
  "criteriaResults": [
    {
      "index": 0,
      "criterion": "exact text of criterion",
      "satisfied": true,
      "reasoning": "Detailed explanation with file:line references",
      "evidence": ["src/file.ts:45", "tests/file.test.ts:100"],
      "confidence": 0.95
    }
  ],
  "verdict": "pass|fail|needs_review",
  "overallReasoning": "Summary of verification findings",
  "suggestions": ["Improvement suggestions if any"],
  "codeQualityNotes": ["Quality observations if any"]
}

**Verdict Rules**:
- "pass": ALL criteria satisfied with confidence > 0.7
- "fail": ANY criterion clearly NOT satisfied
- "needs_review": Evidence insufficient or confidence too low

Begin exploration now. Read files, search code, and verify each criterion.`;
}

/**
 * Parse autonomous verification response
 */
function parseAutonomousVerificationResponse(
  response: string,
  acceptance: string[]
): {
  criteriaResults: CriterionResult[];
  verdict: VerificationVerdict;
  overallReasoning: string;
  suggestions: string[];
  codeQualityNotes: string[];
} {
  try {
    // Extract JSON from response
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    // Map criteria results
    const criteriaResults: CriterionResult[] = acceptance.map((criterion, index) => {
      const result = parsed.criteriaResults?.find((r: { index: number }) => r.index === index);
      if (result) {
        return {
          criterion,
          index,
          satisfied: result.satisfied ?? false,
          reasoning: result.reasoning ?? "No reasoning provided",
          evidence: result.evidence ?? [],
          confidence: result.confidence ?? 0.5,
        };
      }
      return {
        criterion,
        index,
        satisfied: false,
        reasoning: "Criterion not analyzed by AI",
        evidence: [],
        confidence: 0,
      };
    });

    return {
      criteriaResults,
      verdict: parsed.verdict ?? "needs_review",
      overallReasoning: parsed.overallReasoning ?? "",
      suggestions: parsed.suggestions ?? [],
      codeQualityNotes: parsed.codeQualityNotes ?? [],
    };
  } catch (error) {
    // Return failure result if parsing fails
    return {
      criteriaResults: acceptance.map((criterion, index) => ({
        criterion,
        index,
        satisfied: false,
        reasoning: `Failed to parse AI response: ${(error as Error).message}`,
        evidence: [],
        confidence: 0,
      })),
      verdict: "needs_review",
      overallReasoning: "AI response could not be parsed",
      suggestions: [],
      codeQualityNotes: [],
    };
  }
}

/**
 * Verify a feature using autonomous AI exploration
 * The AI explores the codebase itself instead of analyzing pre-built diffs
 */
export async function verifyFeatureAutonomous(
  cwd: string,
  feature: Feature,
  options: VerifyOptions = {}
): Promise<VerificationResult> {
  const { verbose = false, skipChecks = false } = options;

  console.log(chalk.bold("\n   Verifying feature (autonomous): " + feature.id));

  // Define verification steps
  const steps = skipChecks
    ? ["AI autonomous exploration", "Save results"]
    : ["Detect capabilities", "Run automated checks", "AI autonomous exploration", "Save results"];

  const stepProgress = createStepProgress(steps);
  stepProgress.start();

  // Get commit hash for reference
  let commitHash = "unknown";
  try {
    const { stdout } = await execAsync("git rev-parse HEAD", { cwd });
    commitHash = stdout.trim();
  } catch {
    // Ignore git errors
  }

  // Step 1: Run automated checks (optional)
  let automatedResults: AutomatedCheckResult[] = [];

  if (!skipChecks) {
    const capabilities = await detectCapabilities(cwd, { verbose });
    stepProgress.completeStep(true);

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

    // Get E2E tags from feature
    const e2eTags = getE2ETagsForFeature(feature);

    automatedResults = await runAutomatedChecks(cwd, capabilities, {
      verbose,
      testMode: options.testMode || "full",
      skipE2E: options.skipE2E,
      e2eTags,
      e2eMode: options.e2eMode,
      useInitScript,
      initScriptPath,
    });
    const allPassed = automatedResults.every((r) => r.success);
    stepProgress.completeStep(allPassed);
  }

  // Step 2: Build autonomous prompt and call AI
  const prompt = buildAutonomousVerificationPrompt(cwd, feature, automatedResults);

  console.log(chalk.blue("\n   AI Autonomous Exploration:"));
  const spinner = createSpinner("AI exploring codebase");

  let lastError: string | undefined;
  let lastAgentUsed: string | undefined;

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (attempt > 1) {
      spinner.update(`AI exploring codebase (attempt ${attempt}/${RETRY_CONFIG.maxRetries})`);
    }

    const result = await callAnyAvailableAgent(prompt, {
      cwd,
      timeoutMs: options.timeout, // No default timeout - let AI explore as long as needed
      verbose: options.verbose,
    });

    lastAgentUsed = result.agentUsed;

    if (result.success) {
      spinner.succeed(`AI exploration complete (${result.agentUsed})`);

      const parsed = parseAutonomousVerificationResponse(result.output, feature.acceptance);
      stepProgress.completeStep(parsed.verdict !== "fail");

      // Build verification result
      const verificationResult: VerificationResult = {
        featureId: feature.id,
        timestamp: new Date().toISOString(),
        commitHash,
        changedFiles: [],
        diffSummary: "Autonomous exploration (no diff)",
        automatedChecks: automatedResults,
        criteriaResults: parsed.criteriaResults,
        verdict: parsed.verdict,
        verifiedBy: result.agentUsed || "unknown",
        overallReasoning: parsed.overallReasoning,
        suggestions: parsed.suggestions,
        codeQualityNotes: parsed.codeQualityNotes,
        relatedFilesAnalyzed: [],
      };

      // Save result
      await saveVerificationResult(cwd, verificationResult);
      stepProgress.completeStep(true);

      return verificationResult;
    }

    lastError = result.error;

    if (!isTransientError(lastError)) {
      spinner.fail("AI exploration failed (permanent error): " + lastError);
      break;
    }

    if (attempt < RETRY_CONFIG.maxRetries) {
      const delayMs = calculateBackoff(attempt);
      spinner.warn(`AI exploration failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${lastError}`);
      console.log(chalk.yellow(`   Retrying in ${(delayMs / 1000).toFixed(1)}s...`));
      await sleep(delayMs);
    } else {
      spinner.fail(`AI exploration failed after ${RETRY_CONFIG.maxRetries} attempts: ${lastError}`);
    }
  }

  // All retries exhausted
  stepProgress.complete();

  const failedResult: VerificationResult = {
    featureId: feature.id,
    timestamp: new Date().toISOString(),
    commitHash,
    changedFiles: [],
    diffSummary: "Autonomous exploration failed",
    automatedChecks: automatedResults,
    criteriaResults: feature.acceptance.map((criterion, index) => ({
      criterion,
      index,
      satisfied: false,
      reasoning: "AI exploration failed: " + (lastError || "Unknown error"),
      evidence: [],
      confidence: 0,
    })),
    verdict: "needs_review",
    verifiedBy: lastAgentUsed || "none",
    overallReasoning: "AI exploration failed after retries",
    suggestions: [],
    codeQualityNotes: [],
    relatedFilesAnalyzed: [],
  };

  await saveVerificationResult(cwd, failedResult);
  return failedResult;
}
