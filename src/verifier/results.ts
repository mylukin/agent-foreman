/**
 * Result formatting utilities
 */

import chalk from "chalk";

import type { VerificationResult, FeatureVerificationSummary } from "../verification-types.js";

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
