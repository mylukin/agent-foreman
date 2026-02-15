/**
 * Anti-Pattern Detection Module
 * Public API for detecting workflow violations
 */

// Re-export types
export type {
  AntiPatternSeverity,
  AntiPatternCategory,
  AntiPattern,
  AntiPatternMatch,
  DetectionResult,
  DetectionOptions,
} from "./types.js";

// Re-export registry
export {
  AntiPatternRegistry,
  defaultAntiPatternRegistry,
} from "./registry.js";

// Re-export detector
export {
  AntiPatternDetector,
  defaultDetector,
  detectAntiPatterns,
  hasAntiPatternViolations,
} from "./detector.js";

// Re-export built-in patterns
export {
  builtInPatterns,
  getBuiltInPatterns,
  getBuiltInPatternsByCategory,
  getBuiltInPatternIds,
} from "./patterns.js";

// Import for initialization
import { defaultAntiPatternRegistry } from "./registry.js";
import { builtInPatterns } from "./patterns.js";

// Flag to track if patterns have been initialized
let patternsInitialized = false;

/**
 * Initialize the default registry with built-in patterns
 * Called automatically on module load, but can be called explicitly
 *
 * @returns The default registry with built-in patterns registered
 */
export function initializeAntiPatterns(): typeof defaultAntiPatternRegistry {
  if (patternsInitialized) {
    return defaultAntiPatternRegistry;
  }

  // Register all built-in patterns
  defaultAntiPatternRegistry.registerAll(builtInPatterns);
  patternsInitialized = true;

  return defaultAntiPatternRegistry;
}

/**
 * Check if patterns have been initialized
 */
export function arePatternsInitialized(): boolean {
  return patternsInitialized;
}

/**
 * Reset initialization state (mainly for testing)
 */
export function resetAntiPatterns(): void {
  defaultAntiPatternRegistry.clear();
  patternsInitialized = false;
}

// Initialize on module load
initializeAntiPatterns();
