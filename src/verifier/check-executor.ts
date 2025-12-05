/**
 * Automated check execution
 */

import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import chalk from "chalk";

import type { AutomatedCheckResult, VerificationCapabilities } from "../verification-types.js";
import type { TestDiscoveryResult } from "../test-discovery.js";
import type { AutomatedCheckOptions, CheckDefinition } from "./types.js";
import { buildE2ECommand, determineE2EMode, type E2EMode } from "../test-discovery.js";
import { createProgressBar } from "../progress.js";

const execAsync = promisify(exec);

/**
 * Run a single automated check
 */
export async function runCheck(
  cwd: string,
  type: AutomatedCheckResult["type"],
  command: string
): Promise<AutomatedCheckResult> {
  return runCheckWithEnv(cwd, type, command, {});
}

/**
 * Run a single automated check with custom environment variables
 */
export async function runCheckWithEnv(
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

    const { createSpinner } = await import("../progress.js");
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
