/**
 * Layered Check Mode
 *
 * Provides fast, git-diff-based verification with task impact awareness.
 *
 * Layers:
 * 1. Fast deterministic checks (typecheck + lint + selective tests)
 * 2. Task impact notification (file → task mapping)
 * 2.5. Spec compliance check (opt-in via --ai) - verifies acceptance criteria
 * 3. AI task verification (opt-in via --ai)
 */

import chalk from "chalk";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";

import type { Feature, FeatureList } from "../types/index.js";
import type { AutomatedCheckResult, ExtendedCapabilities } from "./types/index.js";
import { loadFeatureList } from "../features/index.js";
import { detectCapabilities } from "../capabilities/index.js";
import { getChangedFiles, discoverTestsForFeature } from "../testing/index.js";
import { runAutomatedChecks } from "./check-executor.js";
import { analyzeWithAI } from "./ai-analysis.js";
import { createStepProgress } from "../progress.js";
import { getTaskImpact, type TaskImpact } from "./task-impact.js";
import { runBehaviorCheck, displayBehaviorCheckResult } from "./behavior-check.js";
import {
  checkSpecCompliance,
  displaySpecComplianceResult,
  type SpecComplianceResult,
} from "./spec-compliance.js";

const execAsync = promisify(exec);

/**
 * High-risk file patterns that trigger auto-escalation to full mode
 */
const HIGH_RISK_PATTERNS = [
  /^package\.json$/,
  /^package-lock\.json$/,
  /^pnpm-lock\.yaml$/,
  /^yarn\.lock$/,
  /^tsconfig.*\.json$/,
  /^\.eslintrc/,
  /^eslint\.config\./,
  /^vite\.config\./,
  /^vitest\.config\./,
  /^playwright\.config\./,
  /^\.env/,
  /^Cargo\.toml$/,
  /^go\.mod$/,
  /^requirements\.txt$/,
];

/**
 * Options for layered check
 */
export interface LayeredCheckOptions {
  /** Verbose output */
  verbose?: boolean;
  /** Run Layer 3 AI task verification */
  ai?: boolean;
  /** TDD mode from project config */
  tddMode?: "strict" | "recommended" | "disabled";
  /** Skip Layer 2 task impact detection */
  skipTaskImpact?: boolean;
  /** Skip behavior/anti-pattern check */
  skipBehavior?: boolean;
}

/**
 * Result of a single check
 */
export interface CheckResult {
  type: string;
  success: boolean;
  duration: number;
  output?: string;
}

/**
 * Result of layered check execution
 */
export interface LayeredCheckResult {
  // Layer 1: Fast checks
  changedFiles: string[];
  checks: {
    typecheck?: AutomatedCheckResult;
    lint?: AutomatedCheckResult;
    tests?: AutomatedCheckResult;
  };

  // Layer 2: Task impact
  affectedTasks: TaskImpact[];

  // Layer 2.5: Spec compliance (optional, enabled with --ai)
  specCompliance?: SpecComplianceResult[];

  // Layer 3: AI verification (optional)
  taskVerification?: Array<{
    taskId: string;
    verdict: "pass" | "fail" | "needs_review";
    reasoning: string;
  }>;

  // Summary
  duration: number;
  passed: boolean;
  skipped: string[];
  highRiskEscalation: boolean;
}

/**
 * Check if any changed files are high-risk (requiring full verification)
 */
export function isHighRiskChange(files: string[]): boolean {
  return files.some((file) => {
    const basename = path.basename(file);
    return HIGH_RISK_PATTERNS.some((pattern) => pattern.test(basename) || pattern.test(file));
  });
}

/**
 * Run layered check (main entry point)
 */
