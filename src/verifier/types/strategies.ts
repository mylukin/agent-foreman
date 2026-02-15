/**
 * Universal Verification Strategy (UVS) types
 */

/**
 * Types of verification strategies supported
 * Each type corresponds to a specific verification executor
 */
export type VerificationStrategyType =
  | "test" // Unit/integration tests
  | "e2e" // End-to-end tests
  | "script" // Custom shell script execution
  | "http" // HTTP endpoint verification
  | "file" // File existence/content checks
  | "command" // Custom command execution
  | "manual" // Human review/approval
  | "ai" // AI-powered verification
  | "composite" // AND/OR combinations of strategies
  | "behavior"; // Agent behavior/workflow violation detection

/**
 * Base interface for all verification strategies
 * All strategy types extend this interface
 */
export interface BaseVerificationStrategy {
  /** Strategy type identifier */
  type: VerificationStrategyType;
  /** Human-readable description of this verification */
  description?: string;
  /** Whether this verification must pass for the task to be considered complete */
  required: boolean;
  /** Timeout in milliseconds (overrides default) */
  timeout?: number;
  /** Number of retries on failure (default: 0) */
  retries?: number;
  /** Environment variables to set during verification */
  env?: Record<string, string>;
}

/**
 * Test verification strategy
 * Runs unit or integration tests
 */
export interface TestVerificationStrategy extends BaseVerificationStrategy {
  type: "test";
  /** Glob pattern for test files */
  pattern?: string;
  /** Specific test cases to run */
  cases?: string[];
  /** Test framework (vitest, jest, pytest, etc.) */
  framework?: string;
}

/**
 * E2E test verification strategy
 * Runs end-to-end tests (Playwright, Cypress, etc.)
 */
export interface E2EVerificationStrategy extends BaseVerificationStrategy {
  type: "e2e";
  /** Glob pattern for E2E test files */
  pattern?: string;
  /** Tags to filter E2E tests (e.g., @smoke, @auth) */
  tags?: string[];
  /** Specific scenarios to run */
  scenarios?: string[];
  /** E2E framework (playwright, cypress, puppeteer) */
  framework?: string;
}

/**
 * Script verification strategy
 * Runs a custom shell script
 */
export interface ScriptVerificationStrategy extends BaseVerificationStrategy {
  type: "script";
  /** Path to the script file (relative to project root) */
  path: string;
  /** Arguments to pass to the script */
  args?: string[];
  /** Working directory for script execution */
  cwd?: string;
  /** Expected exit code (default: 0) */
  expectedExitCode?: number;
  /** Regex pattern that stdout must match for success */
  outputPattern?: string;
}

/**
 * HTTP verification strategy
 * Verifies HTTP endpoint availability and response
 */
export interface HttpVerificationStrategy extends BaseVerificationStrategy {
  type: "http";
  /** URL to verify (supports ${ENV_VAR} substitution) */
  url: string;
  /** HTTP method (default: GET) */
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
  /** Request headers */
  headers?: Record<string, string>;
  /** Request body (for POST/PUT/PATCH) */
  body?: string | Record<string, unknown>;
  /** Expected HTTP status code(s) - single number or array (default: 200) */
  expectedStatus?: number | number[];
  /** Expected response body pattern (regex) */
  expectedBodyPattern?: string;
  /** JSONPath-based assertions on response body */
  jsonAssertions?: Array<{
    path: string;
    expected: unknown;
  }>;
  /** Allowed hosts for SSRF prevention (default: localhost only) */
  allowedHosts?: string[];
}

/**
 * Single file check configuration
 * Applied to each matched file in the paths array
 */
export interface FileCheck {
  /** Check file exists (default: true) */
  exists?: boolean;
  /** Check file contains specific content (regex) */
  containsPattern?: string;
  /** Check file matches specific content exactly */
  matchesContent?: string;
  /** Check file size constraints (in bytes) */
  sizeConstraint?: {
    min?: number;
    max?: number;
  };
  /** Check file is not empty */
  notEmpty?: boolean;
  /** Check file permissions (octal, e.g., "755") */
  permissions?: string;
}

