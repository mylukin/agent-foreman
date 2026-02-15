/**
 * Output Formatting for Behavior Strategy
 * Formats behavior verification results for display
 */

import type { AntiPatternMatch } from "../../anti-patterns/types.js";
import type { BehaviorVerificationResult } from "./types.js";

/**
 * Format a behavior verification result for output
 *
 * @param result - The verification result
 * @returns Formatted output string
 */
export function formatBehaviorOutput(result: BehaviorVerificationResult): string {
  const lines: string[] = [];

  // Header
  const statusEmoji = result.passed ? "✓" : "✗";
  const statusText = result.passed ? "PASSED" : "FAILED";
  lines.push(`Behavior Verification: ${statusEmoji} ${statusText}`);
  lines.push("");

  // Summary
  lines.push(result.summary);
  lines.push("");

  // Critical violations
  if (result.criticalViolations.length > 0) {
    lines.push("CRITICAL Violations:");
    for (const violation of result.criticalViolations) {
      lines.push(formatViolation(violation, "  "));
    }
    lines.push("");
  }

  // Warning violations
  if (result.warningViolations.length > 0) {
    lines.push("Warnings:");
    for (const violation of result.warningViolations) {
      lines.push(formatViolation(violation, "  "));
    }
    lines.push("");
  }

  // Info notices (only if verbose or no other issues)
  if (result.infoNotices.length > 0 && result.passed) {
    lines.push("Info:");
    for (const notice of result.infoNotices) {
      lines.push(formatViolation(notice, "  "));
    }
    lines.push("");
  }

  // Remediations
  if (result.remediations.length > 0 && !result.passed) {
    lines.push("Recommended Actions:");
    for (const remediation of result.remediations) {
      lines.push(`  • ${remediation}`);
    }
    lines.push("");
  }

  return lines.join("\n").trim();
}

/**
 * Format a single violation for display
 */
function formatViolation(violation: AntiPatternMatch, indent: string = ""): string {
  const lines: string[] = [];

  // Main description
  lines.push(`${indent}• ${violation.pattern.description}`);

  // Location info
  if (violation.lineNumber) {
    lines.push(`${indent}  Line: ${violation.lineNumber}`);
  }

  // Matched text (truncated)
  const matchText =
    violation.matchedText.length > 60
      ? violation.matchedText.substring(0, 60) + "..."
      : violation.matchedText;
  lines.push(`${indent}  Match: "${matchText}"`);

  // Remediation
  lines.push(`${indent}  Fix: ${violation.pattern.remediation}`);

  return lines.join("\n");
}

/**
 * Format a compact summary for logs
 */
export function formatCompactSummary(result: BehaviorVerificationResult): string {
  const { detectionResult } = result;
  const parts: string[] = [];

  parts.push(`Behavior: ${result.passed ? "PASS" : "FAIL"}`);

  if (detectionResult.bySeverity.critical > 0) {
    parts.push(`${detectionResult.bySeverity.critical} critical`);
  }
  if (detectionResult.bySeverity.warning > 0) {
    parts.push(`${detectionResult.bySeverity.warning} warnings`);
  }

  return parts.join(" | ");
}

/**
 * Format violations as JSON for structured output
 */
export function formatViolationsJson(
  result: BehaviorVerificationResult
): Record<string, unknown> {
  return {
    passed: result.passed,
    summary: result.summary,
    violations: {
      critical: result.criticalViolations.map(violationToJson),
      warning: result.warningViolations.map(violationToJson),
      info: result.infoNotices.map(violationToJson),
    },
    remediations: result.remediations,
    counts: result.detectionResult.bySeverity,
    categories: result.detectionResult.byCategory,
  };
}

/**
 * Convert a violation to JSON-serializable format
 */
function violationToJson(violation: AntiPatternMatch): Record<string, unknown> {
  return {
    id: violation.pattern.id,
    description: violation.pattern.description,
    category: violation.pattern.category,
    severity: violation.pattern.severity,
    matchedText: violation.matchedText,
    lineNumber: violation.lineNumber,
    remediation: violation.pattern.remediation,
    timestamp: violation.timestamp.toISOString(),
  };
}
