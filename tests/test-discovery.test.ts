/**
 * Tests for test-discovery.ts
 * Covers selective test execution and test file discovery
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import {
  mapSourceToTestFiles,
  extractModuleFromPath,
  getChangedFiles,
  findExistingTestFiles,
  discoverTestsForFeature,
  buildSelectiveTestCommand,
  getSelectiveTestCommand,
  type TestDiscoveryResult,
} from "../src/test-discovery.js";
import type { Feature } from "../src/types.js";
import type { VerificationCapabilities } from "../src/verification-types.js";

// Mock child_process exec
vi.mock("node:child_process", () => ({
  exec: vi.fn(),
}));

// Mock file-utils
vi.mock("../src/file-utils.js", () => ({
  fileExists: vi.fn(),
}));

import { exec } from "node:child_process";
import { fileExists } from "../src/file-utils.js";

const mockedExec = vi.mocked(exec);
const mockedFileExists = vi.mocked(fileExists);

// Helper to create a mock feature
function createMockFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: "test.feature",
    description: "Test feature",
    module: "test",
    priority: 1,
    status: "failing",
    acceptance: ["Test acceptance"],
    dependsOn: [],
    supersedes: [],
    tags: [],
    version: 1,
    origin: "manual",
    notes: "",
    ...overrides,
  };
}

// Helper to create mock capabilities
function createMockCapabilities(overrides: Partial<VerificationCapabilities> = {}): VerificationCapabilities {
  return {
    hasTests: true,
    testCommand: "npm test",
    testFramework: "vitest",
    hasTypeCheck: false,
    hasLint: false,
    hasBuild: false,
    ...overrides,
  };
}

describe("Test Discovery", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ==========================================================================
  // mapSourceToTestFiles
  // ==========================================================================
  describe("mapSourceToTestFiles", () => {
    it("should generate .test.ts and .spec.ts candidates in same directory", () => {
      const result = mapSourceToTestFiles("src/auth/login.ts");

      expect(result).toContain("src/auth/login.test.ts");
      expect(result).toContain("src/auth/login.spec.ts");
    });

    it("should generate __tests__ subdirectory candidates", () => {
      const result = mapSourceToTestFiles("src/auth/login.ts");

      expect(result).toContain("src/auth/__tests__/login.test.ts");
      expect(result).toContain("src/auth/__tests__/login.ts");
    });

    it("should generate parallel test directory candidates for src/ files", () => {
      const result = mapSourceToTestFiles("src/auth/login.ts");

      expect(result).toContain("tests/auth/login.test.ts");
      expect(result).toContain("test/auth/login.test.ts");
      expect(result).toContain("__tests__/auth/login.test.ts");
    });

    it("should NOT generate parallel test directory for non-src files", () => {
      const result = mapSourceToTestFiles("lib/auth/login.ts");

      expect(result).not.toContain("tests/auth/login.test.ts");
    });

    it("should handle Python files with test_ prefix convention", () => {
      const result = mapSourceToTestFiles("src/auth/login.py");

      expect(result).toContain("tests/test_login.py");
      expect(result).toContain("test/test_login.py");
    });

    it("should handle Go files with _test.go suffix convention", () => {
      const result = mapSourceToTestFiles("auth/login.go");

      expect(result).toContain("auth/login_test.go");
    });

    it("should handle JavaScript files", () => {
      const result = mapSourceToTestFiles("src/utils/helper.js");

      expect(result).toContain("src/utils/helper.test.js");
      expect(result).toContain("src/utils/helper.spec.js");
    });

    it("should handle JSX/TSX files", () => {
      const result = mapSourceToTestFiles("src/components/Button.tsx");

      expect(result).toContain("src/components/Button.test.tsx");
      expect(result).toContain("src/components/Button.spec.tsx");
    });

    it("should handle root-level source files", () => {
      const result = mapSourceToTestFiles("index.ts");

      expect(result).toContain("index.test.ts");
      expect(result).toContain("index.spec.ts");
    });

    it("should handle deeply nested paths", () => {
      const result = mapSourceToTestFiles("src/features/auth/providers/oauth/google.ts");

      expect(result).toContain("src/features/auth/providers/oauth/google.test.ts");
      expect(result).toContain("tests/features/auth/providers/oauth/google.test.ts");
    });
  });

  // ==========================================================================
  // extractModuleFromPath
  // ==========================================================================
  describe("extractModuleFromPath", () => {
    it("should extract module from src/module path", () => {
      expect(extractModuleFromPath("src/auth/login.ts")).toBe("auth");
    });

    it("should extract module from lib/module path", () => {
      expect(extractModuleFromPath("lib/utils/helper.ts")).toBe("utils");
    });

    it("should extract module from app/module path", () => {
      expect(extractModuleFromPath("app/api/routes.ts")).toBe("api");
    });

    it("should extract module from pkg/module path", () => {
      expect(extractModuleFromPath("pkg/core/engine.go")).toBe("core");
    });

    it("should extract first directory as module for non-standard paths", () => {
      expect(extractModuleFromPath("services/auth/login.ts")).toBe("services");
    });

    it("should return null for single file without directory", () => {
      expect(extractModuleFromPath("index.ts")).toBe(null);
    });

    it("should return null for hidden directory paths", () => {
      expect(extractModuleFromPath(".github/workflows/ci.yml")).toBe(null);
    });

    it("should handle paths with multiple segments", () => {
      expect(extractModuleFromPath("src/features/auth/login.ts")).toBe("features");
    });
  });

  // ==========================================================================
  // getChangedFiles
  // ==========================================================================
  describe("getChangedFiles", () => {
    it("should return combined staged, unstaged, and last commit files", async () => {
      // Mock exec to return different files for each command
      let callCount = 0;
      mockedExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
        const cb = typeof opts === "function" ? opts : callback;
        callCount++;

        if (cmd.includes("--cached")) {
          (cb as Function)(null, { stdout: "staged.ts\n", stderr: "" });
        } else if (cmd.includes("HEAD~1")) {
          (cb as Function)(null, { stdout: "committed.ts\n", stderr: "" });
        } else {
          (cb as Function)(null, { stdout: "unstaged.ts\n", stderr: "" });
        }

        return {} as ReturnType<typeof exec>;
      });

      const result = await getChangedFiles("/test/cwd");

      expect(result).toContain("staged.ts");
      expect(result).toContain("unstaged.ts");
      expect(result).toContain("committed.ts");
      expect(result).toHaveLength(3);
    });

    it("should deduplicate files appearing in multiple sources", async () => {
      mockedExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
        const cb = typeof opts === "function" ? opts : callback;
        // Return same file from all sources
        (cb as Function)(null, { stdout: "same-file.ts\n", stderr: "" });
        return {} as ReturnType<typeof exec>;
      });

      const result = await getChangedFiles("/test/cwd");

      expect(result).toEqual(["same-file.ts"]);
    });

    it("should handle empty git output", async () => {
      mockedExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
        const cb = typeof opts === "function" ? opts : callback;
        (cb as Function)(null, { stdout: "", stderr: "" });
        return {} as ReturnType<typeof exec>;
      });

      const result = await getChangedFiles("/test/cwd");

      expect(result).toEqual([]);
    });

    it("should return empty array on git error", async () => {
      mockedExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
        const cb = typeof opts === "function" ? opts : callback;
        (cb as Function)(new Error("git not found"), { stdout: "", stderr: "" });
        return {} as ReturnType<typeof exec>;
      });

      const result = await getChangedFiles("/test/cwd");

      expect(result).toEqual([]);
    });

    it("should filter out empty lines", async () => {
      mockedExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
        const cb = typeof opts === "function" ? opts : callback;
        (cb as Function)(null, { stdout: "file1.ts\n\nfile2.ts\n\n", stderr: "" });
        return {} as ReturnType<typeof exec>;
      });

      const result = await getChangedFiles("/test/cwd");

      expect(result).not.toContain("");
      expect(result).toContain("file1.ts");
      expect(result).toContain("file2.ts");
    });
  });

  // ==========================================================================
  // findExistingTestFiles
  // ==========================================================================
  describe("findExistingTestFiles", () => {
    it("should return only existing files from candidates", async () => {
      mockedFileExists.mockImplementation(async (filePath: string) => {
        return filePath.includes("existing");
      });

      const candidates = [
        "existing.test.ts",
        "missing.test.ts",
        "existing.spec.ts",
      ];

      const result = await findExistingTestFiles("/test/cwd", candidates);

      expect(result).toContain("existing.test.ts");
      expect(result).toContain("existing.spec.ts");
      expect(result).not.toContain("missing.test.ts");
    });

    it("should handle empty candidates array", async () => {
      const result = await findExistingTestFiles("/test/cwd", []);

      expect(result).toEqual([]);
    });

    it("should return empty array when no files exist", async () => {
      mockedFileExists.mockResolvedValue(false);

      const result = await findExistingTestFiles("/test/cwd", [
        "a.test.ts",
        "b.test.ts",
      ]);

      expect(result).toEqual([]);
    });
  });

  // ==========================================================================
  // discoverTestsForFeature
  // ==========================================================================
  describe("discoverTestsForFeature", () => {
    it("should return explicit testPattern with highest confidence", async () => {
      const feature = createMockFeature({
        testPattern: "tests/auth/**/*.test.ts",
      });

      const result = await discoverTestsForFeature("/test/cwd", feature);

      expect(result.source).toBe("explicit");
      expect(result.pattern).toBe("tests/auth/**/*.test.ts");
      expect(result.confidence).toBe(1.0);
      expect(result.testFiles).toEqual([]);
    });

    it("should auto-detect test files from changed files", async () => {
      const feature = createMockFeature();

      mockedFileExists.mockImplementation(async (filePath: string) => {
        return filePath.includes("auth.test.ts");
      });

      const changedFiles = ["src/auth.ts"];
      const result = await discoverTestsForFeature("/test/cwd", feature, changedFiles);

      expect(result.source).toBe("auto-detected");
      expect(result.confidence).toBe(0.9);
      expect(result.testFiles.length).toBeGreaterThan(0);
    });

    it("should include directly changed test files", async () => {
      const feature = createMockFeature();

      mockedFileExists.mockResolvedValue(true);

      const changedFiles = ["tests/auth.test.ts", "src/auth.ts"];
      const result = await discoverTestsForFeature("/test/cwd", feature, changedFiles);

      expect(result.source).toBe("auto-detected");
      expect(result.testFiles).toContain("tests/auth.test.ts");
    });

    it("should fall back to module-based pattern when no test files found", async () => {
      const feature = createMockFeature({ module: "auth" });

      mockedFileExists.mockResolvedValue(false);

      const changedFiles = ["src/auth/login.ts"];
      const result = await discoverTestsForFeature("/test/cwd", feature, changedFiles);

      expect(result.source).toBe("module-based");
      expect(result.pattern).toContain("auth");
      expect(result.confidence).toBe(0.6);
    });

    it("should return none when no changed files", async () => {
      const feature = createMockFeature();

      const result = await discoverTestsForFeature("/test/cwd", feature, []);

      expect(result.source).toBe("none");
      expect(result.pattern).toBe(null);
      expect(result.confidence).toBe(0);
    });

    it("should extract module from changed files if feature.module not helpful", async () => {
      const feature = createMockFeature({ module: "" });

      mockedFileExists.mockResolvedValue(false);

      const changedFiles = ["src/utils/helper.ts"];
      const result = await discoverTestsForFeature("/test/cwd", feature, changedFiles);

      expect(result.source).toBe("module-based");
      expect(result.pattern).toContain("utils");
    });

    it("should filter out test files when looking for source files", async () => {
      const feature = createMockFeature({ module: "" });

      mockedFileExists.mockResolvedValue(false);

      // All files are test files - should not try to map them to more test files
      // But module can still be extracted from paths like "src/auth.test.ts" -> "auth"
      const changedFiles = [
        "src/auth.test.ts",
        "tests/utils.spec.ts",
        "__tests__/helper.ts",
      ];
      const result = await discoverTestsForFeature("/test/cwd", feature, changedFiles);

      // Module can be extracted from "src/auth.test.ts" -> module "auth"
      // So it falls back to module-based pattern
      expect(result.source).toBe("module-based");
    });

    it("should call getChangedFiles when changedFiles not provided", async () => {
      const feature = createMockFeature();

      // Mock exec to simulate no changes
      mockedExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
        const cb = typeof opts === "function" ? opts : callback;
        (cb as Function)(null, { stdout: "", stderr: "" });
        return {} as ReturnType<typeof exec>;
      });

      const result = await discoverTestsForFeature("/test/cwd", feature);

      expect(result.source).toBe("none");
    });
  });

  // ==========================================================================
  // buildSelectiveTestCommand
  // ==========================================================================
  describe("buildSelectiveTestCommand", () => {
    const defaultDiscovery: TestDiscoveryResult = {
      pattern: "auth",
      source: "auto-detected",
      testFiles: [],
      confidence: 0.9,
    };

    it("should return null when hasTests is false", () => {
      const caps = createMockCapabilities({ hasTests: false });

      const result = buildSelectiveTestCommand(caps, "pattern", defaultDiscovery);

      expect(result).toBe(null);
    });

    it("should return null when testCommand is missing", () => {
      const caps = createMockCapabilities({ testCommand: undefined });

      const result = buildSelectiveTestCommand(caps, "pattern", defaultDiscovery);

      expect(result).toBe(null);
    });

    it("should return full test command when pattern is null", () => {
      const caps = createMockCapabilities({ testCommand: "npm test" });

      const result = buildSelectiveTestCommand(caps, null, defaultDiscovery);

      expect(result).toBe("npm test");
    });

    // Vitest
    it("should build vitest command with test files", () => {
      const caps = createMockCapabilities({ testFramework: "vitest" });
      const discovery: TestDiscoveryResult = {
        ...defaultDiscovery,
        testFiles: ["tests/auth.test.ts", "tests/login.test.ts"],
      };

      const result = buildSelectiveTestCommand(caps, "auth", discovery);

      expect(result).toBe("npx vitest run tests/auth.test.ts tests/login.test.ts");
    });

    it("should build vitest command with pattern when no test files", () => {
      const caps = createMockCapabilities({ testFramework: "vitest" });

      const result = buildSelectiveTestCommand(caps, "auth", defaultDiscovery);

      expect(result).toBe('npx vitest run --testNamePattern "auth"');
    });

    // Jest
    it("should build jest command with test files", () => {
      const caps = createMockCapabilities({ testFramework: "jest" });
      const discovery: TestDiscoveryResult = {
        ...defaultDiscovery,
        testFiles: ["tests/auth.test.ts"],
      };

      const result = buildSelectiveTestCommand(caps, "auth", discovery);

      expect(result).toBe("npx jest tests/auth.test.ts");
    });

    it("should build jest command with pattern when no test files", () => {
      const caps = createMockCapabilities({ testFramework: "jest" });

      const result = buildSelectiveTestCommand(caps, "auth", defaultDiscovery);

      expect(result).toBe('npx jest --testPathPattern "auth"');
    });

    // Mocha
    it("should build mocha command with test files", () => {
      const caps = createMockCapabilities({ testFramework: "mocha" });
      const discovery: TestDiscoveryResult = {
        ...defaultDiscovery,
        testFiles: ["test/auth.test.js"],
      };

      const result = buildSelectiveTestCommand(caps, "auth", discovery);

      expect(result).toBe("npx mocha test/auth.test.js");
    });

    it("should build mocha command with grep pattern", () => {
      const caps = createMockCapabilities({ testFramework: "mocha" });

      const result = buildSelectiveTestCommand(caps, "auth", defaultDiscovery);

      expect(result).toBe('npx mocha --grep "auth"');
    });

    // Pytest
    it("should build pytest command with test files", () => {
      const caps = createMockCapabilities({ testFramework: "pytest" });
      const discovery: TestDiscoveryResult = {
        ...defaultDiscovery,
        testFiles: ["tests/test_auth.py"],
      };

      const result = buildSelectiveTestCommand(caps, "auth", discovery);

      expect(result).toBe("pytest tests/test_auth.py");
    });

    it("should build pytest command with -k pattern", () => {
      const caps = createMockCapabilities({ testFramework: "pytest" });

      const result = buildSelectiveTestCommand(caps, "auth", defaultDiscovery);

      expect(result).toBe('pytest -k "auth"');
    });

    // Go
    it("should build go test command with -run pattern", () => {
      const caps = createMockCapabilities({ testFramework: "go" });

      const result = buildSelectiveTestCommand(caps, "TestAuth", defaultDiscovery);

      expect(result).toBe('go test -run "TestAuth" ./...');
    });

    // Cargo
    it("should build cargo test command with filter", () => {
      const caps = createMockCapabilities({ testFramework: "cargo" });

      const result = buildSelectiveTestCommand(caps, "auth", defaultDiscovery);

      expect(result).toBe('cargo test "auth"');
    });

    // Unknown framework
    it("should append pattern to npm test for unknown framework", () => {
      const caps = createMockCapabilities({
        testFramework: undefined,
        testCommand: "npm test",
      });

      const result = buildSelectiveTestCommand(caps, "auth", defaultDiscovery);

      expect(result).toBe('npm test -- "auth"');
    });

    it("should return base command for unknown framework with non-npm command", () => {
      const caps = createMockCapabilities({
        testFramework: undefined,
        testCommand: "make test",
      });

      const result = buildSelectiveTestCommand(caps, "auth", defaultDiscovery);

      expect(result).toBe("make test");
    });
  });

  // ==========================================================================
  // getSelectiveTestCommand
  // ==========================================================================
  describe("getSelectiveTestCommand", () => {
    it("should return selective command when pattern discovered", async () => {
      const feature = createMockFeature({ testPattern: "tests/auth/**" });
      const caps = createMockCapabilities();

      const result = await getSelectiveTestCommand("/test/cwd", feature, caps);

      expect(result.isSelective).toBe(true);
      expect(result.command).not.toBe(null);
      expect(result.discovery.source).toBe("explicit");
    });

    it("should return isSelective false when no pattern found", async () => {
      const feature = createMockFeature();
      const caps = createMockCapabilities();

      // Mock no changed files
      mockedExec.mockImplementation((cmd: string, opts: unknown, callback?: unknown) => {
        const cb = typeof opts === "function" ? opts : callback;
        (cb as Function)(null, { stdout: "", stderr: "" });
        return {} as ReturnType<typeof exec>;
      });

      const result = await getSelectiveTestCommand("/test/cwd", feature, caps);

      expect(result.isSelective).toBe(false);
      expect(result.discovery.source).toBe("none");
    });

    it("should pass changedFiles to discoverTestsForFeature", async () => {
      const feature = createMockFeature();
      const caps = createMockCapabilities();

      mockedFileExists.mockResolvedValue(true);

      const result = await getSelectiveTestCommand(
        "/test/cwd",
        feature,
        caps,
        ["src/auth.ts"]
      );

      expect(result.discovery.testFiles.length).toBeGreaterThan(0);
    });

    it("should return null command when no test capability", async () => {
      const feature = createMockFeature({ testPattern: "tests/**" });
      const caps = createMockCapabilities({ hasTests: false });

      const result = await getSelectiveTestCommand("/test/cwd", feature, caps);

      expect(result.command).toBe(null);
    });
  });
});
