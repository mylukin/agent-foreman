/**
 * Type definitions for the AI-powered verification system
 * Supports comprehensive feature verification across various project types
 */

// Verification Capabilities
export type { VerificationCapabilities } from "./capabilities.js";

// Automated Check Results
export type { AutomatedCheckType, AutomatedCheckResult } from "./check-results.js";

// Criterion Results
export type { CriterionResult } from "./criterion.js";

// Verification Results
export type { VerificationVerdict, VerificationResult } from "./results.js";

// Verification Store (Legacy and New)
export type {
  VerificationStore,
  FeatureSummary,
  VerificationIndex,
  VerificationMetadata,
  FeatureVerificationSummary,
} from "./store.js";

// Verify Command Options
export type { TestMode, VerificationMode, E2ETestMode, VerifyOptions } from "./options.js";

// AI Response Types
export type { AIVerificationResponse } from "./ai-response.js";

// Extended Capability Detection Types
export type {
  CapabilitySource,
  CustomRuleType,
  CapabilityCommand,
  TestCapabilityInfo,
  E2ECapabilityInfo,
  CustomRule,
  ExtendedCapabilities,
  CapabilityCache,
} from "./extended-capabilities.js";

// Universal Verification Strategy Types (UVS)
export type {
  VerificationStrategyType,
  BaseVerificationStrategy,
  TestVerificationStrategy,
  E2EVerificationStrategy,
  ScriptVerificationStrategy,
  HttpVerificationStrategy,
  FileCheck,
  FileVerificationStrategy,
  CommandVerificationStrategy,
  ManualVerificationStrategy,
  AiVerificationStrategy,
  CompositeVerificationStrategy,
  BehaviorVerificationStrategy,
  VerificationStrategy,
} from "./strategies.js";
