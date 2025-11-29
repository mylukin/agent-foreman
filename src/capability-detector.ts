/**
 * Detect project verification capabilities
 * Determines what automated checks can be run for a project
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type {
  VerificationCapabilities,
  ExtendedCapabilities,
  CapabilityCommand,
} from "./verification-types.js";

import {
  loadCachedCapabilities,
  saveCapabilities,
  isStale,
} from "./capability-cache.js";

import { discoverCapabilitiesWithAI } from "./ai-capability-discovery.js";
import { debugDetector } from "./debug.js";

const execAsync = promisify(exec);

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if a file exists
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch (error) {
    debugDetector("File check failed for %s: %s", filePath, (error as Error).message);
    return false;
  }
}

/**
 * Check if a command is available in PATH
 */
async function commandExists(command: string): Promise<boolean> {
  try {
    const checkCmd =
      process.platform === "win32" ? `where ${command}` : `which ${command}`;
    await execAsync(checkCmd);
    return true;
  } catch (error) {
    debugDetector("Command check failed for %s: %s", command, (error as Error).message);
    return false;
  }
}

/**
 * Read and parse package.json if it exists
 */
async function readPackageJson(
  cwd: string
): Promise<Record<string, unknown> | null> {
  const pkgPath = path.join(cwd, "package.json");
  try {
    const content = await fs.readFile(pkgPath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    debugDetector("Failed to read package.json: %s", (error as Error).message);
    return null;
  }
}

// ============================================================================
// Test Framework Detection
// ============================================================================

interface TestFrameworkResult {
  hasTests: boolean;
  testCommand?: string;
  testFramework?: string;
}

/**
 * Detect test framework from package.json or config files
 */
async function detectTestFramework(cwd: string): Promise<TestFrameworkResult> {
  const pkg = await readPackageJson(cwd);

  // Node.js projects - check package.json scripts
  if (pkg) {
    const scripts = (pkg.scripts || {}) as Record<string, string>;
    const devDeps = (pkg.devDependencies || {}) as Record<string, string>;
    const deps = (pkg.dependencies || {}) as Record<string, string>;

    // Check for common test frameworks
    if (devDeps.vitest || deps.vitest || scripts.test?.includes("vitest")) {
      return {
        hasTests: true,
        testCommand: scripts.test || "npx vitest run",
        testFramework: "vitest",
      };
    }

    if (devDeps.jest || deps.jest || scripts.test?.includes("jest")) {
      return {
        hasTests: true,
        testCommand: scripts.test || "npx jest",
        testFramework: "jest",
      };
    }

    if (devDeps.mocha || deps.mocha || scripts.test?.includes("mocha")) {
      return {
        hasTests: true,
        testCommand: scripts.test || "npx mocha",
        testFramework: "mocha",
      };
    }

    // Generic npm test
    if (scripts.test && !scripts.test.includes("no test specified")) {
      return {
        hasTests: true,
        testCommand: "npm test",
        testFramework: "npm",
      };
    }
  }

  // Python projects
  if (await fileExists(path.join(cwd, "pytest.ini"))) {
    return { hasTests: true, testCommand: "pytest", testFramework: "pytest" };
  }
  if (await fileExists(path.join(cwd, "pyproject.toml"))) {
    const content = await fs.readFile(path.join(cwd, "pyproject.toml"), "utf-8");
    if (content.includes("[tool.pytest")) {
      return { hasTests: true, testCommand: "pytest", testFramework: "pytest" };
    }
  }
  if (await fileExists(path.join(cwd, "setup.py"))) {
    return {
      hasTests: true,
      testCommand: "python -m pytest",
      testFramework: "pytest",
    };
  }

  // Go projects
  if (await fileExists(path.join(cwd, "go.mod"))) {
    return { hasTests: true, testCommand: "go test ./...", testFramework: "go" };
  }

  // Rust projects
  if (await fileExists(path.join(cwd, "Cargo.toml"))) {
    return {
      hasTests: true,
      testCommand: "cargo test",
      testFramework: "cargo",
    };
  }

  return { hasTests: false };
}

// ============================================================================
// Type Checker Detection
// ============================================================================

interface TypeCheckResult {
  hasTypeCheck: boolean;
  typeCheckCommand?: string;
}

/**
 * Detect TypeScript or other type checkers
 */
async function detectTypeChecker(cwd: string): Promise<TypeCheckResult> {
  // TypeScript
  if (await fileExists(path.join(cwd, "tsconfig.json"))) {
    const pkg = await readPackageJson(cwd);
    const scripts = ((pkg?.scripts || {}) as Record<string, string>);

    // Check for typecheck script
    if (scripts.typecheck) {
      return { hasTypeCheck: true, typeCheckCommand: "npm run typecheck" };
    }

    return { hasTypeCheck: true, typeCheckCommand: "npx tsc --noEmit" };
  }

  // Python mypy
  if (await fileExists(path.join(cwd, "mypy.ini"))) {
    return { hasTypeCheck: true, typeCheckCommand: "mypy ." };
  }
  if (await fileExists(path.join(cwd, "pyproject.toml"))) {
    const content = await fs.readFile(path.join(cwd, "pyproject.toml"), "utf-8");
    if (content.includes("[tool.mypy]")) {
      return { hasTypeCheck: true, typeCheckCommand: "mypy ." };
    }
  }

  return { hasTypeCheck: false };
}

// ============================================================================
// Linter Detection
// ============================================================================

interface LintResult {
  hasLint: boolean;
  lintCommand?: string;
}

/**
 * Detect linting tools
 */
async function detectLinter(cwd: string): Promise<LintResult> {
  const pkg = await readPackageJson(cwd);

  // Node.js projects
  if (pkg) {
    const scripts = (pkg.scripts || {}) as Record<string, string>;
    const devDeps = (pkg.devDependencies || {}) as Record<string, string>;

    // Check for lint script
    if (scripts.lint) {
      return { hasLint: true, lintCommand: "npm run lint" };
    }

    // ESLint
    if (
      devDeps.eslint ||
      (await fileExists(path.join(cwd, ".eslintrc.js"))) ||
      (await fileExists(path.join(cwd, ".eslintrc.json"))) ||
      (await fileExists(path.join(cwd, "eslint.config.js"))) ||
      (await fileExists(path.join(cwd, "eslint.config.mjs")))
    ) {
      return { hasLint: true, lintCommand: "npx eslint ." };
    }

    // Biome
    if (
      devDeps["@biomejs/biome"] ||
      (await fileExists(path.join(cwd, "biome.json")))
    ) {
      return { hasLint: true, lintCommand: "npx biome lint ." };
    }
  }

  // Python
  if (await fileExists(path.join(cwd, "ruff.toml"))) {
    return { hasLint: true, lintCommand: "ruff check ." };
  }
  if (await fileExists(path.join(cwd, "pyproject.toml"))) {
    const content = await fs.readFile(path.join(cwd, "pyproject.toml"), "utf-8");
    if (content.includes("[tool.ruff]")) {
      return { hasLint: true, lintCommand: "ruff check ." };
    }
    if (content.includes("[tool.flake8]")) {
      return { hasLint: true, lintCommand: "flake8 ." };
    }
  }
  if (await fileExists(path.join(cwd, ".flake8"))) {
    return { hasLint: true, lintCommand: "flake8 ." };
  }

  // Go
  if (await fileExists(path.join(cwd, "go.mod"))) {
    if (await commandExists("golangci-lint")) {
      return { hasLint: true, lintCommand: "golangci-lint run" };
    }
  }

  // Rust
  if (await fileExists(path.join(cwd, "Cargo.toml"))) {
    return { hasLint: true, lintCommand: "cargo clippy" };
  }

  return { hasLint: false };
}

// ============================================================================
// Build System Detection
// ============================================================================

interface BuildResult {
  hasBuild: boolean;
  buildCommand?: string;
}

/**
 * Detect build system
 */
async function detectBuildSystem(cwd: string): Promise<BuildResult> {
  const pkg = await readPackageJson(cwd);

  // Node.js projects
  if (pkg) {
    const scripts = (pkg.scripts || {}) as Record<string, string>;

    if (scripts.build) {
      return { hasBuild: true, buildCommand: "npm run build" };
    }

    // TypeScript without build script
    if (await fileExists(path.join(cwd, "tsconfig.json"))) {
      return { hasBuild: true, buildCommand: "npx tsc" };
    }
  }

  // Go
  if (await fileExists(path.join(cwd, "go.mod"))) {
    return { hasBuild: true, buildCommand: "go build ./..." };
  }

  // Rust
  if (await fileExists(path.join(cwd, "Cargo.toml"))) {
    return { hasBuild: true, buildCommand: "cargo build" };
  }

  // Python (usually no build step, but check for setup.py)
  if (await fileExists(path.join(cwd, "setup.py"))) {
    return { hasBuild: true, buildCommand: "python setup.py build" };
  }

  return { hasBuild: false };
}

// ============================================================================
// Git Detection
// ============================================================================

/**
 * Check if git is available and this is a git repository
 */
async function detectGit(cwd: string): Promise<boolean> {
  // Check if git command exists
  if (!(await commandExists("git"))) {
    return false;
  }

  // Check if this is a git repository
  try {
    await execAsync("git rev-parse --git-dir", { cwd });
    return true;
  } catch (error) {
    debugDetector("Git repository check failed: %s", (error as Error).message);
    return false;
  }
}

// ============================================================================
// Main Detection Function
// ============================================================================

/**
 * Detect all verification capabilities for a project
 */
export async function detectVerificationCapabilities(
  cwd: string
): Promise<VerificationCapabilities> {
  const [testResult, typeCheckResult, lintResult, buildResult, hasGit] =
    await Promise.all([
      detectTestFramework(cwd),
      detectTypeChecker(cwd),
      detectLinter(cwd),
      detectBuildSystem(cwd),
      detectGit(cwd),
    ]);

  return {
    hasTests: testResult.hasTests,
    testCommand: testResult.testCommand,
    testFramework: testResult.testFramework,
    hasTypeCheck: typeCheckResult.hasTypeCheck,
    typeCheckCommand: typeCheckResult.typeCheckCommand,
    hasLint: lintResult.hasLint,
    lintCommand: lintResult.lintCommand,
    hasBuild: buildResult.hasBuild,
    buildCommand: buildResult.buildCommand,
    hasGit,
  };
}

/**
 * Get a human-readable summary of capabilities
 */
export function formatCapabilities(caps: VerificationCapabilities): string {
  const lines: string[] = [];

  if (caps.hasTests) {
    lines.push(`  Tests: ${caps.testFramework} (${caps.testCommand})`);
  } else {
    lines.push("  Tests: Not detected");
  }

  if (caps.hasTypeCheck) {
    lines.push(`  Type Check: ${caps.typeCheckCommand}`);
  } else {
    lines.push("  Type Check: Not detected");
  }

  if (caps.hasLint) {
    lines.push(`  Lint: ${caps.lintCommand}`);
  } else {
    lines.push("  Lint: Not detected");
  }

  if (caps.hasBuild) {
    lines.push(`  Build: ${caps.buildCommand}`);
  } else {
    lines.push("  Build: Not detected");
  }

  lines.push(`  Git: ${caps.hasGit ? "Available" : "Not available"}`);

  return lines.join("\n");
}

// ============================================================================
// Extended Capability Detection with Confidence
// ============================================================================

/**
 * Known language patterns for preset detection
 */
type KnownLanguage = "nodejs" | "python" | "go" | "rust";

/**
 * Detect primary programming language(s) from project files
 */
async function detectLanguages(cwd: string): Promise<string[]> {
  const languages: string[] = [];

  // Node.js / JavaScript / TypeScript
  if (await fileExists(path.join(cwd, "package.json"))) {
    const pkg = await readPackageJson(cwd);
    if (pkg) {
      // Check if TypeScript project
      if (await fileExists(path.join(cwd, "tsconfig.json"))) {
        languages.push("typescript");
      }
      languages.push("nodejs");
    }
  }

  // Python
  if (
    (await fileExists(path.join(cwd, "pyproject.toml"))) ||
    (await fileExists(path.join(cwd, "setup.py"))) ||
    (await fileExists(path.join(cwd, "requirements.txt"))) ||
    (await fileExists(path.join(cwd, "Pipfile")))
  ) {
    languages.push("python");
  }

  // Go
  if (await fileExists(path.join(cwd, "go.mod"))) {
    languages.push("go");
  }

  // Rust
  if (await fileExists(path.join(cwd, "Cargo.toml"))) {
    languages.push("rust");
  }

  return languages;
}

/**
 * Calculate confidence score based on detected capabilities
 * Higher confidence when more capabilities are detected
 */
function calculateConfidence(
  languages: string[],
  caps: VerificationCapabilities
): number {
  // No languages detected = no confidence
  if (languages.length === 0) {
    return 0.0;
  }

  // Base confidence for recognized language
  let confidence = 0.7;

  // Add confidence for each detected capability
  if (caps.hasTests) confidence += 0.075;
  if (caps.hasTypeCheck) confidence += 0.05;
  if (caps.hasLint) confidence += 0.05;
  if (caps.hasBuild) confidence += 0.075;
  if (caps.hasGit) confidence += 0.05;

  // Cap at 1.0
  return Math.min(confidence, 1.0);
}

/**
 * Create CapabilityCommand from detection results
 */
function createCapabilityCommand(
  available: boolean,
  command?: string,
  framework?: string,
  confidence: number = 0.9
): CapabilityCommand {
  return {
    available,
    command,
    framework,
    confidence: available ? confidence : 0,
  };
}

/**
 * Detect project capabilities using preset rules for known languages
 * Returns ExtendedCapabilities with confidence scoring
 *
 * This wraps the existing detection logic and adds:
 * - Language detection
 * - Confidence scoring
 * - Structured command info
 *
 * @param cwd - Project root directory
 * @returns ExtendedCapabilities with source='preset' or low confidence for unknown projects
 */
export async function detectWithPresets(
  cwd: string
): Promise<ExtendedCapabilities> {
  // Detect languages first
  const languages = await detectLanguages(cwd);

  // Run existing detection in parallel
  const [testResult, typeCheckResult, lintResult, buildResult, hasGit] =
    await Promise.all([
      detectTestFramework(cwd),
      detectTypeChecker(cwd),
      detectLinter(cwd),
      detectBuildSystem(cwd),
      detectGit(cwd),
    ]);

  // Build base capabilities (backward compatible)
  const baseCaps: VerificationCapabilities = {
    hasTests: testResult.hasTests,
    testCommand: testResult.testCommand,
    testFramework: testResult.testFramework,
    hasTypeCheck: typeCheckResult.hasTypeCheck,
    typeCheckCommand: typeCheckResult.typeCheckCommand,
    hasLint: lintResult.hasLint,
    lintCommand: lintResult.lintCommand,
    hasBuild: buildResult.hasBuild,
    buildCommand: buildResult.buildCommand,
    hasGit,
  };

  // Calculate confidence
  const confidence = calculateConfidence(languages, baseCaps);

  // Build extended capabilities
  const extended: ExtendedCapabilities = {
    ...baseCaps,
    source: "preset",
    confidence,
    languages,
    detectedAt: new Date().toISOString(),
    testInfo: createCapabilityCommand(
      testResult.hasTests,
      testResult.testCommand,
      testResult.testFramework,
      0.95
    ),
    typeCheckInfo: createCapabilityCommand(
      typeCheckResult.hasTypeCheck,
      typeCheckResult.typeCheckCommand,
      undefined,
      0.9
    ),
    lintInfo: createCapabilityCommand(
      lintResult.hasLint,
      lintResult.lintCommand,
      undefined,
      0.9
    ),
    buildInfo: createCapabilityCommand(
      buildResult.hasBuild,
      buildResult.buildCommand,
      undefined,
      0.9
    ),
  };

  return extended;
}

/**
 * Format extended capabilities for display
 */
export function formatExtendedCapabilities(caps: ExtendedCapabilities): string {
  const lines: string[] = [];

  lines.push(`  Source: ${caps.source}`);
  lines.push(`  Confidence: ${(caps.confidence * 100).toFixed(0)}%`);
  lines.push(`  Languages: ${caps.languages.join(", ") || "Unknown"}`);
  lines.push("");

  if (caps.testInfo?.available) {
    lines.push(`  Tests: ${caps.testInfo.framework || "custom"} (${caps.testInfo.command})`);
  } else {
    lines.push("  Tests: Not detected");
  }

  if (caps.typeCheckInfo?.available) {
    lines.push(`  Type Check: ${caps.typeCheckInfo.command}`);
  } else {
    lines.push("  Type Check: Not detected");
  }

  if (caps.lintInfo?.available) {
    lines.push(`  Lint: ${caps.lintInfo.command}`);
  } else {
    lines.push("  Lint: Not detected");
  }

  if (caps.buildInfo?.available) {
    lines.push(`  Build: ${caps.buildInfo.command}`);
  } else {
    lines.push("  Build: Not detected");
  }

  lines.push(`  Git: ${caps.hasGit ? "Available" : "Not available"}`);

  return lines.join("\n");
}

// ============================================================================
// Three-Tier Detection System
// ============================================================================

/** Confidence threshold for using preset detection */
const PRESET_CONFIDENCE_THRESHOLD = 0.8;

/**
 * Detect project capabilities using three-tier system:
 * 1. Cache - Return cached capabilities if valid and not stale
 * 2. Preset - Use hardcoded detection for known languages (Node, Python, Go, Rust)
 * 3. AI Discovery - Fall back to AI for unknown project types
 *
 * @param cwd - Project root directory
 * @param options - Detection options
 * @returns ExtendedCapabilities with detection source and confidence
 */
export async function detectCapabilities(
  cwd: string,
  options: {
    /** Force re-detection even if cache exists */
    force?: boolean;
    /** Force AI-based detection (skip presets) */
    forceAI?: boolean;
    /** Show verbose output */
    verbose?: boolean;
  } = {}
): Promise<ExtendedCapabilities> {
  const { force = false, forceAI = false, verbose = false } = options;

  // 1. Try loading from cache (unless forced refresh)
  if (!force && !forceAI) {
    const cached = await loadCachedCapabilities(cwd);
    if (cached) {
      // Check if cache is stale
      const stale = await isStale(cwd);
      if (!stale) {
        if (verbose) {
          console.log("  Using cached capabilities");
        }
        return cached;
      }
      if (verbose) {
        console.log("  Cache is stale, re-detecting...");
      }
    }
  }

  // 2. Try preset detection for known languages (unless AI forced)
  if (!forceAI) {
    const preset = await detectWithPresets(cwd);

    // If preset detection has high confidence, use it
    if (preset.confidence >= PRESET_CONFIDENCE_THRESHOLD) {
      if (verbose) {
        console.log(`  Preset detection: ${preset.languages.join(", ")} (${(preset.confidence * 100).toFixed(0)}% confidence)`);
      }
      // Save to cache for future use
      await saveCapabilities(cwd, preset);
      return preset;
    }

    // If preset found some languages but low confidence, log it
    if (preset.languages.length > 0 && verbose) {
      console.log(`  Preset detection confidence too low (${(preset.confidence * 100).toFixed(0)}%), falling back to AI...`);
    }
  }

  // 3. Fall back to AI discovery for unknown project types
  if (verbose) {
    console.log("  Using AI-based capability discovery...");
  }

  const aiDiscovered = await discoverCapabilitiesWithAI(cwd);

  // Save to cache (even if AI discovery didn't find much)
  await saveCapabilities(cwd, aiDiscovered);

  return aiDiscovered;
}

/**
 * Re-export cache functions for external use
 */
export { loadCachedCapabilities, saveCapabilities, isStale } from "./capability-cache.js";

/**
 * Re-export AI discovery for external use
 */
export { discoverCapabilitiesWithAI } from "./ai-capability-discovery.js";
