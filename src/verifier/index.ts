/**
 * Verifier module - Core verification logic
 * Orchestrates automated checks and AI analysis for feature verification
 *
 * This module has been split from a single 2,018-line file into focused submodules:
 * - git-operations.ts: Git diff and commit hash retrieval
 * - mode-selection.ts: Verification mode determination (TDD vs AI)
 * - check-executor.ts: Automated check execution (tests, typecheck, lint, build)
 * - related-files.ts: Related file reading for context
 * - ai-analysis.ts: AI analysis with retry logic
 * - autonomous.ts: Autonomous AI verification mode
 * - tdd.ts: TDD verification mode
 * - report.ts: Result formatting and reporting
 * - strategy-conversion.ts: UVS strategy conversion utilities
 * - strategy-execution.ts: UVS strategy execution
 * - core.ts: Main verification orchestration
 */

// Re-export types from local types file
export type {
  AutomatedCheckOptions,
  CheckDefinition,
  TDDVerifyOptions,
  StrategyExecutionResult,
} from "./types.js";

// Git Operations
export { getGitDiffForFeature, getGitCommitHash } from "./git-operations.js";

// Mode Selection
export { determineVerificationMode } from "./mode-selection.js";

// Check Executor
export {
  runCheck,
  runCheckWithEnv,
  runChecksInParallel,
  runAutomatedChecks,
} from "./check-executor.js";

// Related Files
export { readRelatedFiles } from "./related-files.js";

// AI Analysis
export {
  RETRY_CONFIG,
  isTransientError,
  calculateBackoff,
  analyzeWithAI,
} from "./ai-analysis.js";

// Autonomous Verification
export {
  buildAutonomousVerificationPrompt,
  parseAutonomousVerificationResponse,
  verifyFeatureAutonomous,
} from "./autonomous.js";

// TDD Verification
export { verifyFeatureTDD } from "./tdd.js";

// Report
export { createVerificationSummary, formatVerificationResult } from "./report.js";

// Strategy Conversion (UVS)
export {
  convertTestRequirementsToStrategies,
  getDefaultStrategiesForTaskType,
  getVerificationStrategies,
  shouldUseStrategyVerification,
} from "./strategy-conversion.js";

// Strategy Execution (UVS Phase 4)
export {
  executeVerificationStrategies,
  verifyWithStrategies,
} from "./strategy-execution.js";

// Core - Main verification function
export { verifyFeature } from "./core.js";

// Spec Compliance (Two-Stage Review - Layer 2.5)
export {
  checkSpecCompliance,
  displaySpecComplianceResult,
  runSpecComplianceChecks,
  type SpecComplianceResult,
  type CriterionComplianceResult,
  type OverEngineeringResult,
} from "./spec-compliance.js";
