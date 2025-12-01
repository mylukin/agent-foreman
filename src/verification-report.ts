/**
 * Markdown report generator for verification results
 * Generates human-readable reports from VerificationResult objects
 */

import type { VerificationResult, AutomatedCheckResult } from "./verification-types.js";

/**
 * Format a timestamp to a human-readable date string
 */
function formatDate(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    return date.toISOString().replace("T", " ").replace(/\.\d{3}Z$/, " UTC");
  } catch {
    return timestamp;
  }
}

/**
 * Format duration in milliseconds to human-readable string
 */
function formatDuration(ms?: number): string {
  if (ms === undefined) return "N/A";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

/**
 * Get status emoji for pass/fail
 */
function statusEmoji(success: boolean): string {
  return success ? "✅" : "❌";
}

/**
 * Get verdict emoji
 */
function verdictEmoji(verdict: string): string {
  switch (verdict) {
    case "pass":
      return "✅";
    case "fail":
      return "❌";
    case "needs_review":
      return "⚠️";
    default:
      return "❓";
  }
}

/**
 * Format automated check type to readable name
 */
function formatCheckType(type: string): string {
  switch (type) {
    case "test":
      return "Tests";
    case "typecheck":
      return "Type Check";
    case "lint":
      return "Lint";
    case "build":
      return "Build";
    default:
      return type.charAt(0).toUpperCase() + type.slice(1);
  }
}

/**
 * Generate a formatted markdown block for automated check output
 */
function formatCheckOutput(check: AutomatedCheckResult): string {
  const lines: string[] = [];
  lines.push(`### ${formatCheckType(check.type)}`);
  lines.push("");
  lines.push(`- **Status**: ${statusEmoji(check.success)} ${check.success ? "Passed" : "Failed"}`);
  if (check.duration !== undefined) {
    lines.push(`- **Duration**: ${formatDuration(check.duration)}`);
  }
  if (check.errorCount !== undefined && check.errorCount > 0) {
    lines.push(`- **Error Count**: ${check.errorCount}`);
  }

  if (check.output && check.output.trim()) {
    lines.push("");
    lines.push("**Output**:");
    lines.push("```");
    // Truncate very long output
    const maxOutputLength = 5000;
    let output = check.output.trim();
    if (output.length > maxOutputLength) {
      output = output.substring(0, maxOutputLength) + "\n... (truncated)";
    }
    lines.push(output);
    lines.push("```");
  }

  return lines.join("\n");
}

/**
 * Generate a markdown verification report from a VerificationResult
 *
 * @param result - The verification result to format
 * @param runNumber - Optional run number for the report header
 * @returns Formatted markdown string
 */
export function generateVerificationReport(
  result: VerificationResult,
  runNumber?: number
): string {
  const lines: string[] = [];

  // Header
  lines.push(`# Verification Report: ${result.featureId}`);
  lines.push("");
  if (runNumber !== undefined) {
    lines.push(`**Run**: #${String(runNumber).padStart(3, "0")}`);
  }
  lines.push(`**Date**: ${formatDate(result.timestamp)}`);
  lines.push(`**Verdict**: ${verdictEmoji(result.verdict)} ${result.verdict.toUpperCase()}`);
  lines.push(`**Verified By**: ${result.verifiedBy}`);
  if (result.commitHash) {
    lines.push(`**Commit**: \`${result.commitHash.substring(0, 7)}\``);
  }
  lines.push("");

  // Changed Files section
  lines.push("## Changed Files");
  lines.push("");
  if (result.changedFiles && result.changedFiles.length > 0) {
    for (const file of result.changedFiles) {
      lines.push(`- \`${file}\``);
    }
  } else {
    lines.push("_No files changed_");
  }
  if (result.diffSummary) {
    lines.push("");
    lines.push(`> ${result.diffSummary}`);
  }
  lines.push("");

  // Automated Checks section
  lines.push("## Automated Checks");
  lines.push("");
  if (result.automatedChecks && result.automatedChecks.length > 0) {
    // Summary table
    lines.push("| Check | Status | Duration |");
    lines.push("|-------|--------|----------|");
    for (const check of result.automatedChecks) {
      const status = check.success ? "✅ Pass" : "❌ Fail";
      lines.push(
        `| ${formatCheckType(check.type)} | ${status} | ${formatDuration(check.duration)} |`
      );
    }
    lines.push("");

    // Detailed output for each check
    for (const check of result.automatedChecks) {
      lines.push(formatCheckOutput(check));
      lines.push("");
    }
  } else {
    lines.push("_No automated checks were run_");
    lines.push("");
  }

  // Acceptance Criteria section
  lines.push("## Acceptance Criteria");
  lines.push("");
  if (result.criteriaResults && result.criteriaResults.length > 0) {
    for (const criterion of result.criteriaResults) {
      const status = criterion.satisfied ? "✅" : "❌";
      lines.push(`### ${criterion.index + 1}. ${criterion.criterion}`);
      lines.push("");
      lines.push(`- **Satisfied**: ${status} ${criterion.satisfied ? "Yes" : "No"}`);
      lines.push(`- **Confidence**: ${Math.round(criterion.confidence * 100)}%`);
      lines.push("");

      if (criterion.reasoning) {
        lines.push("**Reasoning**:");
        lines.push("");
        lines.push(criterion.reasoning);
        lines.push("");
      }

      if (criterion.evidence && criterion.evidence.length > 0) {
        lines.push("**Evidence**:");
        lines.push("");
        for (const evidence of criterion.evidence) {
          lines.push(`- \`${evidence}\``);
        }
        lines.push("");
      }
    }
  } else {
    lines.push("_No criteria were evaluated_");
    lines.push("");
  }

  // Overall Assessment section
  lines.push("## Overall Assessment");
  lines.push("");
  if (result.overallReasoning) {
    lines.push(result.overallReasoning);
  } else {
    lines.push("_No overall assessment provided_");
  }
  lines.push("");

  // Suggestions section (optional)
  if (result.suggestions && result.suggestions.length > 0) {
    lines.push("## Suggestions");
    lines.push("");
    for (const suggestion of result.suggestions) {
      lines.push(`- ${suggestion}`);
    }
    lines.push("");
  }

  // Code Quality Notes section (optional)
  if (result.codeQualityNotes && result.codeQualityNotes.length > 0) {
    lines.push("## Code Quality Notes");
    lines.push("");
    for (const note of result.codeQualityNotes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  // Related Files section (optional)
  if (result.relatedFilesAnalyzed && result.relatedFilesAnalyzed.length > 0) {
    lines.push("## Related Files Analyzed");
    lines.push("");
    for (const file of result.relatedFilesAnalyzed) {
      lines.push(`- \`${file}\``);
    }
    lines.push("");
  }

  // Footer
  lines.push("---");
  lines.push("");
  lines.push(
    `_Generated by agent-foreman verification system at ${formatDate(result.timestamp)}_`
  );

  return lines.join("\n");
}

/**
 * Generate a compact summary line for index display
 */
export function generateVerificationSummary(result: VerificationResult): string {
  const passedCriteria = result.criteriaResults?.filter((c) => c.satisfied).length ?? 0;
  const totalCriteria = result.criteriaResults?.length ?? 0;
  return `${passedCriteria}/${totalCriteria} criteria satisfied`;
}
