/**
 * Behavior Check Integration
 *
 * Analyzes ai/progress.log for workflow anti-pattern violations.
 * Integrated into `agent-foreman check` for automatic detection.
 */

import chalk from "chalk";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import {
  detectAntiPatterns,
  type DetectionResult,
  type AntiPatternSeverity,
} from "../anti-patterns/index.js";

/**
 * Options for behavior check
 */
export interface BehaviorCheckOptions {
  /** Minimum severity to report (default: "warning") */
  minSeverity?: AntiPatternSeverity;
  /** Path to log file (default: ai/progress.log) */
  logPath?: string;
  /** Whether to fail on critical violations (default: true) */
  failOnCritical?: boolean;
  /** Show verbose output */
  verbose?: boolean;
}

/**
 * Result of behavior check
 */
export interface BehaviorCheckResult {
  /** Whether the check passed (no critical violations) */
  passed: boolean;
  /** Detection result with all violations */
  detectionResult: DetectionResult;
  /** Path to the log file analyzed */
  logPath: string;
  /** Whether log file was found */
  logFound: boolean;
  /** Number of lines analyzed */
  linesAnalyzed: number;
}

/**
 * Run behavior check on progress log
 *
 * @param cwd - Current working directory
 * @param options - Check options
 * @returns Behavior check result
 */
export async function runBehaviorCheck(
  cwd: string,
  options: BehaviorCheckOptions = {}
): Promise<BehaviorCheckResult> {
  const {
    minSeverity = "warning",
    logPath = join(cwd, "ai", "progress.log"),
    failOnCritical = true,
    verbose = false,
  } = options;

  // Check if log file exists
  if (!existsSync(logPath)) {
    return {
      passed: true,
      detectionResult: {
        hasViolations: false,
        violations: [],
        bySeverity: { critical: 0, warning: 0, info: 0 },
        byCategory: {
          "workflow-bypass": 0,
          "file-reading": 0,
          "manual-edit": 0,
          "algorithm-local": 0,
          "status-guess": 0,
        },
        summary: "No progress log found",
      },
      logPath,
      logFound: false,
      linesAnalyzed: 0,
    };
  }

  // Read log content
  const content = await readFile(logPath, "utf-8");
  const linesAnalyzed = content.split("\n").length;

  // Skip if empty
  if (content.trim() === "") {
    return {
      passed: true,
      detectionResult: {
        hasViolations: false,
        violations: [],
        bySeverity: { critical: 0, warning: 0, info: 0 },
        byCategory: {
          "workflow-bypass": 0,
          "file-reading": 0,
          "manual-edit": 0,
          "algorithm-local": 0,
          "status-guess": 0,
        },
        summary: "Progress log is empty",
      },
      logPath,
      logFound: true,
      linesAnalyzed: 0,
    };
  }

  // Run detection
  const detectionResult = detectAntiPatterns(content, {
    minSeverity,
    includeContext: verbose,
    contextLines: 2,
  });

  // Determine pass/fail
  const passed = failOnCritical
    ? detectionResult.bySeverity.critical === 0
    : !detectionResult.hasViolations;

  return {
    passed,
    detectionResult,
    logPath,
    logFound: true,
    linesAnalyzed,
  };
}

/**
 * Display behavior check results to console
 *
 * @param result - Behavior check result
 * @param verbose - Show verbose output
 */
export function displayBehaviorCheckResult(
  result: BehaviorCheckResult,
  verbose: boolean = false
): void {
  const { passed, detectionResult, logFound, linesAnalyzed } = result;

  if (!logFound) {
    console.log(chalk.gray("│ Behavior: No progress log found (skipped)"));
    return;
  }

  if (linesAnalyzed === 0) {
    console.log(chalk.gray("│ Behavior: Progress log is empty (skipped)"));
    return;
  }

  if (!detectionResult.hasViolations) {
    console.log(chalk.green("│ Behavior: No workflow violations detected ✓"));
    return;
  }

  // Has violations
  const { bySeverity, violations } = detectionResult;

  if (passed) {
    // Passed but has warnings
    console.log(
      chalk.yellow(
        `│ Behavior: ${bySeverity.warning} warning(s) detected`
      )
    );
  } else {
    // Failed due to critical violations
    console.log(
      chalk.red(
        `│ Behavior: ${bySeverity.critical} CRITICAL violation(s) detected!`
      )
    );
  }

  // Show violations (critical first, then warnings)
  const criticalViolations = violations.filter((v) => v.pattern.severity === "critical");
  const warningViolations = violations.filter((v) => v.pattern.severity === "warning");

  if (criticalViolations.length > 0) {
    console.log(chalk.red("│"));
    console.log(chalk.red("│ ⚠ CRITICAL WORKFLOW VIOLATIONS:"));
    for (const v of criticalViolations.slice(0, 3)) {
      console.log(chalk.red(`│   • ${v.pattern.description}`));
      if (verbose && v.matchedText) {
        const truncated = v.matchedText.length > 50
          ? v.matchedText.substring(0, 50) + "..."
          : v.matchedText;
        console.log(chalk.gray(`│     Match: "${truncated}"`));
      }
      console.log(chalk.yellow(`│     Fix: ${v.pattern.remediation}`));
    }
    if (criticalViolations.length > 3) {
      console.log(chalk.red(`│   ... and ${criticalViolations.length - 3} more`));
    }
  }

  if (warningViolations.length > 0 && verbose) {
    console.log(chalk.yellow("│"));
    console.log(chalk.yellow("│ Warnings:"));
    for (const v of warningViolations.slice(0, 2)) {
      console.log(chalk.yellow(`│   • ${v.pattern.description}`));
    }
    if (warningViolations.length > 2) {
      console.log(chalk.yellow(`│   ... and ${warningViolations.length - 2} more`));
    }
  }
}

/**
 * Format behavior check result for task-based verification display
 */
export function formatBehaviorCheckForTask(result: BehaviorCheckResult): string {
  const { passed, detectionResult, logFound } = result;
  const lines: string[] = [];

  lines.push(chalk.bold("\n🔍 Behavior Analysis:"));

  if (!logFound) {
    lines.push(chalk.gray("   No progress log found - skipped"));
    return lines.join("\n");
  }

  if (!detectionResult.hasViolations) {
    lines.push(chalk.green("   ✓ No workflow violations detected"));
    return lines.join("\n");
  }

  const { bySeverity, violations } = detectionResult;

  if (!passed) {
    lines.push(chalk.red(`   ✗ ${bySeverity.critical} critical violation(s) found`));
    lines.push("");

    const criticalViolations = violations.filter((v) => v.pattern.severity === "critical");
    for (const v of criticalViolations) {
      lines.push(chalk.red(`   • ${v.pattern.description}`));
      lines.push(chalk.yellow(`     → ${v.pattern.remediation}`));
    }

    lines.push("");
    lines.push(chalk.yellow("   Review ai/progress.log for details"));
  } else {
    lines.push(chalk.yellow(`   ⚠ ${bySeverity.warning} warning(s) found (non-blocking)`));
  }

  return lines.join("\n");
}
