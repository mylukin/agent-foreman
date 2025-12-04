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
  TestMode,
  E2ECapabilityInfo,
  E2ETestMode,
  VerificationMode,
  ExtendedCapabilities,
} from "./verification-types.js";
import {
  getSelectiveTestCommand,
  buildSelectiveTestCommand,
  type TestDiscoveryResult,
  buildE2ECommand,
  getE2ETagsForFeature,
  determineE2EMode,
  type E2EMode,
} from "./test-discovery.js";
import {
  detectVerificationCapabilities,
  detectCapabilities,
} from "./project-capabilities.js";
import { saveVerificationResult } from "./verification-store.js";
import {
  buildVerificationPrompt,
  parseVerificationResponse,
} from "./verification-prompts.js";
import { callAnyAvailableAgent } from "./agents.js";
import { getTimeout } from "./timeout-config.js";
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
// Verification Mode Selection
// ============================================================================

/**
 * Determine the verification mode for a feature based on its configuration
 *
 * TDD mode is activated when the feature has explicit test requirements defined.
 * In TDD mode, verification runs tests without AI analysis.
 *
 * @param feature - The feature to check
 * @returns 'tdd' if testRequirements.unit.required OR testRequirements.e2e.required, otherwise 'ai'
 */
export function determineVerificationMode(feature: Feature): VerificationMode {
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
  return runCheckWithEnv(cwd, type, command, {});
}

/**
 * Run a single automated check with custom environment variables
 */
