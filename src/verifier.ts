/**
 * Core verification logic
 * Orchestrates automated checks and AI analysis for feature verification
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";

import type { Feature } from "./types.js";
import { isPathWithinRoot, safeReadFile } from "./file-utils.js";
import type {
  VerificationCapabilities,
  AutomatedCheckResult,
  VerificationResult,
  VerifyOptions,
  FeatureVerificationSummary,
  CriterionResult,
  VerificationVerdict,
} from "./verification-types.js";
import {
  detectVerificationCapabilities,
  detectCapabilities,
} from "./capability-detector.js";
import { saveVerificationResult } from "./verification-store.js";
import {
  buildVerificationPrompt,
  parseVerificationResponse,
} from "./verification-prompts.js";
import { callAnyAvailableAgent } from "./agents.js";
import {
  createSpinner,
  createProgressBar,
  createStepProgress,
  isTTY,
  type Spinner,
} from "./progress.js";

const execAsync = promisify(exec);

// ============================================================================
// Git Operations
// ============================================================================

/**
 * Get git diff and changed files for verification
 */
export async function getGitDiffForFeature(
  cwd: string
): Promise<{ diff: string; files: string[]; commitHash: string }> {
  try {
    // Get current commit hash
    const { stdout: commitHash } = await execAsync("git rev-parse HEAD", {
      cwd,
    });

    // Get diff of uncommitted changes + last commit
    // This captures both staged and unstaged changes
    const { stdout: diffOutput } = await execAsync(
      "git diff HEAD~1 HEAD && git diff HEAD",
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );

    // Get list of changed files
    const { stdout: filesOutput } = await execAsync(
      "git diff HEAD~1 HEAD --name-only && git diff HEAD --name-only",
      { cwd }
    );

    const files = [
      ...new Set(
        filesOutput
          .trim()
          .split("\n")
          .filter((f) => f.length > 0)
      ),
    ];

    return {
      diff: diffOutput || "No changes detected",
      files,
      commitHash: commitHash.trim(),
    };
  } catch (error) {
    // Fallback: just get uncommitted changes
    try {
      const { stdout: diffOutput } = await execAsync("git diff HEAD", {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      const { stdout: filesOutput } = await execAsync(
        "git diff HEAD --name-only",
        { cwd }
      );
      const { stdout: commitHash } = await execAsync("git rev-parse HEAD", {
        cwd,
      });

      const files = filesOutput
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);

      return {
        diff: diffOutput || "No changes detected",
        files,
        commitHash: commitHash.trim(),
      };
    } catch {
      return {
        diff: "Unable to get git diff",
        files: [],
        commitHash: "unknown",
      };
    }
  }
}

// ============================================================================
// Automated Checks
// ============================================================================

/**
 * Run a single automated check
 */
async function runCheck(
  cwd: string,
  type: AutomatedCheckResult["type"],
  command: string
): Promise<AutomatedCheckResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      maxBuffer: 5 * 1024 * 1024,
      timeout: 300000, // 5 minute timeout
    });

    return {
      type,
      success: true,
      output: stdout + stderr,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const execError = error as { stdout?: string; stderr?: string; code?: number };
    return {
      type,
      success: false,
      output: (execError.stdout || "") + (execError.stderr || ""),
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Run all available automated checks
 */
export async function runAutomatedChecks(
  cwd: string,
  capabilities: VerificationCapabilities,
  verbose: boolean = false
): Promise<AutomatedCheckResult[]> {
  const results: AutomatedCheckResult[] = [];

  // Collect checks to run
  const checks: Array<{ type: AutomatedCheckResult["type"]; command: string; name: string }> = [];

  if (capabilities.hasTests && capabilities.testCommand) {
    checks.push({ type: "test", command: capabilities.testCommand, name: "tests" });
  }
  if (capabilities.hasTypeCheck && capabilities.typeCheckCommand) {
    checks.push({ type: "typecheck", command: capabilities.typeCheckCommand, name: "type check" });
  }
  if (capabilities.hasLint && capabilities.lintCommand) {
    checks.push({ type: "lint", command: capabilities.lintCommand, name: "linter" });
  }
  if (capabilities.hasBuild && capabilities.buildCommand) {
    checks.push({ type: "build", command: capabilities.buildCommand, name: "build" });
  }

  if (checks.length === 0) {
    return results;
  }

  // Create progress bar for checks
  const progressBar = createProgressBar("Running automated checks", checks.length);
  progressBar.start();

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    progressBar.update(i, `Running ${check.name}`);

    const spinner = verbose ? createSpinner(`Running ${check.name}`) : null;
    const result = await runCheck(cwd, check.type, check.command);
    results.push(result);

    if (spinner) {
      if (result.success) {
        spinner.succeed(`${check.name} passed`);
      } else {
        spinner.fail(`${check.name} failed`);
      }
    }
  }

  progressBar.complete("Automated checks complete");
  return results;
}

// ============================================================================
// Related Files
// ============================================================================

/**
 * Read related files for context
 * Includes files that import or are imported by changed files
 * Validates paths to prevent path traversal attacks
 */
export async function readRelatedFiles(
  cwd: string,
  changedFiles: string[]
): Promise<Map<string, string>> {
  const relatedFiles = new Map<string, string>();

  // Read the changed files themselves (most relevant)
  const sourceFiles = changedFiles.filter(
    (f) =>
      f.endsWith(".ts") ||
      f.endsWith(".tsx") ||
      f.endsWith(".js") ||
      f.endsWith(".jsx") ||
      f.endsWith(".py") ||
      f.endsWith(".go") ||
      f.endsWith(".rs")
  );

  // Read all source files without limit
  for (const file of sourceFiles) {
    // Validate path stays within project root to prevent path traversal
    if (!isPathWithinRoot(cwd, file)) {
      // Skip files that would escape project directory
      continue;
    }

    // Use safeReadFile for secure file reading
    const content = await safeReadFile(cwd, file);
    if (content !== null) {
      relatedFiles.set(file, content);
    }
    // If content is null, file doesn't exist or can't be read - skip silently
  }

  return relatedFiles;
}

// ============================================================================
// AI Analysis with Retry Logic
// ============================================================================

/** Retry configuration */
export const RETRY_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000, // 1 second
  maxDelayMs: 10000, // 10 seconds
};

