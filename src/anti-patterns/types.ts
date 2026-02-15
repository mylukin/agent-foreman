/**
 * Anti-Pattern Detection Types
 * Types for the anti-pattern registry and detector
 */

/**
 * Severity levels for anti-patterns
 * - critical: Must not occur, blocks workflow completion
 * - warning: Should not occur, may indicate problems
 * - info: Informational, may be acceptable in some contexts
 */
export type AntiPatternSeverity = "critical" | "warning" | "info";

/**
 * Categories of anti-patterns
 * Groups related violations for filtering and reporting
 */
export type AntiPatternCategory =
  | "workflow-bypass" // Skipping CLI commands (next, check, done)
  | "file-reading" // Reading task files for workflow decisions
  | "manual-edit" // Directly editing task files or index
  | "algorithm-local" // Implementing selection logic locally
  | "status-guess"; // Guessing status instead of using CLI

/**
 * Definition of an anti-pattern
 * Describes what to detect and how to remediate
 */
export interface AntiPattern {
  /** Unique identifier for this pattern */
  id: string;
  /** Human-readable description of the violation */
  description: string;
  /** Category for grouping and filtering */
  category: AntiPatternCategory;
  /** Severity level */
  severity: AntiPatternSeverity;
  /** Regex patterns that indicate this anti-pattern */
  detectionPatterns: RegExp[];
  /** Context patterns that must also match (narrows detection) */
  contextPatterns?: RegExp[];
  /** Patterns that exclude a match (false positive prevention) */
  excludePatterns?: RegExp[];
  /** Remediation guidance for the agent */
  remediation: string;
  /** Example of the violation (for documentation) */
  example?: string;
  /** Example of correct behavior (for documentation) */
  correctExample?: string;
}

/**
 * Result of detecting an anti-pattern
 */
export interface AntiPatternMatch {
  /** The matched anti-pattern */
  pattern: AntiPattern;
  /** The text that triggered the match */
  matchedText: string;
  /** Line number where match occurred (if available) */
  lineNumber?: number;
  /** Context around the match */
  context?: string;
  /** Timestamp of detection */
  timestamp: Date;
}

/**
 * Result of running anti-pattern detection
 */
export interface DetectionResult {
  /** Whether any anti-patterns were detected */
  hasViolations: boolean;
  /** All detected violations */
  violations: AntiPatternMatch[];
  /** Count by severity */
  bySeverity: {
    critical: number;
    warning: number;
    info: number;
  };
  /** Count by category */
  byCategory: Record<AntiPatternCategory, number>;
  /** Summary message */
  summary: string;
}

/**
 * Options for anti-pattern detection
 */
export interface DetectionOptions {
  /** Minimum severity to report (default: "warning") */
  minSeverity?: AntiPatternSeverity;
  /** Categories to include (default: all) */
  categories?: AntiPatternCategory[];
  /** Whether to include context in matches (default: true) */
  includeContext?: boolean;
  /** Number of context lines before/after match (default: 2) */
  contextLines?: number;
}
