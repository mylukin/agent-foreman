/**
 * Test discovery and selective test execution
 * Finds related tests based on changed files and feature patterns
 */

import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Feature } from "./types.js";
import type { VerificationCapabilities } from "./verification-types.js";
import { fileExists } from "./file-utils.js";

const execAsync = promisify(exec);

// ============================================================================
// Test File Discovery
// ============================================================================

/**
 * Common test file patterns by framework
 */
const TEST_PATTERNS: Record<string, string[]> = {
  vitest: ["**/*.test.ts", "**/*.test.tsx", "**/*.spec.ts", "**/*.spec.tsx"],
  jest: ["**/*.test.js", "**/*.test.jsx", "**/*.test.ts", "**/*.test.tsx", "**/__tests__/**/*"],
  mocha: ["test/**/*.js", "test/**/*.ts", "**/*.test.js", "**/*.spec.js"],
  pytest: ["test_*.py", "*_test.py", "tests/**/*.py"],
  go: ["*_test.go"],
  cargo: ["**/tests/**/*.rs", "src/**/*_test.rs"],
};

/**
 * Map source file to potential test file paths
 * @param sourceFile - Source file path (e.g., "src/auth/login.ts")
 * @returns Array of potential test file paths
 */
export function mapSourceToTestFiles(sourceFile: string): string[] {
  const candidates: string[] = [];
  const ext = path.extname(sourceFile);
  const baseName = path.basename(sourceFile, ext);
  const dirName = path.dirname(sourceFile);

  // Common test file naming conventions
  // 1. Same directory: foo.ts -> foo.test.ts, foo.spec.ts
  candidates.push(path.join(dirName, `${baseName}.test${ext}`));
  candidates.push(path.join(dirName, `${baseName}.spec${ext}`));

  // 2. __tests__ subdirectory: src/auth/login.ts -> src/auth/__tests__/login.test.ts
  candidates.push(path.join(dirName, "__tests__", `${baseName}.test${ext}`));
  candidates.push(path.join(dirName, "__tests__", `${baseName}${ext}`));

  // 3. Parallel test directory: src/auth/login.ts -> tests/auth/login.test.ts
  const srcMatch = sourceFile.match(/^src\//);
  if (srcMatch) {
    const relativePath = sourceFile.replace(/^src\//, "");
    const testDir = path.dirname(relativePath);
    candidates.push(path.join("tests", testDir, `${baseName}.test${ext}`));
    candidates.push(path.join("test", testDir, `${baseName}.test${ext}`));
    candidates.push(path.join("__tests__", testDir, `${baseName}.test${ext}`));
  }

  // 4. Python conventions: src/auth/login.py -> tests/test_login.py
  if (ext === ".py") {
    candidates.push(path.join("tests", `test_${baseName}.py`));
    candidates.push(path.join("test", `test_${baseName}.py`));
  }

  // 5. Go conventions: auth/login.go -> auth/login_test.go
  if (ext === ".go") {
    candidates.push(path.join(dirName, `${baseName}_test.go`));
  }

  return candidates;
}

/**
 * Extract module name from file path for broader test matching
 * @param filePath - File path (e.g., "src/auth/login.ts")
 * @returns Module name (e.g., "auth")
 */
export function extractModuleFromPath(filePath: string): string | null {
  // Common patterns: src/module/..., lib/module/..., app/module/...
  const match = filePath.match(/^(?:src|lib|app|pkg)\/([^/]+)/);
  if (match) {
    return match[1];
  }

  // Direct module: module/...
  const parts = filePath.split("/");
  if (parts.length >= 2 && !parts[0].startsWith(".")) {
    return parts[0];
  }

  return null;
}

// ============================================================================
// Git-based Discovery
// ============================================================================

/**
 * Get changed files from git diff
 */
export async function getChangedFiles(cwd: string): Promise<string[]> {
  try {
    // Get both staged and unstaged changes
    const { stdout: stagedOutput } = await execAsync(
      "git diff --cached --name-only",
      { cwd }
    );
    const { stdout: unstagedOutput } = await execAsync(
      "git diff --name-only",
      { cwd }
    );

    // Also check last commit for recently committed changes
    const { stdout: lastCommitOutput } = await execAsync(
      "git diff HEAD~1 HEAD --name-only 2>/dev/null || echo ''",
      { cwd }
    );

    const allFiles = new Set<string>();

    for (const output of [stagedOutput, unstagedOutput, lastCommitOutput]) {
      output.trim().split("\n")
        .filter((f) => f.length > 0)
        .forEach((f) => allFiles.add(f));
    }

    return Array.from(allFiles);
  } catch (error) {
    return [];
  }
}

/**
 * Find existing test files that match the candidates
 */
export async function findExistingTestFiles(
  cwd: string,
  candidates: string[]
): Promise<string[]> {
  const existing: string[] = [];

  for (const candidate of candidates) {
    const fullPath = path.join(cwd, candidate);
    if (await fileExists(fullPath)) {
      existing.push(candidate);
    }
  }

  return existing;
}

// ============================================================================
// Test Pattern Generation
// ============================================================================

/**
 * Result of test discovery
 */
export interface TestDiscoveryResult {
  /** Discovered test pattern to use */
  pattern: string | null;
  /** How the pattern was discovered */
  source: "explicit" | "auto-detected" | "module-based" | "none";
  /** List of specific test files found */
  testFiles: string[];
  /** Confidence in the discovery (0-1) */
  confidence: number;
}

/**
 * Discover related tests for a feature based on changes
 *
 * Priority:
 * 1. Explicit testPattern from feature
 * 2. Auto-detect from changed files
 * 3. Module-based pattern from feature.module
 * 4. No pattern (run all tests)
 */
export async function discoverTestsForFeature(
  cwd: string,
  feature: Feature,
  changedFiles?: string[]
): Promise<TestDiscoveryResult> {
  // 1. Use explicit pattern if defined
  if (feature.testPattern) {
    return {
      pattern: feature.testPattern,
      source: "explicit",
      testFiles: [],
      confidence: 1.0,
    };
  }

  // 2. Get changed files if not provided
  const files = changedFiles || await getChangedFiles(cwd);

  if (files.length === 0) {
    return {
      pattern: null,
      source: "none",
      testFiles: [],
      confidence: 0,
    };
  }

  // 3. Find test files for changed source files
  const sourceFiles = files.filter(
    (f) =>
      !f.includes(".test.") &&
      !f.includes(".spec.") &&
      !f.includes("__tests__") &&
      !f.startsWith("test/") &&
      !f.startsWith("tests/")
  );

  const testCandidates: string[] = [];
  for (const source of sourceFiles) {
    testCandidates.push(...mapSourceToTestFiles(source));
  }

  // Also include directly changed test files
  const changedTestFiles = files.filter(
    (f) =>
      f.includes(".test.") ||
      f.includes(".spec.") ||
      f.includes("__tests__") ||
      f.startsWith("test/") ||
      f.startsWith("tests/")
  );

  const existingTestFiles = await findExistingTestFiles(cwd, [
    ...testCandidates,
    ...changedTestFiles,
  ]);

  if (existingTestFiles.length > 0) {
    // Build pattern from discovered test files
    // For most test runners, we can pass file paths directly
    return {
      pattern: existingTestFiles.join(" "),
      source: "auto-detected",
      testFiles: existingTestFiles,
      confidence: 0.9,
    };
  }

  // 4. Fall back to module-based pattern
  const modules = new Set<string>();
  for (const file of files) {
    const module = extractModuleFromPath(file);
    if (module) {
      modules.add(module);
    }
  }

  if (modules.size > 0) {
    // Use feature module or extracted modules
    const modulePattern = feature.module || Array.from(modules)[0];
    return {
      pattern: `**/${modulePattern}/**/*.test.*`,
      source: "module-based",
      testFiles: [],
      confidence: 0.6,
    };
  }

  return {
    pattern: null,
    source: "none",
    testFiles: [],
    confidence: 0,
  };
}

// ============================================================================
// Test Command Building
// ============================================================================

/**
 * Build a selective test command based on framework and pattern
 */
export function buildSelectiveTestCommand(
  capabilities: VerificationCapabilities,
  pattern: string | null,
  discovery: TestDiscoveryResult
): string | null {
  if (!capabilities.hasTests || !capabilities.testCommand) {
    return null;
  }

  // If no pattern, use full test command
  if (!pattern) {
    return capabilities.testCommand;
  }

  const baseCommand = capabilities.testCommand;
  const framework = capabilities.testFramework;

  // Build framework-specific selective test command
  switch (framework) {
    case "vitest":
      // vitest supports file paths directly or --testNamePattern
      if (discovery.testFiles.length > 0) {
        // Pass specific test files
        return `npx vitest run ${discovery.testFiles.join(" ")}`;
      }
      // Use pattern
      return `npx vitest run --testNamePattern "${pattern}"`;

    case "jest":
      // jest supports --testPathPattern for file matching
      if (discovery.testFiles.length > 0) {
        return `npx jest ${discovery.testFiles.join(" ")}`;
      }
      return `npx jest --testPathPattern "${pattern}"`;

    case "mocha":
      // mocha uses --grep for test name matching
      if (discovery.testFiles.length > 0) {
        return `npx mocha ${discovery.testFiles.join(" ")}`;
      }
      return `npx mocha --grep "${pattern}"`;

    case "pytest":
      // pytest supports -k for test name matching or direct paths
      if (discovery.testFiles.length > 0) {
        return `pytest ${discovery.testFiles.join(" ")}`;
      }
      return `pytest -k "${pattern}"`;

    case "go":
      // go test supports -run for test name matching
      return `go test -run "${pattern}" ./...`;

    case "cargo":
      // cargo test supports test name filter
      return `cargo test "${pattern}"`;

    default:
      // For unknown frameworks, try npm test with pattern if supported
      if (baseCommand === "npm test") {
        // Many npm test scripts pass additional args to the underlying framework
        return `npm test -- "${pattern}"`;
      }
      // Fall back to full test command
      return baseCommand;
  }
}

/**
 * Get a selective test command for a feature
 * Returns full test command if no selective pattern can be determined
 */
export async function getSelectiveTestCommand(
  cwd: string,
  feature: Feature,
  capabilities: VerificationCapabilities,
  changedFiles?: string[]
): Promise<{
  command: string | null;
  isSelective: boolean;
  discovery: TestDiscoveryResult;
}> {
  const discovery = await discoverTestsForFeature(cwd, feature, changedFiles);
  const command = buildSelectiveTestCommand(capabilities, discovery.pattern, discovery);

  return {
    command,
    isSelective: discovery.source !== "none" && discovery.pattern !== null,
    discovery,
  };
}