/**
 * Check if an error is transient (retryable)
 */
export function isTransientError(error: string | undefined): boolean {
  if (!error) return false;

  const transientPatterns = [
    /timeout/i,
    /timed?\s*out/i,
    /ETIMEDOUT/i,
    /ECONNRESET/i,
    /ECONNREFUSED/i,
    /ENETUNREACH/i,
    /network/i,
    /socket hang up/i,
    /connection.*reset/i,
    /connection.*refused/i,
    /connection.*closed/i,
    /temporarily unavailable/i,
    /rate limit/i,
    /too many requests/i,
    /429/,
    /503/,
    /502/,
    /504/,
    /overloaded/i,
    /capacity/i,
  ];

  return transientPatterns.some((pattern) => pattern.test(error));
}

/**
 * Sleep for a specified duration
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay
 */
export function calculateBackoff(
  attempt: number,
  baseDelayMs: number = RETRY_CONFIG.baseDelayMs
): number {
  // Exponential backoff: 1s, 2s, 4s, 8s...
  const delay = baseDelayMs * Math.pow(2, attempt - 1);
  // Add some jitter (±10%) to prevent thundering herd
  const jitter = delay * 0.1 * (Math.random() * 2 - 1);
  return Math.min(delay + jitter, RETRY_CONFIG.maxDelayMs);
}

/**
 * Perform AI analysis of the changes with retry logic
 */
