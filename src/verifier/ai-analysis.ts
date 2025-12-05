/**
 * AI analysis with retry logic
 */

import chalk from "chalk";

import type { Feature } from "../types.js";
import type { AutomatedCheckResult, VerifyOptions, CriterionResult, VerificationVerdict } from "../verification-types.js";
import { isPathWithinRoot, safeReadFile } from "../file-utils.js";
import { buildVerificationPrompt, parseVerificationResponse } from "../verification-prompts.js";
import { callAnyAvailableAgent } from "../agents.js";
import { getTimeout } from "../timeout-config.js";
import { createSpinner } from "../progress.js";

/** Source file extensions for filtering */
const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];

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
 * Read related files for context
 * Uses parallel file reading for better performance
 * Validates paths to prevent path traversal attacks
 * Handles partial failures gracefully - continues if some files fail to read
 */
export async function readRelatedFiles(
  cwd: string,
  changedFiles: string[]
): Promise<Map<string, string>> {
  // Filter to source files only
  const sourceFiles = changedFiles.filter((f) =>
    SOURCE_FILE_EXTENSIONS.some((ext) => f.endsWith(ext))
  );

  // Validate paths before reading
  const validFiles = sourceFiles.filter((file) => isPathWithinRoot(cwd, file));

  // Read all files in parallel for better performance
  const readPromises = validFiles.map(async (file) => {
    const content = await safeReadFile(cwd, file);
    return { file, content };
  });

  const results = await Promise.all(readPromises);

  // Build Map from successful reads (gracefully handle failures)
  const relatedFiles = new Map<string, string>();
  for (const { file, content } of results) {
    if (content !== null) {
      relatedFiles.set(file, content);
    }
    // If content is null, file doesn't exist or can't be read - skip silently
  }

  return relatedFiles;
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
  criteriaResults: CriterionResult[];
  verdict: VerificationVerdict;
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
      timeoutMs: options.timeout || getTimeout("AI_VERIFICATION"),
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
