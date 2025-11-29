/**
 * Type definitions for the AI-powered verification system
 * Supports comprehensive feature verification across various project types
 */

// ============================================================================
// Verification Capabilities
// ============================================================================

/**
 * Project verification capabilities detected during init
 * Determines what automated checks can be run
 */
export interface VerificationCapabilities {
  /** Test framework available */
  hasTests: boolean;
  /** Test command to run (e.g., "npm test", "vitest run") */
  testCommand?: string;
  /** Detected test framework name (e.g., "vitest", "jest", "pytest") */
  testFramework?: string;

  /** Type checking available */
  hasTypeCheck: boolean;
  /** Type check command (e.g., "tsc --noEmit", "mypy") */
  typeCheckCommand?: string;

  /** Linting available */
  hasLint: boolean;
  /** Lint command (e.g., "eslint .", "ruff check") */
  lintCommand?: string;

  /** Build verification available */
  hasBuild: boolean;
  /** Build command (e.g., "npm run build", "go build") */
  buildCommand?: string;

  /** Git available for diff operations */
  hasGit: boolean;
}

// ============================================================================
// Automated Check Results
// ============================================================================

/**
 * Types of automated checks that can be run
 */
export type AutomatedCheckType = "test" | "typecheck" | "lint" | "build";

/**
 * Result of an automated check (test, lint, type check, or build)
 */
export interface AutomatedCheckResult {
  /** Type of check performed */
  type: AutomatedCheckType;
  /** Whether the check passed */
  success: boolean;
  /** Command output (stdout/stderr) */
  output?: string;
  /** Execution duration in milliseconds */
  duration?: number;
  /** Number of errors found (for lint/type checks) */
  errorCount?: number;
}

// ============================================================================
// Criterion Results
// ============================================================================

/**
 * Result of evaluating a single acceptance criterion
 */
export interface CriterionResult {
  /** The acceptance criterion text */
  criterion: string;
  /** Index in the acceptance criteria array (0-based) */
  index: number;
  /** Whether this criterion is satisfied */
  satisfied: boolean;
  /** AI's reasoning for the verdict */
  reasoning: string;
  /** Evidence from code/diff (file:line references) */
  evidence?: string[];
  /** Confidence level (0-1, where 1 is highest confidence) */
  confidence: number;
}

// ============================================================================
// Verification Results
// ============================================================================

/**
 * Possible verification verdicts
 */
export type VerificationVerdict = "pass" | "fail" | "needs_review";

/**
 * Complete verification result stored in ai/verification/results.json
 */
export interface VerificationResult {
  /** Feature ID that was verified */
  featureId: string;
  /** Verification timestamp (ISO 8601) */
  timestamp: string;
  /** Git commit hash at verification time */
  commitHash?: string;
  /** List of files that were changed */
  changedFiles: string[];
  /** Summary of the git diff */
  diffSummary: string;

  /** Results of automated checks */
  automatedChecks: AutomatedCheckResult[];

  /** Per-criterion evaluation results */
  criteriaResults: CriterionResult[];

  /** Overall verification verdict */
  verdict: VerificationVerdict;

  /** AI agent used for verification (e.g., "claude", "codex", "gemini") */
  verifiedBy: string;

  /** Overall reasoning for the verdict */
  overallReasoning: string;

  /** Suggestions for improvement */
  suggestions?: string[];

  /** Code quality notes */
  codeQualityNotes?: string[];

  /** List of related files analyzed for context */
  relatedFilesAnalyzed?: string[];
}

// ============================================================================
// Verification Store
// ============================================================================

/**
 * Verification store structure (ai/verification/results.json)
 * Stores all verification results indexed by feature ID
 */
export interface VerificationStore {
  /** Map of feature ID to latest verification result */
  results: Record<string, VerificationResult>;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  /** Store schema version */
  version: string;
}

// ============================================================================
// Feature Verification Summary
// ============================================================================