export async function analyzeWithAI(
  cwd: string,
  feature: Feature,
  diff: string,
  changedFiles: string[],
  automatedResults: AutomatedCheckResult[],
  options: VerifyOptions = {}
): Promise<{
  criteriaResults: ReturnType<typeof parseVerificationResponse>["criteriaResults"];
  verdict: ReturnType<typeof parseVerificationResponse>["verdict"];
  overallReasoning: string;
  suggestions: string[];
  codeQualityNotes: string[];
  agentUsed: string;
}> {
  // Read related files for context
  const relatedFiles = await readRelatedFiles(cwd, changedFiles);

  // Build the prompt
  const prompt = buildVerificationPrompt(
    feature,
    diff,
    changedFiles,
    automatedResults,
    relatedFiles
  );

  // Call AI agent with retry logic
  console.log(chalk.blue("\n   AI Analysis:"));

  let lastError: string | undefined;
  let lastAgentUsed: string | undefined;

  // Create spinner for AI analysis
  const spinner = createSpinner("Analyzing code changes with AI");

  for (let attempt = 1; attempt <= RETRY_CONFIG.maxRetries; attempt++) {
    if (attempt > 1) {
      spinner.update(`Analyzing code changes with AI (attempt ${attempt}/${RETRY_CONFIG.maxRetries})`);
    }

    const result = await callAnyAvailableAgent(prompt, {
      cwd,
      timeoutMs: options.timeout || 300000, // 5 minute timeout
      verbose: options.verbose,
    });

    lastAgentUsed = result.agentUsed;

    if (result.success) {
      spinner.succeed(`AI analysis complete (${result.agentUsed})`);
      // Parse the response
      const parsed = parseVerificationResponse(result.output, feature.acceptance);
      return {
        ...parsed,
        agentUsed: result.agentUsed || "unknown",
      };
    }

    lastError = result.error;

    // Check if error is transient (retryable)
    if (!isTransientError(lastError)) {
      // Permanent error, don't retry
      spinner.fail("AI analysis failed (permanent error): " + lastError);
      break;
    }

    // Transient error, retry with backoff
    if (attempt < RETRY_CONFIG.maxRetries) {
      const delayMs = calculateBackoff(attempt);
      spinner.warn(`AI analysis failed (attempt ${attempt}/${RETRY_CONFIG.maxRetries}): ${lastError}`);
      console.log(chalk.yellow(`   Retrying in ${(delayMs / 1000).toFixed(1)}s...`));
      await sleep(delayMs);
    } else {
      spinner.fail(`AI analysis failed after ${RETRY_CONFIG.maxRetries} attempts: ${lastError}`);
    }
  }

  // All retries exhausted or permanent error
  return {
    criteriaResults: feature.acceptance.map((criterion, index) => ({
      criterion,
      index,
      satisfied: false,
      reasoning: "AI analysis failed: " + (lastError || "Unknown error"),
      evidence: [],
      confidence: 0,
    })),
    verdict: "needs_review",
    overallReasoning: "AI analysis failed after retries",
    suggestions: [],
    codeQualityNotes: [],
    agentUsed: lastAgentUsed || "none",
  };
}

// ============================================================================
// Main Verification Function
// ============================================================================

/**
 * Verify a feature by running automated checks and AI analysis
 */
