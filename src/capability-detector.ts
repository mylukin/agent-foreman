/**
 * Detect project verification capabilities
 * Determines what automated checks can be run for a project
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { VerificationCapabilities } from "./verification-types.js";

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
  } catch {
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
  } catch {
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
  } catch {
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
  } catch {
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
