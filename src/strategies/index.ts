/**
 * Strategy Executor Registry Index
 * Entry point for the Universal Verification Strategy (UVS) subsystem
 * Phase 3 of UVS RFC implementation
 *
 * This module:
 * - Imports and auto-registers all strategy executors
 * - Exports the registry and all executor types
 * - Provides convenience functions for strategy execution
 */

import type { Feature } from "../types/index.js";
import type { VerificationStrategy } from "../verifier/types/index.js";
import { defaultRegistry, StrategyRegistry, type StrategyResult, type StrategyExecutor } from "../strategy-executor.js";

// Import all strategy executors (importing causes auto-registration via side effects)
import { TestStrategyExecutor, testStrategyExecutor } from "./test-strategy.js";
import { E2EStrategyExecutor, e2eStrategyExecutor } from "./e2e-strategy.js";
import { ScriptStrategyExecutor, scriptStrategyExecutor } from "./script-strategy.js";
import { HttpStrategyExecutor, httpStrategyExecutor } from "./http-strategy.js";
import { FileStrategyExecutor, fileStrategyExecutor } from "./file-strategy.js";
import { CommandStrategyExecutor, commandStrategyExecutor } from "./command-strategy.js";
import { ManualStrategyExecutor, manualStrategyExecutor } from "./manual-strategy.js";
import { AIStrategyExecutor, aiStrategyExecutor } from "./ai-strategy.js";
import { CompositeStrategyExecutor, compositeStrategyExecutor } from "./composite-strategy.js";
import { BehaviorStrategyExecutor, behaviorStrategyExecutor } from "./behavior-strategy.js";

// Flag to track if strategies have been initialized
let strategiesInitialized = false;

/**
 * Initialize all strategy executors
 * This is called automatically on module load, but can be called
 * explicitly for lazy initialization scenarios
 *
 * @returns The default registry with all executors registered
 */
export function initializeStrategies(): StrategyRegistry {
  if (strategiesInitialized) {
    return defaultRegistry;
  }

  // Ensure all executors are registered
  // Note: Each executor module auto-registers on import via side effects
  // This function exists for explicit initialization and verification
  const expectedTypes = [
    "test",
    "e2e",
    "script",
    "http",
    "file",
    "command",
    "manual",
    "ai",
    "composite",
    "behavior",
  ];

  for (const type of expectedTypes) {
    if (!defaultRegistry.has(type as any)) {
      console.warn(`Strategy executor for type '${type}' not registered`);
    }
  }

  strategiesInitialized = true;
  return defaultRegistry;
}

/**
 * Execute a verification strategy using the default registry
 *
 * @param cwd - Current working directory
 * @param strategy - The strategy configuration to execute
 * @param feature - The feature being verified
 * @returns Promise resolving to the strategy execution result
 * @throws Error if no executor is registered for the strategy type
 */
export async function executeStrategy(
  cwd: string,
  strategy: VerificationStrategy,
  feature: Feature
): Promise<StrategyResult> {
  return defaultRegistry.execute(cwd, strategy, feature);
}

/**
 * Get all registered strategy types
 *
 * @returns Array of registered strategy type names
 */
export function getRegisteredStrategyTypes(): string[] {
  return defaultRegistry.getRegisteredTypes();
}

/**
 * Check if a strategy type is registered
 *
 * @param type - The strategy type to check
 * @returns True if the strategy type has a registered executor
 */
export function hasStrategy(type: string): boolean {
  return defaultRegistry.has(type as any);
}

// Initialize on module load
initializeStrategies();

// Re-export from strategy-executor for convenience
export { defaultRegistry, StrategyRegistry, type StrategyResult, type StrategyExecutor };

// Export all executor classes
export {
  TestStrategyExecutor,
  E2EStrategyExecutor,
  ScriptStrategyExecutor,
  HttpStrategyExecutor,
  FileStrategyExecutor,
  CommandStrategyExecutor,
  ManualStrategyExecutor,
  AIStrategyExecutor,
  CompositeStrategyExecutor,
  BehaviorStrategyExecutor,
};

// Export all singleton executor instances
export {
  testStrategyExecutor,
  e2eStrategyExecutor,
  scriptStrategyExecutor,
  httpStrategyExecutor,
  fileStrategyExecutor,
  commandStrategyExecutor,
  manualStrategyExecutor,
  aiStrategyExecutor,
  compositeStrategyExecutor,
  behaviorStrategyExecutor,
};

// Export extended strategy types
export type { ExtendedAiVerificationStrategy, AIAgentInterface } from "./ai-strategy.js";
export type { ExtendedCompositeVerificationStrategy, NestedStrategyResult } from "./composite-strategy.js";
export type { UserInputInterface } from "./manual-strategy.js";
export type {
  LogSource,
  LogCollectionResult,
  LogCollectionOptions,
  BehaviorVerificationResult,
  CustomBehaviorPattern,
} from "./behavior-strategy.js";