async function runCheckWithEnv(
  cwd: string,
  type: AutomatedCheckResult["type"],
  command: string,
  env: Record<string, string>
): Promise<AutomatedCheckResult> {
  const startTime = Date.now();

  try {
    const { stdout, stderr } = await execAsync(command, {
      cwd,
      maxBuffer: 5 * 1024 * 1024,
      timeout: 300000, // 5 minute timeout
      env: { ...process.env, ...env },
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
 * Options for running automated checks
 */
export interface AutomatedCheckOptions {
  /** Verbose output */
  verbose?: boolean;
  /** Test execution mode: "full" | "quick" | "skip" */
  testMode?: TestMode;
  /** Selective test command (for quick mode) */
  selectiveTestCommand?: string | null;
  /** Test discovery result for logging */
  testDiscovery?: TestDiscoveryResult;
  /** Skip E2E tests entirely */
  skipE2E?: boolean;
  /** E2E capability info for running E2E tests */
  e2eInfo?: E2ECapabilityInfo;
  /** E2E tags for feature-based filtering */
  e2eTags?: string[];
  /**
   * E2E test execution mode (if not specified, derived from testMode and e2eTags)
   * - "full": Run all E2E tests
   * - "smoke": Run only @smoke E2E tests (default)
   * - "tags": Run E2E tests matching e2eTags
   * - "skip": Skip E2E tests entirely
   */
  e2eMode?: E2ETestMode;
  /**
   * Use ai/init.sh check instead of direct commands
   * When true, delegates all test orchestration to the generated shell script
   * which implements quick mode, selective testing, and E2E tag filtering
   */
  useInitScript?: boolean;
  /** Path to the init script (default: ai/init.sh) */
  initScriptPath?: string;
  /**
   * Run checks in parallel for faster execution
   * When true, independent checks (test, typecheck, lint, build) run concurrently
   * E2E tests always run sequentially after unit tests pass
   * Default: false for backward compatibility
   */
  parallel?: boolean;
}

/**
 * Internal type for check definition
 */
interface CheckDefinition {
  type: AutomatedCheckResult["type"];
  command: string;
  name: string;
  isE2E?: boolean;
}

/**
 * Run checks in parallel using Promise.allSettled for fault tolerance
 * E2E tests are handled separately and run sequentially after unit tests pass
 */
export async function runChecksInParallel(
  cwd: string,
  checks: CheckDefinition[],
  verbose: boolean
): Promise<AutomatedCheckResult[]> {
  // Separate E2E checks from other checks
  const nonE2EChecks = checks.filter((c) => !c.isE2E);
  const e2eChecks = checks.filter((c) => c.isE2E);

  // Create progress bar for all checks
  const progressBar = createProgressBar("Running automated checks (parallel)", checks.length);
  progressBar.start();

  // CI environment variable for test frameworks
  const ciEnv: Record<string, string> = { CI: "true" };

  // Run non-E2E checks in parallel
  if (verbose) {
    console.log(chalk.blue(`   Running ${nonE2EChecks.length} checks in parallel...`));
  }

  progressBar.update(0, `Running ${nonE2EChecks.length} checks in parallel`);

  const parallelPromises = nonE2EChecks.map(async (check) => {
    const env = (check.type === "test" || check.type === "e2e") ? ciEnv : {};
    return {
      check,
      result: await runCheckWithEnv(cwd, check.type, check.command, env),
    };
  });

  const settledResults = await Promise.allSettled(parallelPromises);
  const results: AutomatedCheckResult[] = [];

  // Process results
  let completedCount = 0;
  for (const settled of settledResults) {
    completedCount++;
    if (settled.status === "fulfilled") {
      const { check, result } = settled.value;
      results.push(result);
      if (verbose) {
        const status = result.success ? chalk.green("passed") : chalk.red("failed");
        console.log(chalk.gray(`   ${check.name}: ${status}`));
      }
    } else {
      // Promise.allSettled captures rejections - create failed result
      const errorMessage = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);
      results.push({
        type: "test",
        success: false,
        output: `Check failed with error: ${errorMessage}`,
        duration: 0,
      });
    }
  }

  progressBar.update(completedCount, `Completed ${completedCount} checks`);

  // Check if unit tests passed before running E2E
  const unitTestsPassed = results
    .filter((r) => r.type === "test")
    .every((r) => r.success);

  // Run E2E checks sequentially after unit tests (if unit tests passed)
  if (e2eChecks.length > 0) {
    if (unitTestsPassed) {
      if (verbose) {
        console.log(chalk.blue(`   Running ${e2eChecks.length} E2E checks sequentially...`));
      }

      for (const check of e2eChecks) {
        progressBar.update(completedCount, `Running ${check.name}`);
        const result = await runCheckWithEnv(cwd, check.type, check.command, ciEnv);
        results.push(result);
        completedCount++;

        if (verbose) {
          const status = result.success ? chalk.green("passed") : chalk.red("failed");
          console.log(chalk.gray(`   ${check.name}: ${status}`));
        }
      }
    } else {
      // Skip E2E tests if unit tests failed
      if (verbose) {
        console.log(chalk.yellow(`   Skipping E2E tests (unit tests failed)`));
      }
      for (const check of e2eChecks) {
        results.push({
          type: "e2e",
          success: false,
          output: "Skipped: unit tests failed",
          duration: 0,
        });
        completedCount++;
      }
    }
  }

  progressBar.complete("Automated checks complete (parallel)");
  return results;
}

/**
 * Run all available automated checks
 */
export async function runAutomatedChecks(
  cwd: string,
  capabilities: VerificationCapabilities,
  optionsOrVerbose: boolean | AutomatedCheckOptions = false
): Promise<AutomatedCheckResult[]> {
  // Handle backward compatibility with boolean verbose parameter
  const options: AutomatedCheckOptions =
    typeof optionsOrVerbose === "boolean"
      ? { verbose: optionsOrVerbose }
      : optionsOrVerbose;

  const {
    verbose = false,
    testMode = "full",
    selectiveTestCommand,
    testDiscovery,
    skipE2E = false,
    e2eInfo,
    e2eTags = [],
    e2eMode: explicitE2EMode,
    useInitScript = false,
    initScriptPath,
    parallel = false,
  } = options;
  const results: AutomatedCheckResult[] = [];

  // ========================================================================
  // Init Script Mode: Delegate all checks to ai/init.sh
  // ========================================================================
  if (useInitScript) {
    const scriptPath = initScriptPath || path.join(cwd, "ai/init.sh");

    // Build command with appropriate flags
    let command = `"${scriptPath}" check`;

    // Add mode flags
    if (testMode === "quick") {
      command += " --quick";
    } else if (testMode === "full") {
      command += " --full";
    }

    if (skipE2E) {
      command += " --skip-e2e";
    }

    // Add test pattern if selective testing
    if (testMode === "quick" && testDiscovery?.pattern) {
      command += ` "${testDiscovery.pattern}"`;
    }

    // Prepare environment variables
    const env: Record<string, string> = {};
    if (e2eTags.length > 0) {
      env.E2E_TAGS = e2eTags.join(",");
    }

    // Log init script mode
    const modeLabel = testMode === "quick" ? "quick" : testMode === "full" ? "full" : "default";
    if (verbose) {
      console.log(chalk.blue(`   Using init.sh check (${modeLabel} mode)`));
      if (testDiscovery?.pattern) {
        console.log(chalk.gray(`   Test pattern: ${testDiscovery.pattern}`));
      }
      if (e2eTags.length > 0) {
        console.log(chalk.gray(`   E2E_TAGS: ${e2eTags.join(",")}`));
      }
    }

    // Create progress bar for init script
    const progressBar = createProgressBar("Running init.sh check", 1);
    progressBar.start();
    progressBar.update(0, `Running init.sh check (${modeLabel})`);

    const result = await runCheckWithEnv(cwd, "init-script", command, env);
    results.push(result);

    if (result.success) {
      progressBar.complete("init.sh check passed");
    } else {
      progressBar.complete("init.sh check failed");
    }

    return results;
  }

  // ========================================================================
  // Direct Command Mode: Run individual checks
  // ========================================================================

  // Collect checks to run
  const checks: CheckDefinition[] = [];

  // Handle test execution based on mode
  if (testMode !== "skip" && capabilities.hasTests && capabilities.testCommand) {
    if (testMode === "quick" && selectiveTestCommand) {
      // Use selective test command for quick mode
      const testName = testDiscovery?.testFiles.length
        ? `selective tests (${testDiscovery.testFiles.length} files)`
        : "selective tests";
      checks.push({ type: "test", command: selectiveTestCommand, name: testName });

      if (verbose && testDiscovery) {
        console.log(chalk.gray(`   Test discovery: ${testDiscovery.source}`));
        if (testDiscovery.testFiles.length > 0) {
          console.log(chalk.gray(`   Test files: ${testDiscovery.testFiles.join(", ")}`));
        }
      }
    } else {
      // Full test mode - run all tests
      checks.push({ type: "test", command: capabilities.testCommand, name: "tests" });
    }
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

  // Handle E2E test execution (runs after unit tests)
  if (!skipE2E && e2eInfo?.available && e2eInfo.command) {
    // Use explicit E2E mode if provided, otherwise derive from testMode and tags
    const e2eMode: E2EMode = explicitE2EMode ?? determineE2EMode(testMode, e2eTags.length > 0);
    const e2eCommand = buildE2ECommand(e2eInfo, e2eTags, e2eMode);

    if (e2eCommand) {
      const e2eName = e2eMode === "full"
        ? "E2E tests (full)"
        : e2eMode === "smoke"
          ? "E2E tests (@smoke)"
          : `E2E tests (${e2eTags.join(", ")})`;
      checks.push({ type: "e2e", command: e2eCommand, name: e2eName, isE2E: true });

      if (verbose) {
        console.log(chalk.gray(`   E2E mode: ${e2eMode}`));
        if (e2eTags.length > 0) {
          console.log(chalk.gray(`   E2E tags: ${e2eTags.join(", ")}`));
        }
      }
    }
  } else if (skipE2E && verbose) {
    console.log(chalk.gray(`   E2E tests: skipped (--skip-e2e)`));
  }

  if (checks.length === 0) {
    return results;
  }

  // ========================================================================
  // Parallel Mode: Run checks concurrently (except E2E which is sequential)
  // ========================================================================
  if (parallel) {
    if (verbose) {
      console.log(chalk.blue(`   Parallel mode enabled`));
    }
    return runChecksInParallel(cwd, checks, verbose);
  }

  // ========================================================================
  // Sequential Mode: Run checks one by one (default for backward compatibility)
  // ========================================================================

  // Create progress bar for checks
  const progressBar = createProgressBar("Running automated checks", checks.length);
  progressBar.start();

  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    progressBar.update(i, `Running ${check.name}`);

    const spinner = verbose ? createSpinner(`Running ${check.name}`) : null;
    // CI=true disables watch mode in Vitest/Jest and ensures proper CI behavior in Playwright
    const ciEnv: Record<string, string> = (check.type === "test" || check.type === "e2e") ? { CI: "true" } : {};
    const result = await runCheckWithEnv(cwd, check.type, check.command, ciEnv);
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

/** Source file extensions for filtering */
const SOURCE_FILE_EXTENSIONS = [".ts", ".tsx", ".js", ".jsx", ".py", ".go", ".rs"];

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
    let testDiscovery: TestDiscoveryResult | undefined;

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

// ============================================================================
// TDD Verification (Tests Only - No AI)
// ============================================================================

/**
 * Options for TDD verification
 */
export interface TDDVerifyOptions {
  /** Verbose output */
  verbose?: boolean;
  /** Skip E2E tests */
  skipE2E?: boolean;
  /** E2E test tags */
  e2eTags?: string[];
}

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