/**
 * File verification strategy
 * Checks file existence and/or content
 */
export interface FileVerificationStrategy extends BaseVerificationStrategy {
  type: "file";
  /** Single file path to verify (for backward compatibility) */
  path?: string;
  /** Multiple paths to verify (supports glob patterns) */
  paths?: string[];
  /** Array of checks to apply to each matched file */
  checks?: FileCheck[];
  /** Check file exists (for backward compatibility with single path) */
  exists?: boolean;
  /** Check file contains specific content (regex) */
  containsPattern?: string;
  /** Check file matches specific content exactly */
  matchesContent?: string;
  /** Check file size constraints */
  sizeConstraint?: {
    min?: number;
    max?: number;
  };
}

/**
 * Command verification strategy
 * Runs a custom command
 */
export interface CommandVerificationStrategy extends BaseVerificationStrategy {
  type: "command";
  /** Command to run */
  command: string;
  /** Arguments to pass */
  args?: string[];
  /** Working directory */
  cwd?: string;
  /** Expected exit code - single number or array (default: 0) */
  expectedExitCode?: number | number[];
  /** Expected stdout pattern (regex) */
  expectedOutputPattern?: string;
  /** Expected stdout pattern (regex) - alias for expectedOutputPattern */
  stdoutPattern?: string;
  /** Expected stderr pattern (regex) */
  stderrPattern?: string;
  /** Patterns that must NOT match (negative assertions) */
  notPatterns?: string[];
}

/**
 * Manual verification strategy
 * Requires human review/approval
 */
export interface ManualVerificationStrategy extends BaseVerificationStrategy {
  type: "manual";
  /** Instructions for the reviewer */
  instructions?: string;
  /** Checklist items for manual verification */
  checklist?: string[];
  /** Reviewer role/team (e.g., "qa", "security", "product") */
  reviewer?: string;
  /** Assignee for the manual verification (alias for reviewer) */
  assignee?: string;
}

/**
 * AI verification strategy
 * Uses AI to verify acceptance criteria
 */
export interface AiVerificationStrategy extends BaseVerificationStrategy {
  type: "ai";
  /** Specific AI model to use (claude, codex, gemini) */
  model?: string;
  /** Custom prompt template */
  promptTemplate?: string;
  /** Minimum confidence threshold (0-1) */
  minConfidence?: number;
}

/**
 * Composite verification strategy
 * Combines multiple strategies with AND/OR logic
 */
export interface CompositeVerificationStrategy extends BaseVerificationStrategy {
  type: "composite";
  /** Logical operator for combining strategies */
  operator: "and" | "or";
  /** Nested strategies */
  strategies: VerificationStrategy[];
}

/**
 * Behavior verification strategy
 * Detects workflow violations in agent logs/transcripts
 */
export interface BehaviorVerificationStrategy extends BaseVerificationStrategy {
  type: "behavior";
  /** Source of logs to analyze */
  logSource?: "session" | "file" | "stdin";
  /** Path to log file (when logSource is "file") */
  logPath?: string;
  /** Minimum severity to report (default: "warning") */
  minSeverity?: "critical" | "warning" | "info";
  /** Categories of anti-patterns to check */
  categories?: Array<
    "workflow-bypass" | "file-reading" | "manual-edit" | "algorithm-local" | "status-guess"
  >;
  /** Whether to fail fast on first critical violation (default: true) */
  failFast?: boolean;
  /** Custom patterns to check (in addition to built-in) */
  customPatterns?: Array<{
    id: string;
    pattern: string;
    severity: "critical" | "warning" | "info";
    message: string;
  }>;
}

/**
 * Union type of all verification strategies
 * Use this type for strategy arrays in Feature
 */
export type VerificationStrategy =
  | TestVerificationStrategy
  | E2EVerificationStrategy
  | ScriptVerificationStrategy
  | HttpVerificationStrategy
  | FileVerificationStrategy
  | CommandVerificationStrategy
  | ManualVerificationStrategy
  | AiVerificationStrategy
  | CompositeVerificationStrategy
  | BehaviorVerificationStrategy;
