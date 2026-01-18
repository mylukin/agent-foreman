/**
 * Behavior Verification Strategy
 * Re-exports the public API
 */

export { BehaviorStrategyExecutor } from "./executor.js";
export type {
  LogSource,
  LogCollectionResult,
  LogCollectionOptions,
  BehaviorVerificationResult,
  CustomBehaviorPattern,
} from "./types.js";
export { collectLogs, getDefaultLogPath, hasLogsAvailable } from "./log-collector.js";
export { formatBehaviorOutput, formatCompactSummary, formatViolationsJson } from "./output.js";

// Import for registration
import { BehaviorStrategyExecutor } from "./executor.js";
import { defaultRegistry } from "../../strategy-executor.js";

// Create and export singleton instance
export const behaviorStrategyExecutor = new BehaviorStrategyExecutor();

// Register with default registry
defaultRegistry.register(behaviorStrategyExecutor);
