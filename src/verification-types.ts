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
export type AutomatedCheckType = "test" | "typecheck" | "lint" | "build" | "e2e" | "init-script";

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
// Verification Store (Legacy - Single File)
// ============================================================================

/**
 * Verification store structure (ai/verification/results.json)
 * Stores all verification results indexed by feature ID
 * @deprecated Use VerificationIndex with per-feature subdirectories instead
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
// Verification Index (New - Per-Feature Subdirectories)
// ============================================================================

/**
 * Summary of a feature's verification history
 * Stored in index.json for quick lookups without loading full results
 */
export interface FeatureSummary {
  /** Feature ID */
  featureId: string;
  /** Latest run number (e.g., 3 points to 003.json) */
  latestRun: number;
  /** Timestamp of the latest verification (ISO 8601) */
  latestTimestamp: string;
  /** Verdict of the latest verification */
  latestVerdict: VerificationVerdict;
  /** Total number of verification runs */
  totalRuns: number;
  /** Count of passing verifications */
  passCount: number;
  /** Count of failing verifications */
  failCount: number;
}

/**
 * Verification index structure (ai/verification/index.json)
 * Summary index for quick lookups across all features
 */
export interface VerificationIndex {
  /** Map of feature ID to its verification summary */
  features: Record<string, FeatureSummary>;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
  /** Index schema version */
  version: string;
}

/**
 * Compact metadata for a single verification run
 * Stored in {featureId}/NNN.json - excludes verbose output and reasoning
 */
export interface VerificationMetadata {
  /** Feature ID that was verified */
  featureId: string;
  /** Sequential run number (1, 2, 3, ...) */
  runNumber: number;
  /** Verification timestamp (ISO 8601) */
  timestamp: string;
  /** Git commit hash at verification time */
  commitHash?: string;
  /** List of files that were changed */
  changedFiles: string[];
  /** Summary of the git diff */
  diffSummary: string;

  /** Results of automated checks (without verbose output) */
  automatedChecks: Array<{
    type: AutomatedCheckType;
    success: boolean;
    duration?: number;
    errorCount?: number;
    // Note: output field is excluded - stored in markdown
  }>;

  /** Per-criterion results (without verbose reasoning) */
  criteriaResults: Array<{
    criterion: string;
    index: number;
    satisfied: boolean;
    confidence: number;
    // Note: reasoning and evidence excluded - stored in markdown
  }>;

  /** Overall verification verdict */
  verdict: VerificationVerdict;
  /** AI agent used for verification */
  verifiedBy: string;
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
 * Test execution mode for verification
 */
export type TestMode = "full" | "quick" | "skip";

/**
 * Verification workflow mode
 * - "tdd": TDD mode - runs tests only, skips AI analysis
 * - "ai": AI mode - runs full AI-powered verification with code analysis
 */
export type VerificationMode = "tdd" | "ai";

/**
 * E2E test execution mode
 */
export type E2ETestMode = "full" | "smoke" | "tags" | "skip";

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
  /**
   * Test execution mode
   * - "full": Run all tests (default for final completion)
   * - "quick": Run only related tests based on changes
   * - "skip": Skip tests entirely
   */
  testMode?: TestMode;
  /** Explicit test pattern to use (overrides auto-detection) */
  testPattern?: string;
  /** Skip E2E tests entirely */
  skipE2E?: boolean;
  /** E2E test tags to run (from feature.e2eTags) */
  e2eTags?: string[];
  /**
   * E2E test execution mode (if not specified, derived from testMode)
   * - "full": Run all E2E tests (explicit --full flag)
   * - "smoke": Run only @smoke E2E tests (default when testMode is "full")
   * - "tags": Run E2E tests matching feature.e2eTags (quick mode with tags)
   * - "skip": Skip E2E tests entirely
   */
  e2eMode?: E2ETestMode;
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
 * Test-specific capability information
 * Extends CapabilityCommand with selective test execution patterns
 */
export interface TestCapabilityInfo extends CapabilityCommand {
  /**
   * Template for running specific test files
   * Use {files} placeholder for file paths
   * Example: "pnpm test {files}" or "pytest {files}"
   */
  selectiveFileTemplate?: string;

  /**
   * Template for running tests by name/pattern
   * Use {pattern} placeholder for the pattern
   * Example: "pnpm test --testNamePattern {pattern}"
   */
  selectiveNameTemplate?: string;

  /**
   * Package manager used (npm, pnpm, yarn, bun, etc.)
   * Helps determine the correct command prefix
   */
  packageManager?: string;
}

/**
 * E2E test-specific capability information
 * Supports Playwright and other E2E testing frameworks
 */
export interface E2ECapabilityInfo extends CapabilityCommand {
  /**
   * Base E2E test command
   * Example: "npx playwright test"
   */
  command?: string;

  /**
   * Template for running E2E tests filtered by tags
   * Use {tags} placeholder for tag pattern
   * Example: "npx playwright test --grep {tags}"
   */
  grepTemplate?: string;

  /**
   * Template for running specific E2E test files
   * Use {files} placeholder for file paths
   * Example: "npx playwright test {files}"
   */
  fileTemplate?: string;

  /**
   * E2E test framework name
   * Example: "playwright", "cypress", "puppeteer"
   */
  framework?: string;

  /**
   * Config file path (e.g., "playwright.config.ts")
   */
  configFile?: string;
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
  /** Optional: structured test info with selective execution templates */
  testInfo?: TestCapabilityInfo;
  /** Optional: E2E test info (Playwright, Cypress, etc.) */
  e2eInfo?: E2ECapabilityInfo;
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