/**
 * Summary of verification result to embed in Feature
 * Stored in feature_list.json alongside each feature
 */
export interface FeatureVerificationSummary {
  /** Last verification timestamp (ISO 8601) */
  verifiedAt: string;
  /** Verification verdict */
  verdict: VerificationVerdict;
  /** Agent that performed verification */
  verifiedBy: string;
  /** Git commit hash at verification time */
  commitHash?: string;
  /** Brief summary of the verification result */
  summary: string;
}

// ============================================================================
// Verify Command Options
// ============================================================================

/**
 * Options for the verify CLI command
 */
export interface VerifyOptions {
  /** Show detailed AI reasoning */
  verbose?: boolean;
  /** Skip automated checks, AI analysis only */
  skipChecks?: boolean;
  /** Timeout for verification in milliseconds */
  timeout?: number;
}

// ============================================================================
// AI Response Types
// ============================================================================

/**
 * Expected structure of AI verification response
 * Used for parsing the JSON output from AI agents
 */
export interface AIVerificationResponse {
  /** Per-criterion results */
  criteriaResults: Array<{
    index: number;
    satisfied: boolean;
    reasoning: string;
    evidence?: string[];
    confidence: number;
  }>;
  /** Overall verdict */
  verdict: VerificationVerdict;
  /** Overall reasoning */
  overallReasoning: string;
  /** Improvement suggestions */
  suggestions?: string[];
  /** Code quality observations */
  codeQualityNotes?: string[];
}

// ============================================================================
// Extended Capability Detection Types
// ============================================================================

/**
 * Source of capability detection
 */
export type CapabilitySource = "preset" | "ai-discovered" | "cached";

/**
 * Type of custom rule
 */
export type CustomRuleType = "test" | "typecheck" | "lint" | "build" | "custom";

/**
 * Command configuration for a specific capability
 * Used in ExtendedCapabilities for test, typecheck, lint, build
 */
export interface CapabilityCommand {
  /** Whether this capability is available */
  available: boolean;
  /** Command to run (e.g., "npm test", "./gradlew test") */
  command?: string;
  /** Framework or tool name (e.g., "vitest", "junit", "pytest") */
  framework?: string;
  /** Detection confidence (0-1, where 1 is highest) */
  confidence: number;
}

/**
 * Custom verification rule discovered by AI
 * Extends standard capabilities with project-specific commands
 */
export interface CustomRule {
  /** Unique rule identifier (e.g., "spring-boot-integration") */
  id: string;
  /** Human-readable description */
  description: string;
  /** Command to execute */
  command: string;
  /** Type of rule */
  type: CustomRuleType;
  /** Optional: language this rule applies to */
  language?: string;
}

/**
 * Extended capabilities with metadata for dynamic language detection
 * Extends base VerificationCapabilities with AI discovery support
 */
export interface ExtendedCapabilities extends VerificationCapabilities {
  /** How these capabilities were detected */
  source: CapabilitySource;
  /** Overall detection confidence (0-1) */
  confidence: number;
  /** Detected programming languages (e.g., ["java", "kotlin"]) */
  languages: string[];
  /** When capabilities were detected (ISO 8601) */
  detectedAt: string;
  /** Optional: structured command info with per-capability confidence */
  testInfo?: CapabilityCommand;
  /** Optional: type check command info */
  typeCheckInfo?: CapabilityCommand;
  /** Optional: lint command info */
  lintInfo?: CapabilityCommand;
  /** Optional: build command info */
  buildInfo?: CapabilityCommand;
  /** Optional: custom project-specific rules */
  customRules?: CustomRule[];
}

/**
 * Capability cache structure stored in ai/capabilities.json
 * Persists detected capabilities across sessions
 */
export interface CapabilityCache {
  /** Cache schema version */
  version: string;
  /** Cached capabilities */
  capabilities: ExtendedCapabilities;
  /** Git commit hash when cache was created */
  commitHash?: string;
  /** List of build files used to detect staleness */
  trackedFiles?: string[];
}
