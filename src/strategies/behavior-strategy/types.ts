/**
 * Behavior Strategy Types
 * Types specific to the behavior verification strategy
 */

import type { AntiPatternMatch, DetectionResult } from "../../anti-patterns/types.js";

/**
 * Source of log content for behavior analysis
 */
export type LogSource = "session" | "file" | "stdin";

/**
 * Result of collecting logs
 */
export interface LogCollectionResult {
  /** Whether log collection succeeded */
  success: boolean;
  /** Collected log content */
  content?: string;
  /** Error message if collection failed */
  error?: string;
  /** Source the logs were collected from */
  source: LogSource;
  /** Path if source was file */
  path?: string;
  /** Number of lines collected */
  lineCount?: number;
}

/**
 * Options for log collection
 */
export interface LogCollectionOptions {
  /** Source to collect from */
  source: LogSource;
  /** File path (required when source is "file") */
  path?: string;
  /** Maximum lines to read (default: unlimited) */
  maxLines?: number;
  /** Encoding for file reading (default: utf-8) */
  encoding?: BufferEncoding;
}

/**
 * Result of behavior verification
 */
export interface BehaviorVerificationResult {
  /** Whether verification passed (no critical violations) */
  passed: boolean;
  /** Detection result from anti-pattern analysis */
  detectionResult: DetectionResult;
  /** Critical violations found */
  criticalViolations: AntiPatternMatch[];
  /** Warning violations found */
  warningViolations: AntiPatternMatch[];
  /** Info-level notices found */
  infoNotices: AntiPatternMatch[];
  /** Human-readable summary */
  summary: string;
  /** Remediation advice */
  remediations: string[];
}

/**
 * Custom pattern definition for behavior strategy
 */
export interface CustomBehaviorPattern {
  /** Unique identifier */
  id: string;
  /** Regex pattern as string */
  pattern: string;
  /** Severity level */
  severity: "critical" | "warning" | "info";
  /** Message to display when matched */
  message: string;
}