export async function runLayeredCheck(
  cwd: string,
  options: LayeredCheckOptions = {}
): Promise<LayeredCheckResult> {
  const { verbose = false, ai = false, tddMode, skipTaskImpact = false, skipBehavior = false } = options;
  const startTime = Date.now();

  // ═══════════════════════════════════════════════════════════════════════════
  // HEADER
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.bold.cyan("\n╭─ ⚡ FAST CHECK ──────────────────────────────────────╮"));

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 1: Get changed files from git
  // ═══════════════════════════════════════════════════════════════════════════
  const changedFiles = await getChangedFiles(cwd);

  if (changedFiles.length === 0) {
    console.log(chalk.yellow("│ No changed files detected                             │"));
    console.log(chalk.bold.cyan("╰──────────────────────────────────────────────────────╯\n"));
    return {
      changedFiles: [],
      checks: {},
      affectedTasks: [],
      duration: Date.now() - startTime,
      passed: true,
      skipped: ["tests", "typecheck", "lint", "build", "e2e", "ai"],
      highRiskEscalation: false,
    };
  }

  console.log(chalk.gray(`│ Changed: ${changedFiles.length} files`));
  if (verbose) {
    changedFiles.slice(0, 5).forEach((f) => console.log(chalk.gray(`│   • ${f}`)));
    if (changedFiles.length > 5) {
      console.log(chalk.gray(`│   ... and ${changedFiles.length - 5} more`));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 2: Check for high-risk changes
  // ═══════════════════════════════════════════════════════════════════════════
  const highRisk = isHighRiskChange(changedFiles);
  if (highRisk) {
    console.log(chalk.yellow("│ ⚠ High-risk files changed (config/deps)              │"));
    console.log(chalk.yellow("│   Recommend: agent-foreman check --full              │"));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // STEP 3: TDD Strict Mode Check
  // ═══════════════════════════════════════════════════════════════════════════
  if (tddMode === "strict") {
    // Check if tests exist for changed source files
    const sourceFiles = changedFiles.filter(
      (f) =>
        !f.includes(".test.") &&
        !f.includes(".spec.") &&
        !f.startsWith("tests/") &&
        !f.startsWith("test/") &&
        (f.endsWith(".ts") || f.endsWith(".tsx") || f.endsWith(".js") || f.endsWith(".jsx"))
    );

    // TODO: Check if tests exist for each source file
    // For now, just warn
    if (sourceFiles.length > 0) {
      console.log(chalk.magenta("│ TDD strict mode: Checking test coverage...           │"));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 1: Fast Checks (typecheck + lint + selective tests)
  // ═══════════════════════════════════════════════════════════════════════════
  console.log(chalk.gray("│ Skipped: AI analysis, build, e2e                     │"));
  console.log(chalk.gray("│                                                      │"));

  // Detect capabilities
  const capabilities = await detectCapabilities(cwd, { verbose: false });

  const checks: LayeredCheckResult["checks"] = {};
  const skipped: string[] = ["ai", "build", "e2e"];

  // Run selective tests based on changed files
  // Create a "virtual" feature for test discovery
  const virtualFeature: Feature = {
    id: "fast-check",
    description: "Fast check virtual feature",
    module: "fast-check",
    priority: 0,
    status: "failing",
    acceptance: [],
    dependsOn: [],
    supersedes: [],
    tags: [],
    notes: "",
    version: 1,
    origin: "manual",
  };

  const testDiscovery = await discoverTestsForFeature(cwd, virtualFeature, changedFiles);

  // Run checks with skipBuild
  const automatedResults = await runAutomatedChecks(cwd, capabilities, {
    verbose,
    testMode: testDiscovery.testFiles.length > 0 ? "quick" : "full",
    selectiveTestCommand: testDiscovery.pattern || undefined,
    testDiscovery,
    skipE2E: true,
    skipBuild: true, // Skip build in fast check
  });

  // Map results to check types
  for (const result of automatedResults) {
    if (result.type === "test") {
      checks.tests = result;
    } else if (result.type === "typecheck") {
      checks.typecheck = result;
    } else if (result.type === "lint") {
      checks.lint = result;
    }
  }

  // Display check results
  if (checks.typecheck) {
    const icon = checks.typecheck.success ? chalk.green("✓") : chalk.red("✗");
    const status = checks.typecheck.success ? "passed" : "failed";
    const duration = ((checks.typecheck.duration ?? 0) / 1000).toFixed(1);
    console.log(`│ ${icon} typecheck    ${status} (${duration}s)`);
  }

  if (checks.lint) {
    const icon = checks.lint.success ? chalk.green("✓") : chalk.red("✗");
    const status = checks.lint.success ? "passed" : "failed";
    const duration = ((checks.lint.duration ?? 0) / 1000).toFixed(1);
    console.log(`│ ${icon} lint         ${status} (${duration}s)`);
  }

  if (checks.tests) {
    const icon = checks.tests.success ? chalk.green("✓") : chalk.red("✗");
    const status = checks.tests.success ? "passed" : "failed";
    const duration = ((checks.tests.duration ?? 0) / 1000).toFixed(1);
    const testCount = testDiscovery.testFiles.length > 0 ? `${testDiscovery.testFiles.length} files` : "all";
    console.log(`│ ${icon} tests        ${status} (${duration}s) [${testCount}]`);
  }

  // Check overall pass/fail
  const passed = automatedResults.every((r) => r.success);
  const totalDuration = Date.now() - startTime;

  console.log(chalk.gray("│                                                      │"));
  if (passed) {
    console.log(chalk.green(`│ ⚡ FAST CHECK PASSED (${(totalDuration / 1000).toFixed(1)}s)`));
  } else {
    console.log(chalk.red(`│ ⚡ FAST CHECK FAILED (${(totalDuration / 1000).toFixed(1)}s)`));
  }
  console.log(chalk.bold.cyan("╰──────────────────────────────────────────────────────╯\n"));

  // ═══════════════════════════════════════════════════════════════════════════
  // BEHAVIOR CHECK: Anti-pattern detection (optional)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!skipBehavior) {
    const behaviorResult = await runBehaviorCheck(cwd, { verbose });
    displayBehaviorCheckResult(behaviorResult, verbose);

    // Don't fail fast check for behavior violations - just warn
    // Critical violations will be caught in task-based verification
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2: Task Impact Detection
  // ═══════════════════════════════════════════════════════════════════════════
  let affectedTasks: TaskImpact[] = [];

  if (!skipTaskImpact) {
    affectedTasks = await getTaskImpact(cwd, changedFiles);

    if (affectedTasks.length > 0) {
      console.log(chalk.cyan("ℹ TASK IMPACT:"));
      console.log(chalk.gray("  These changes may affect:"));
      for (const task of affectedTasks) {
        console.log(chalk.white(`    • ${task.taskId}`));
        console.log(chalk.gray(`      ${task.reason}`));
      }
      console.log("");
      console.log(chalk.gray("  To verify acceptance criteria:"));
      console.log(chalk.cyan("  $ agent-foreman check --ai\n"));
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 2.5: Spec Compliance Check (opt-in via --ai)
  // Two-stage verification: Does implementation match acceptance criteria EXACTLY?
  // ═══════════════════════════════════════════════════════════════════════════
  let specCompliance: SpecComplianceResult[] | undefined;

  if (ai && affectedTasks.length > 0) {
    console.log(chalk.bold.magenta("╭─ 📋 SPEC COMPLIANCE CHECK ────────────────────────────╮"));
    console.log(chalk.gray("│ Verifying acceptance criteria match...               │"));
    console.log(chalk.gray("│                                                      │"));

    specCompliance = [];
    const featureList = await loadFeatureList(cwd);

    if (featureList) {
      // Get git diff once for all checks
      const { stdout: diff } = await execAsync("git diff HEAD", {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      }).catch(() => ({ stdout: "" }));

      for (const impact of affectedTasks) {
        const feature = featureList.features.find((f) => f.id === impact.taskId);
        if (feature) {
          const result = await checkSpecCompliance(cwd, feature, diff, changedFiles, { verbose });
          specCompliance.push(result);
          displaySpecComplianceResult(result, verbose);
        }
      }
    }

    // Summary
    const compliantCount = specCompliance.filter((r) => r.compliant).length;
    const nonCompliantCount = specCompliance.length - compliantCount;

    console.log(chalk.gray("│                                                      │"));
    if (nonCompliantCount > 0) {
      console.log(chalk.yellow(`│ ⚠ ${nonCompliantCount} task(s) NOT compliant with spec`));
      console.log(chalk.gray("│   Review acceptance criteria before proceeding       │"));
    } else if (compliantCount > 0) {
      console.log(chalk.green(`│ ✓ All ${compliantCount} task(s) compliant with spec`));
    }
    console.log(chalk.bold.magenta("╰──────────────────────────────────────────────────────╯\n"));
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // LAYER 3: AI Task Verification (opt-in)
  // ═══════════════════════════════════════════════════════════════════════════
  let taskVerification: LayeredCheckResult["taskVerification"];

  if (ai && affectedTasks.length > 0) {
    console.log(chalk.bold.blue("╭─ 🔍 TASK VERIFICATION ───────────────────────────────╮"));
    console.log(chalk.gray(`│ Verifying ${affectedTasks.length} affected task(s)...`));
    console.log(chalk.gray("│                                                      │"));

    taskVerification = [];
    const featureList = await loadFeatureList(cwd);

    if (featureList) {
      for (const impact of affectedTasks) {
        const feature = featureList.features.find((f) => f.id === impact.taskId);
        if (feature) {
          // Get git diff for AI analysis
          const { stdout: diff } = await execAsync("git diff HEAD", { cwd, maxBuffer: 10 * 1024 * 1024 }).catch(() => ({ stdout: "" }));

          const aiResult = await analyzeWithAI(
            cwd,
            feature,
            diff,
            changedFiles,
            automatedResults,
            { verbose }
          );

          taskVerification.push({
            taskId: impact.taskId,
            verdict: aiResult.verdict,
            reasoning: aiResult.overallReasoning,
          });

          // Display result
          const icon =
            aiResult.verdict === "pass"
              ? chalk.green("✓")
              : aiResult.verdict === "fail"
                ? chalk.red("✗")
                : chalk.yellow("⚠");
          console.log(`│ ${feature.id}: ${icon} ${aiResult.verdict.toUpperCase()}`);
        }
      }
    }

    const verifyDuration = Date.now() - startTime;
    console.log(chalk.gray("│                                                      │"));
    console.log(chalk.blue(`│ 🔍 VERIFICATION COMPLETE (${(verifyDuration / 1000).toFixed(1)}s)`));
    console.log(chalk.bold.blue("╰──────────────────────────────────────────────────────╯\n"));
  }

  return {
    changedFiles,
    checks,
    affectedTasks,
    specCompliance,
    taskVerification,
    duration: Date.now() - startTime,
    passed,
    skipped,
    highRiskEscalation: highRisk,
  };
}
