/**
 * Verifier module - Core verification logic
 * Orchestrates automated checks and AI analysis for feature verification
 *
 * This module is split into focused submodules:
 * - git-operations: Git diff and commit hash operations
 * - check-executor: Run automated checks (tests, lint, typecheck, build)
 * - ai-analysis: AI analysis with retry logic
 * - autonomous: Autonomous verification mode
 * - tdd: TDD verification mode
 * - core: Main verification orchestration
 * - results: Result formatting utilities
 * - types: Shared types
 */

// Re-export types
export type {
  AutomatedCheckOptions,
  CheckDefinition,
  TDDVerifyOptions,
} from "./types.js";

// Re-export git operations
export { getGitDiffForFeature, getGitCommitHash } from "./git-operations.js";

// Re-export check executor
export {
  runCheck,
  runCheckWithEnv,
  runChecksInParallel,
  runAutomatedChecks,
} from "./check-executor.js";

// Re-export AI analysis
export {
  RETRY_CONFIG,
  isTransientError,
  calculateBackoff,
  readRelatedFiles,
  analyzeWithAI,
} from "./ai-analysis.js";

// Re-export autonomous verification
export {
  buildAutonomousVerificationPrompt,
  verifyFeatureAutonomous,
} from "./autonomous.js";

// Re-export TDD verification
export { verifyFeatureTDD } from "./tdd.js";

// Re-export core verification
export { determineVerificationMode, verifyFeature } from "./core.js";

// Re-export result utilities
export { createVerificationSummary, formatVerificationResult } from "./results.js";
