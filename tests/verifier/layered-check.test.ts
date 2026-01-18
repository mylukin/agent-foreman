/**
 * Tests for layered-check.ts
 * Layered check mode - fast git-diff-based verification with task impact awareness
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { isHighRiskChange, runLayeredCheck } from "../../src/verifier/layered-check.js";
import type { Feature, FeatureList } from "../../src/types/index.js";

// Mock external dependencies
vi.mock("../../src/features/index.js", () => ({
  loadFeatureList: vi.fn(),
}));

vi.mock("../../src/capabilities/index.js", () => ({
  detectCapabilities: vi.fn(),
}));

vi.mock("../../src/testing/index.js", () => ({
  getChangedFiles: vi.fn(),
  discoverTestsForFeature: vi.fn(),
}));

vi.mock("../../src/verifier/check-executor.js", () => ({
  runAutomatedChecks: vi.fn(),
}));

vi.mock("../../src/verifier/ai-analysis.js", () => ({
  analyzeWithAI: vi.fn(),
}));

vi.mock("../../src/agents.js", () => ({
  callAnyAvailableAgent: vi.fn(),
}));

vi.mock("../../src/verifier/task-impact.js", () => ({
  getTaskImpact: vi.fn(),
}));

vi.mock("../../src/progress.js", () => ({
  createStepProgress: vi.fn(() => ({
    start: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
  })),
  isTTY: vi.fn(() => false),
}));

import { loadFeatureList } from "../../src/features/index.js";
import { detectCapabilities } from "../../src/capabilities/index.js";
import { getChangedFiles, discoverTestsForFeature } from "../../src/testing/index.js";
import { runAutomatedChecks } from "../../src/verifier/check-executor.js";
import { analyzeWithAI } from "../../src/verifier/ai-analysis.js";
import { getTaskImpact } from "../../src/verifier/task-impact.js";
import { callAnyAvailableAgent } from "../../src/agents.js";

const mockedLoadFeatureList = vi.mocked(loadFeatureList);
const mockedDetectCapabilities = vi.mocked(detectCapabilities);
const mockedGetChangedFiles = vi.mocked(getChangedFiles);
const mockedDiscoverTestsForFeature = vi.mocked(discoverTestsForFeature);
const mockedRunAutomatedChecks = vi.mocked(runAutomatedChecks);
const mockedAnalyzeWithAI = vi.mocked(analyzeWithAI);
const mockedGetTaskImpact = vi.mocked(getTaskImpact);
const mockedCallAnyAvailableAgent = vi.mocked(callAnyAvailableAgent);

// Suppress console output during tests
let consoleLogSpy: ReturnType<typeof vi.spyOn>;

describe("Layered Check Mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Default mocks
    mockedDetectCapabilities.mockResolvedValue({
      hasTests: true,
      testCommand: "npm test",
      hasTypeCheck: true,
      typeCheckCommand: "tsc --noEmit",
      hasLint: true,
      lintCommand: "eslint .",
      hasBuild: true,
      buildCommand: "npm run build",
      hasPlaywright: false,
      testFramework: "vitest",
    });

    mockedDiscoverTestsForFeature.mockResolvedValue({
      testFiles: [],
      pattern: null,
      source: "none",
    });

    mockedRunAutomatedChecks.mockResolvedValue([]);
    mockedGetTaskImpact.mockResolvedValue([]);
    mockedLoadFeatureList.mockResolvedValue(null);

    // Mock for spec compliance check (Layer 2.5)
    mockedCallAnyAvailableAgent.mockResolvedValue({
      success: true,
      output: JSON.stringify({
        criteriaResults: [],
        overEngineering: { detected: false, extras: [], reasoning: "" },
        missingCriteria: [],
        summary: "COMPLIANT",
      }),
      agentUsed: "test-agent",
    });
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    vi.restoreAllMocks();
  });

  describe("isHighRiskChange", () => {
    it("should return true for package.json changes", () => {
      expect(isHighRiskChange(["package.json"])).toBe(true);
      expect(isHighRiskChange(["src/package.json"])).toBe(true);
    });

    it("should return true for package-lock.json changes", () => {
      expect(isHighRiskChange(["package-lock.json"])).toBe(true);
    });

    it("should return true for pnpm-lock.yaml changes", () => {
      expect(isHighRiskChange(["pnpm-lock.yaml"])).toBe(true);
    });

    it("should return true for yarn.lock changes", () => {
      expect(isHighRiskChange(["yarn.lock"])).toBe(true);
    });

    it("should return true for tsconfig changes", () => {
      expect(isHighRiskChange(["tsconfig.json"])).toBe(true);
      expect(isHighRiskChange(["tsconfig.build.json"])).toBe(true);
      expect(isHighRiskChange(["tsconfig.node.json"])).toBe(true);
    });

    it("should return true for eslint config changes", () => {
      expect(isHighRiskChange([".eslintrc"])).toBe(true);
      expect(isHighRiskChange([".eslintrc.js"])).toBe(true);
      expect(isHighRiskChange([".eslintrc.json"])).toBe(true);
      expect(isHighRiskChange(["eslint.config.js"])).toBe(true);
      expect(isHighRiskChange(["eslint.config.mjs"])).toBe(true);
    });

    it("should return true for vite config changes", () => {
      expect(isHighRiskChange(["vite.config.ts"])).toBe(true);
      expect(isHighRiskChange(["vite.config.js"])).toBe(true);
    });

    it("should return true for vitest config changes", () => {
      expect(isHighRiskChange(["vitest.config.ts"])).toBe(true);
      expect(isHighRiskChange(["vitest.config.js"])).toBe(true);
    });

    it("should return true for playwright config changes", () => {
      expect(isHighRiskChange(["playwright.config.ts"])).toBe(true);
      expect(isHighRiskChange(["playwright.config.js"])).toBe(true);
    });

    it("should return true for .env file changes", () => {
      expect(isHighRiskChange([".env"])).toBe(true);
      expect(isHighRiskChange([".env.local"])).toBe(true);
      expect(isHighRiskChange([".env.production"])).toBe(true);
    });

    it("should return true for Cargo.toml changes (Rust)", () => {
      expect(isHighRiskChange(["Cargo.toml"])).toBe(true);
    });

    it("should return true for go.mod changes (Go)", () => {
      expect(isHighRiskChange(["go.mod"])).toBe(true);
    });

    it("should return true for requirements.txt changes (Python)", () => {
      expect(isHighRiskChange(["requirements.txt"])).toBe(true);
    });

    it("should return false for regular source files", () => {
      expect(isHighRiskChange(["src/index.ts"])).toBe(false);
      expect(isHighRiskChange(["src/utils/helper.js"])).toBe(false);
      expect(isHighRiskChange(["README.md"])).toBe(false);
    });

    it("should return true if any file in array is high-risk", () => {
      expect(isHighRiskChange(["src/index.ts", "package.json"])).toBe(true);
      expect(isHighRiskChange(["src/index.ts", "src/utils.ts"])).toBe(false);
    });

    it("should return false for empty array", () => {
      expect(isHighRiskChange([])).toBe(false);
    });
  });

  describe("runLayeredCheck", () => {
    it("should return early when no changed files", async () => {
      mockedGetChangedFiles.mockResolvedValue([]);

      const result = await runLayeredCheck("/test/dir");

      expect(result.changedFiles).toEqual([]);
      expect(result.passed).toBe(true);
      expect(result.checks).toEqual({});
      expect(result.skipped).toContain("tests");
      expect(result.skipped).toContain("typecheck");
      expect(result.skipped).toContain("lint");
      expect(result.skipped).toContain("build");
      expect(result.skipped).toContain("e2e");
      expect(result.skipped).toContain("ai");
    });

    it("should run automated checks when files changed", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/index.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([
        { type: "typecheck", success: true, duration: 1000 },
        { type: "lint", success: true, duration: 500 },
        { type: "test", success: true, duration: 2000 },
      ]);

      const result = await runLayeredCheck("/test/dir");

      expect(result.changedFiles).toEqual(["src/index.ts"]);
      expect(result.passed).toBe(true);
      expect(result.checks.typecheck?.success).toBe(true);
      expect(result.checks.lint?.success).toBe(true);
      expect(result.checks.tests?.success).toBe(true);
      expect(mockedRunAutomatedChecks).toHaveBeenCalled();
    });

    it("should detect high-risk changes", async () => {
      mockedGetChangedFiles.mockResolvedValue(["package.json"]);
      mockedRunAutomatedChecks.mockResolvedValue([
        { type: "typecheck", success: true, duration: 1000 },
      ]);

      const result = await runLayeredCheck("/test/dir");

      expect(result.highRiskEscalation).toBe(true);
    });

    it("should not detect high-risk for regular files", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/index.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([
        { type: "typecheck", success: true, duration: 1000 },
      ]);

      const result = await runLayeredCheck("/test/dir");

      expect(result.highRiskEscalation).toBe(false);
    });

    it("should call getTaskImpact for changed files", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/auth/login.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([]);
      mockedGetTaskImpact.mockResolvedValue([
        {
          taskId: "auth.login",
          reason: "file in module: auth",
          confidence: "low",
          matchedFiles: ["src/auth/login.ts"],
        },
      ]);

      const result = await runLayeredCheck("/test/dir");

      expect(mockedGetTaskImpact).toHaveBeenCalledWith("/test/dir", ["src/auth/login.ts"]);
      expect(result.affectedTasks).toHaveLength(1);
      expect(result.affectedTasks[0].taskId).toBe("auth.login");
    });

    it("should skip task impact when skipTaskImpact is true", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/auth/login.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([]);

      const result = await runLayeredCheck("/test/dir", { skipTaskImpact: true });

      expect(mockedGetTaskImpact).not.toHaveBeenCalled();
      expect(result.affectedTasks).toEqual([]);
    });

    it("should fail when any check fails", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/index.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([
        { type: "typecheck", success: false, duration: 1000, output: "Type error" },
        { type: "lint", success: true, duration: 500 },
      ]);

      const result = await runLayeredCheck("/test/dir");

      expect(result.passed).toBe(false);
      expect(result.checks.typecheck?.success).toBe(false);
    });

    it("should skip build and e2e by default", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/index.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([]);

      const result = await runLayeredCheck("/test/dir");

      expect(result.skipped).toContain("build");
      expect(result.skipped).toContain("e2e");
      expect(result.skipped).toContain("ai");
    });

    it("should run AI verification when ai is true", async () => {
      const mockFeature: Feature = {
        id: "auth.login",
        description: "User login",
        module: "auth",
        priority: 1,
        status: "failing",
        acceptance: ["User can log in"],
        dependsOn: [],
        supersedes: [],
        tags: [],
        notes: "",
        version: 1,
        origin: "manual",
      };

      mockedGetChangedFiles.mockResolvedValue(["src/auth/login.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([
        { type: "typecheck", success: true, duration: 1000 },
      ]);
      mockedGetTaskImpact.mockResolvedValue([
        {
          taskId: "auth.login",
          reason: "file in module: auth",
          confidence: "low",
          matchedFiles: ["src/auth/login.ts"],
        },
      ]);
      mockedLoadFeatureList.mockResolvedValue({
        features: [mockFeature],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      });
      mockedAnalyzeWithAI.mockResolvedValue({
        verdict: "pass",
        overallReasoning: "All criteria met",
        criteriaResults: [],
        agentUsed: "claude",
      });

      const result = await runLayeredCheck("/test/dir", { ai: true });

      expect(mockedAnalyzeWithAI).toHaveBeenCalled();
      expect(result.taskVerification).toHaveLength(1);
      expect(result.taskVerification?.[0].taskId).toBe("auth.login");
      expect(result.taskVerification?.[0].verdict).toBe("pass");
    });

    it("should not run AI verification when ai is false", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/auth/login.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([]);
      mockedGetTaskImpact.mockResolvedValue([
        {
          taskId: "auth.login",
          reason: "file in module: auth",
          confidence: "low",
          matchedFiles: ["src/auth/login.ts"],
        },
      ]);

      const result = await runLayeredCheck("/test/dir", { ai: false });

      expect(mockedAnalyzeWithAI).not.toHaveBeenCalled();
      expect(result.taskVerification).toBeUndefined();
    });

    it("should not run AI verification when no affected tasks", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/unrelated.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([]);
      mockedGetTaskImpact.mockResolvedValue([]);

      const result = await runLayeredCheck("/test/dir", { ai: true });

      expect(mockedAnalyzeWithAI).not.toHaveBeenCalled();
      expect(result.taskVerification).toBeUndefined();
    });

    it("should use test discovery for selective testing", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/auth/login.ts"]);
      mockedDiscoverTestsForFeature.mockResolvedValue({
        testFiles: ["tests/auth/login.test.ts"],
        pattern: "tests/auth/login.test.ts",
        source: "related",
      });
      mockedRunAutomatedChecks.mockResolvedValue([
        { type: "test", success: true, duration: 500 },
      ]);

      await runLayeredCheck("/test/dir");

      expect(mockedDiscoverTestsForFeature).toHaveBeenCalled();
      expect(mockedRunAutomatedChecks).toHaveBeenCalledWith(
        "/test/dir",
        expect.anything(),
        expect.objectContaining({
          testMode: "quick",
          selectiveTestCommand: "tests/auth/login.test.ts",
        })
      );
    });

    it("should use full test mode when no test files discovered", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/auth/login.ts"]);
      mockedDiscoverTestsForFeature.mockResolvedValue({
        testFiles: [],
        pattern: null,
        source: "none",
      });
      mockedRunAutomatedChecks.mockResolvedValue([]);

      await runLayeredCheck("/test/dir");

      expect(mockedRunAutomatedChecks).toHaveBeenCalledWith(
        "/test/dir",
        expect.anything(),
        expect.objectContaining({
          testMode: "full",
        })
      );
    });

    it("should handle TDD strict mode", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/auth/login.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([]);

      const result = await runLayeredCheck("/test/dir", { tddMode: "strict" });

      // Should still pass (TDD check is currently just a warning)
      expect(result).toBeDefined();
    });

    it("should return duration", async () => {
      mockedGetChangedFiles.mockResolvedValue(["src/index.ts"]);
      mockedRunAutomatedChecks.mockResolvedValue([]);

      const result = await runLayeredCheck("/test/dir");

      expect(result.duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle verbose mode", async () => {
      mockedGetChangedFiles.mockResolvedValue([
        "src/file1.ts",
        "src/file2.ts",
        "src/file3.ts",
        "src/file4.ts",
        "src/file5.ts",
        "src/file6.ts",
      ]);
      mockedRunAutomatedChecks.mockResolvedValue([]);

      await runLayeredCheck("/test/dir", { verbose: true });

      // Should log extra details in verbose mode
      expect(consoleLogSpy).toHaveBeenCalled();
    });
  });
});