export async function verifyFeature(
  cwd: string,
  feature: Feature,
  options: VerifyOptions = {}
): Promise<VerificationResult> {
  const { verbose = false, skipChecks = false } = options;

  console.log(chalk.bold("\n   Verifying feature: " + feature.id));

  // Define verification steps for progress tracking
  const steps = skipChecks
    ? ["Get git diff", "Analyze with AI", "Save results"]
    : ["Get git diff", "Detect capabilities", "Run automated checks", "Analyze with AI", "Save results"];

  const stepProgress = createStepProgress(steps);
  stepProgress.start();

  // Step 1: Get git diff
  const { diff, files: changedFiles, commitHash } = await getGitDiffForFeature(cwd);
  stepProgress.completeStep(true);

  if (verbose) {
    console.log(chalk.gray(`   Changed files: ${changedFiles.length}`));
    changedFiles.slice(0, 5).forEach((f) => console.log(chalk.gray(`     - ${f}`)));
    if (changedFiles.length > 5) {
      console.log(chalk.gray(`     ... and ${changedFiles.length - 5} more`));
    }
  }

  // Step 2: Detect capabilities and run automated checks
  let automatedResults: AutomatedCheckResult[] = [];

  if (!skipChecks) {
    // Use new three-tier detection system (cache -> preset -> AI)
    const capabilities = await detectCapabilities(cwd, { verbose });
    stepProgress.completeStep(true);

    automatedResults = await runAutomatedChecks(cwd, capabilities, verbose);
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

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create a verification summary for embedding in feature
 */
export function createVerificationSummary(
  result: VerificationResult
): FeatureVerificationSummary {
  const satisfiedCount = result.criteriaResults.filter(
    (r) => r.satisfied
  ).length;
  const totalCount = result.criteriaResults.length;

  return {
    verifiedAt: result.timestamp,
    verdict: result.verdict,
    verifiedBy: result.verifiedBy,
    commitHash: result.commitHash,
    summary: `${satisfiedCount}/${totalCount} criteria satisfied`,
  };
}

/**
 * Format verification result for display
 */
export function formatVerificationResult(
  result: VerificationResult,
  verbose: boolean = false
): string {
  const lines: string[] = [];

  // Header
  lines.push(chalk.bold("\n   Verification Result"));
  lines.push("   " + "─".repeat(50));

  // Automated checks
  if (result.automatedChecks.length > 0) {
    lines.push(chalk.bold("\n   Automated Checks:"));
    for (const check of result.automatedChecks) {
      const status = check.success
        ? chalk.green("PASSED")
        : chalk.red("FAILED");
      const duration = check.duration
        ? chalk.gray(` (${(check.duration / 1000).toFixed(1)}s)`)
        : "";
      lines.push(`   ${check.type.padEnd(12)} ${status}${duration}`);
    }
  }

  // Criteria results
  lines.push(chalk.bold("\n   Criteria Analysis:"));
  for (const criterion of result.criteriaResults) {
    const status = criterion.satisfied
      ? chalk.green("✓")
      : chalk.red("✗");
    const confidence = chalk.gray(
      `(${(criterion.confidence * 100).toFixed(0)}%)`
    );
    lines.push(`   ${status} [${criterion.index + 1}] ${criterion.criterion.slice(0, 50)}... ${confidence}`);

    if (verbose) {
      lines.push(chalk.gray(`      ${criterion.reasoning}`));
      if (criterion.evidence && criterion.evidence.length > 0) {
        lines.push(
          chalk.gray(`      Evidence: ${criterion.evidence.join(", ")}`)
        );
      }
    }
  }

  // Verdict
  lines.push("\n   " + "─".repeat(50));
  const verdictColor =
    result.verdict === "pass"
      ? chalk.green
      : result.verdict === "fail"
        ? chalk.red
        : chalk.yellow;
  lines.push(
    chalk.bold("   Verdict: ") + verdictColor(result.verdict.toUpperCase())
  );

  if (verbose && result.overallReasoning) {
    lines.push(chalk.gray(`\n   ${result.overallReasoning}`));
  }

  // Suggestions
  if (result.suggestions && result.suggestions.length > 0) {
    lines.push(chalk.bold("\n   Suggestions:"));
    for (const suggestion of result.suggestions) {
      lines.push(chalk.yellow(`   • ${suggestion}`));
    }
  }

  return lines.join("\n");
}

// ============================================================================
// Autonomous Verification (New Approach)
// ============================================================================

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

    automatedResults = await runAutomatedChecks(cwd, capabilities, verbose);
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
