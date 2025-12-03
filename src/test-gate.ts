/**
 * Test Gate Module
 * Verifies required test files exist before allowing feature completion
 */

import { glob } from "glob";
import type { Feature } from "./types.js";

/**
 * Result of test file gate verification
 */
export interface TestGateResult {
  /** Whether the gate passed (all required tests exist) */
  passed: boolean;
  /** Missing unit test patterns that had no matching files */
  missingUnitTests: string[];
  /** Missing E2E test patterns that had no matching files */
  missingE2ETests: string[];
  /** Test files that were found */
  foundTestFiles: string[];
  /** Any errors encountered during verification */
  errors: string[];
}

/**
 * Verify that required test files exist for a feature
 *
 * @param cwd - Current working directory
 * @param feature - The feature to verify test files for
 * @returns Test gate result indicating pass/fail and details
 *
 * @example
 * const result = await verifyTestFilesExist(cwd, feature);
 * if (!result.passed) {
 *   console.log("Missing tests:", result.missingUnitTests);
 * }
 */
export async function verifyTestFilesExist(
  cwd: string,
  feature: Feature
): Promise<TestGateResult> {
  const result: TestGateResult = {
    passed: true,
    missingUnitTests: [],
    missingE2ETests: [],
    foundTestFiles: [],
    errors: [],
  };

  // If no testRequirements defined, gate passes automatically
  if (!feature.testRequirements) {
    return result;
  }

  // Check unit test requirements
  if (feature.testRequirements.unit?.required) {
    const pattern =
      feature.testRequirements.unit.pattern ||
      feature.testPattern ||
      `tests/${sanitizeModuleName(feature.module)}/**/*.test.*`;

    try {
      const files = await glob(pattern, { cwd, nodir: true });

      if (files.length === 0) {
        result.passed = false;
        result.missingUnitTests.push(pattern);
      } else {
        result.foundTestFiles.push(...files);
      }
    } catch (error) {
      result.errors.push(
        `Error checking unit test pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  // Check E2E test requirements
  if (feature.testRequirements.e2e?.required) {
    const pattern =
      feature.testRequirements.e2e.pattern ||
      `e2e/**/*${sanitizeModuleName(feature.module)}*.spec.*`;

    try {
      const files = await glob(pattern, { cwd, nodir: true });

      if (files.length === 0) {
        result.passed = false;
        result.missingE2ETests.push(pattern);
      } else {
        result.foundTestFiles.push(...files);
      }
    } catch (error) {
      result.errors.push(
        `Error checking E2E test pattern "${pattern}": ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return result;
}

/**
 * Discover all test files for a feature based on its configuration
 *
 * @param cwd - Current working directory
 * @param feature - The feature to discover test files for
 * @returns Array of discovered test file paths (deduplicated)
 */
export async function discoverFeatureTestFiles(
  cwd: string,
  feature: Feature
): Promise<string[]> {
  const patterns: string[] = [];

  // Collect all patterns from testRequirements
  if (feature.testRequirements?.unit?.pattern) {
    patterns.push(feature.testRequirements.unit.pattern);
  }
  if (feature.testRequirements?.e2e?.pattern) {
    patterns.push(feature.testRequirements.e2e.pattern);
  }

  // Also include legacy testPattern if defined
  if (feature.testPattern) {
    patterns.push(feature.testPattern);
  }

  // Fallback to module-based pattern if no patterns found
  if (patterns.length === 0) {
    const sanitizedModule = sanitizeModuleName(feature.module);
    patterns.push(`tests/${sanitizedModule}/**/*.test.*`);
  }

  // Discover files matching all patterns
  const allFiles = new Set<string>();

  for (const pattern of patterns) {
    try {
      const files = await glob(pattern, { cwd, nodir: true });
      files.forEach((f) => allFiles.add(f));
    } catch {
      // Ignore glob errors for discovery
    }
  }

  return Array.from(allFiles);
}

/**
 * Sanitize a module name to be filesystem-safe
 */
function sanitizeModuleName(module: string): string {
  return module
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
