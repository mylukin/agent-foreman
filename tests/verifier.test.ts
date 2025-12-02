/**
 * Tests for verifier.ts
 * Core verification logic for feature verification
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";
import { promisify } from "node:util";

// We need to create our own mock for execAsync since it's promisified in the module
let execMockImpl: (cmd: string, opts?: object) => Promise<{ stdout: string; stderr: string }>;

// Mock child_process with promisify-compatible exec
vi.mock("node:child_process", () => {
  const mockExec = (cmd: string, opts: object | Function, callback?: Function) => {
    // Handle both callback and promise styles
    if (typeof opts === "function") {
      callback = opts as Function;
      opts = {};
    }

    // Use the implementation set by tests
    if (execMockImpl) {
      execMockImpl(cmd, opts as object)
        .then(result => {
          if (callback) callback(null, result.stdout, result.stderr);
        })
        .catch(err => {
          if (callback) callback(err, err.stdout || "", err.stderr || "");
        });
    } else {
      if (callback) callback(new Error("No mock implementation"), "", "");
    }
  };

  // Make it compatible with promisify
  (mockExec as any)[promisify.custom] = (cmd: string, opts?: object) => {
    return execMockImpl ? execMockImpl(cmd, opts) : Promise.reject(new Error("No mock implementation"));
  };

  return { exec: mockExec };
});

// Mock agents
vi.mock("../src/agents.js", () => ({
  callAnyAvailableAgent: vi.fn(),
}));

// Mock verification-store
vi.mock("../src/verification-store.js", () => ({
  saveVerificationResult: vi.fn(),
}));

// Mock project-capabilities
vi.mock("../src/project-capabilities.js", () => ({
  detectVerificationCapabilities: vi.fn(),
  detectCapabilities: vi.fn(),
}));

// Mock verification-prompts
vi.mock("../src/verification-prompts.js", () => ({
  buildVerificationPrompt: vi.fn(),
  parseVerificationResponse: vi.fn(),
}));

import { callAnyAvailableAgent } from "../src/agents.js";
import { saveVerificationResult } from "../src/verification-store.js";
import { detectCapabilities } from "../src/project-capabilities.js";
import {
  buildVerificationPrompt,
  parseVerificationResponse,
} from "../src/verification-prompts.js";
import {
  getGitDiffForFeature,
  runAutomatedChecks,
  readRelatedFiles,
  analyzeWithAI,
  verifyFeature,
  verifyFeatureAutonomous,
  buildAutonomousVerificationPrompt,
  createVerificationSummary,
  formatVerificationResult,
  isTransientError,
  calculateBackoff,
  RETRY_CONFIG,
  type AutomatedCheckOptions,
} from "../src/verifier.js";
import type { Feature } from "../src/types.js";
import type {
  VerificationCapabilities,
  VerificationResult,
  AutomatedCheckResult,
  TestMode,
} from "../src/verification-types.js";

const mockCallAgent = callAnyAvailableAgent as ReturnType<typeof vi.fn>;
const mockSaveResult = saveVerificationResult as ReturnType<typeof vi.fn>;
const mockDetectCapabilities = detectCapabilities as ReturnType<typeof vi.fn>;
const mockBuildPrompt = buildVerificationPrompt as ReturnType<typeof vi.fn>;
const mockParseResponse = parseVerificationResponse as ReturnType<typeof vi.fn>;

// Helper to set up exec mock implementation
function setExecMock(
  impl: (cmd: string, opts?: object) => { stdout: string; stderr?: string }
) {
  execMockImpl = async (cmd: string, opts?: object) => {
    const result = impl(cmd, opts);
    return { stdout: result.stdout, stderr: result.stderr || "" };
  };
}

function setExecMockWithErrors(
  impl: (cmd: string, opts?: object) => { stdout: string; stderr?: string } | Error
) {
  execMockImpl = async (cmd: string, opts?: object) => {
    const result = impl(cmd, opts);
    if (result instanceof Error) {
      throw result;
    }
    return { stdout: result.stdout, stderr: result.stderr || "" };
  };
}

describe("Verifier", () => {
  let testDir: string;

  beforeEach(async () => {
    vi.clearAllMocks();
    testDir = path.join(tmpdir(), `verifier-test-${Date.now()}`);
    await fs.mkdir(testDir, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("getGitDiffForFeature", () => {
    it("should return diff, files, and commit hash on success", async () => {
      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "abc123def456\n" };
        }
        if (cmd.includes("git diff HEAD~1 HEAD") && cmd.includes("--name-only")) {
          return { stdout: "src/file1.ts\nsrc/file2.ts\n" };
        }
        if (cmd.includes("git diff HEAD~1 HEAD")) {
          return { stdout: "diff --git a/file1.ts..." };
        }
        return { stdout: "" };
      });

      const result = await getGitDiffForFeature(testDir);

      expect(result.commitHash).toBe("abc123def456");
      expect(result.files).toContain("src/file1.ts");
      expect(result.files).toContain("src/file2.ts");
      expect(result.diff).toContain("diff --git");
    });

    it("should fallback to HEAD diff when HEAD~1 fails", async () => {
      let callCount = 0;
      setExecMockWithErrors((cmd: string) => {
        callCount++;
        // First call to rev-parse succeeds
        if (cmd.includes("rev-parse HEAD") && callCount === 1) {
          return { stdout: "abc123\n" };
        }
        // First diff call fails (HEAD~1)
        if (cmd.includes("HEAD~1")) {
          return new Error("fatal: ambiguous argument 'HEAD~1'");
        }
        // Fallback calls after error
        if (cmd.includes("git diff HEAD") && cmd.includes("--name-only")) {
          return { stdout: "src/changed.ts\n" };
        }
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "abc123\n" };
        }
        if (cmd.includes("git diff HEAD")) {
          return { stdout: "diff --git fallback" };
        }
        return { stdout: "" };
      });

      const result = await getGitDiffForFeature(testDir);

      expect(result.commitHash).toBe("abc123");
      expect(result.diff).toContain("fallback");
    });

    it("should return error result when all git commands fail", async () => {
      setExecMockWithErrors(() => {
        return new Error("Not a git repository");
      });

      const result = await getGitDiffForFeature(testDir);

      expect(result.commitHash).toBe("unknown");
      expect(result.files).toEqual([]);
      expect(result.diff).toBe("Unable to get git diff");
    });

    it("should handle empty diff output", async () => {
      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "abc123\n" };
        }
        if (cmd.includes("--name-only")) {
          return { stdout: "\n" };
        }
        return { stdout: "" };
      });

      const result = await getGitDiffForFeature(testDir);

      expect(result.diff).toBe("No changes detected");
      expect(result.files).toEqual([]);
    });

    it("should deduplicate file names", async () => {
      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "abc123\n" };
        }
        if (cmd.includes("--name-only")) {
          return { stdout: "file.ts\nfile.ts\nother.ts\n" };
        }
        return { stdout: "diff" };
      });

      const result = await getGitDiffForFeature(testDir);

      expect(result.files).toEqual(["file.ts", "other.ts"]);
    });
  });

  describe("runAutomatedChecks", () => {
    it("should run test command when hasTests is true", async () => {
      setExecMock((cmd: string) => {
        if (cmd === "npm test") {
          return { stdout: "All tests passed" };
        }
        return { stdout: "" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities);

      expect(results).toHaveLength(1);
      expect(results[0].type).toBe("test");
      expect(results[0].success).toBe(true);
      expect(results[0].output).toContain("All tests passed");
    });

    it("should run all check types", async () => {
      setExecMock((cmd: string) => {
        return { stdout: `Success: ${cmd}` };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: true,
        typeCheckCommand: "tsc --noEmit",
        hasLint: true,
        lintCommand: "eslint .",
        hasBuild: true,
        buildCommand: "npm run build",
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities);

      expect(results).toHaveLength(4);
      expect(results.map((r) => r.type)).toEqual([
        "test",
        "typecheck",
        "lint",
        "build",
      ]);
      results.forEach((r) => expect(r.success).toBe(true));
    });

    it("should handle check failures", async () => {
      setExecMockWithErrors((cmd: string) => {
        if (cmd === "npm test") {
          const error = new Error("Test failed") as Error & {
            stdout: string;
            stderr: string;
          };
          error.stdout = "1 test failed";
          error.stderr = "Error in test.ts";
          return error;
        }
        return { stdout: "" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].output).toContain("1 test failed");
    });

    it("should track duration", async () => {
      setExecMock(() => {
        return { stdout: "done" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities);

      expect(results[0].duration).toBeGreaterThanOrEqual(0);
    });

    it("should handle verbose output", async () => {
      const stdoutSpy = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      setExecMock(() => ({ stdout: "success" }));

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      await runAutomatedChecks(testDir, capabilities, true);

      // Progress indicators use either stdout.write (TTY) or console.log (non-TTY)
      const hasOutput = stdoutSpy.mock.calls.length > 0 || logSpy.mock.calls.length > 0;
      expect(hasOutput).toBe(true);

      stdoutSpy.mockRestore();
      logSpy.mockRestore();
    });

    it("should skip checks when capabilities are false", async () => {
      const capabilities: VerificationCapabilities = {
        hasTests: false,
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities);

      expect(results).toHaveLength(0);
    });
  });

  describe("readRelatedFiles", () => {
    it("should read TypeScript files from changed files list", async () => {
      const srcDir = path.join(testDir, "src");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "test.ts"), "const x = 1;");

      const result = await readRelatedFiles(testDir, ["src/test.ts"]);

      expect(result.size).toBe(1);
      expect(result.get("src/test.ts")).toBe("const x = 1;");
    });

    it("should read multiple file types", async () => {
      const srcDir = path.join(testDir, "src");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(path.join(srcDir, "app.tsx"), "<App/>");
      await fs.writeFile(path.join(srcDir, "util.js"), "module.exports = {}");
      await fs.writeFile(path.join(srcDir, "main.py"), "print('hello')");
      await fs.writeFile(path.join(srcDir, "main.go"), "package main");
      await fs.writeFile(path.join(srcDir, "lib.rs"), "fn main() {}");

      const changedFiles = [
        "src/app.tsx",
        "src/util.js",
        "src/main.py",
        "src/main.go",
        "src/lib.rs",
      ];

      const result = await readRelatedFiles(testDir, changedFiles);

      expect(result.size).toBe(5);
    });

    it("should read all source files without limit", async () => {
      const srcDir = path.join(testDir, "src");
      await fs.mkdir(srcDir, { recursive: true });

      for (let i = 0; i < 10; i++) {
        await fs.writeFile(path.join(srcDir, `file${i}.ts`), `const x${i} = ${i};`);
      }

      const changedFiles = Array.from({ length: 10 }, (_, i) => `src/file${i}.ts`);

      const result = await readRelatedFiles(testDir, changedFiles);

      // Should read all 10 files without any limit
      expect(result.size).toBe(10);
    });

    it("should skip path traversal attempts", async () => {
      const result = await readRelatedFiles(testDir, [
        "../../../etc/passwd",
        "src/../../../etc/passwd",
      ]);

      expect(result.size).toBe(0);
    });

    it("should skip non-source files", async () => {
      await fs.writeFile(path.join(testDir, "readme.md"), "# Readme");
      await fs.writeFile(path.join(testDir, "package.json"), "{}");

      const result = await readRelatedFiles(testDir, [
        "readme.md",
        "package.json",
      ]);

      expect(result.size).toBe(0);
    });

    it("should handle non-existent files gracefully", async () => {
      const result = await readRelatedFiles(testDir, [
        "src/nonexistent.ts",
      ]);

      expect(result.size).toBe(0);
    });
  });

  describe("analyzeWithAI", () => {
    const mockFeature: Feature = {
      id: "test.feature",
      description: "Test feature",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: ["Criterion 1", "Criterion 2"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };

    beforeEach(() => {
      mockBuildPrompt.mockReturnValue("verification prompt");
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should return successful analysis result", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: "AI analysis output",
        agentUsed: "claude",
      });

      mockParseResponse.mockReturnValue({
        criteriaResults: [
          {
            criterion: "Criterion 1",
            index: 0,
            satisfied: true,
            reasoning: "Implemented correctly",
            evidence: ["line 10"],
            confidence: 0.9,
          },
        ],
        verdict: "pass",
        overallReasoning: "All criteria met",
        suggestions: [],
        codeQualityNotes: [],
      });

      const result = await analyzeWithAI(
        testDir,
        mockFeature,
        "diff content",
        ["src/file.ts"],
        []
      );

      expect(result.verdict).toBe("pass");
      expect(result.agentUsed).toBe("claude");
      expect(result.criteriaResults[0].satisfied).toBe(true);
    });

    it("should handle AI failure", async () => {
      mockCallAgent.mockResolvedValue({
        success: false,
        error: "Agent unavailable",
        output: "",
        agentUsed: "none",
      });

      const result = await analyzeWithAI(
        testDir,
        mockFeature,
        "diff content",
        [],
        []
      );

      expect(result.verdict).toBe("needs_review");
      expect(result.agentUsed).toBe("none");
      expect(result.criteriaResults).toHaveLength(2);
      result.criteriaResults.forEach((cr) => {
        expect(cr.satisfied).toBe(false);
        expect(cr.reasoning).toContain("AI analysis failed");
      });
    });

    it("should pass options to agent", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: "output",
        agentUsed: "gemini",
      });

      mockParseResponse.mockReturnValue({
        criteriaResults: [],
        verdict: "pass",
        overallReasoning: "",
        suggestions: [],
        codeQualityNotes: [],
      });

      await analyzeWithAI(
        testDir,
        mockFeature,
        "diff",
        [],
        [],
        { timeout: 60000, verbose: true }
      );

      expect(mockCallAgent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          timeoutMs: 60000,
          verbose: true,
        })
      );
    });
  });

  describe("verifyFeature", () => {
    const mockFeature: Feature = {
      id: "test.feature",
      description: "Test feature",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: ["Criterion 1"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };

    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "commit123\n" };
        }
        if (cmd.includes("--name-only")) {
          return { stdout: "file.ts\n" };
        }
        return { stdout: "diff content" };
      });

      mockDetectCapabilities.mockResolvedValue({
        hasTests: false,
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      });

      mockBuildPrompt.mockReturnValue("prompt");
      mockParseResponse.mockReturnValue({
        criteriaResults: [
          {
            criterion: "Criterion 1",
            index: 0,
            satisfied: true,
            reasoning: "OK",
            evidence: [],
            confidence: 0.95,
          },
        ],
        verdict: "pass",
        overallReasoning: "Feature verified",
        suggestions: [],
        codeQualityNotes: [],
      });

      mockCallAgent.mockResolvedValue({
        success: true,
        output: "AI output",
        agentUsed: "claude",
      });

      mockSaveResult.mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should complete verification flow", async () => {
      const result = await verifyFeature(testDir, mockFeature);

      expect(result.featureId).toBe("test.feature");
      expect(result.verdict).toBe("pass");
      expect(result.commitHash).toBe("commit123");
      expect(mockSaveResult).toHaveBeenCalled();
    });

    it("should skip automated checks with skipChecks option", async () => {
      const result = await verifyFeature(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(result.automatedChecks).toEqual([]);
      expect(mockDetectCapabilities).not.toHaveBeenCalled();
    });

    it("should run automated checks when not skipped", async () => {
      mockDetectCapabilities.mockResolvedValue({
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      });

      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "commit123\n" };
        }
        if (cmd.includes("--name-only")) {
          return { stdout: "file.ts\n" };
        }
        if (cmd === "npm test") {
          return { stdout: "tests passed" };
        }
        return { stdout: "diff" };
      });

      const result = await verifyFeature(testDir, mockFeature);

      expect(result.automatedChecks).toHaveLength(1);
      expect(result.automatedChecks[0].type).toBe("test");
    });

    it("should handle verbose mode", async () => {
      const logSpy = vi.spyOn(console, "log");

      await verifyFeature(testDir, mockFeature, { verbose: true });

      expect(logSpy).toHaveBeenCalled();
    });
  });

  describe("createVerificationSummary", () => {
    it("should create summary from verification result", () => {
      const result: VerificationResult = {
        featureId: "test.feature",
        timestamp: "2024-01-01T00:00:00.000Z",
        commitHash: "abc123",
        changedFiles: ["file.ts"],
        diffSummary: "1 files changed",
        automatedChecks: [],
        criteriaResults: [
          {
            criterion: "Criterion 1",
            index: 0,
            satisfied: true,
            reasoning: "OK",
            evidence: [],
            confidence: 0.9,
          },
          {
            criterion: "Criterion 2",
            index: 1,
            satisfied: false,
            reasoning: "Not met",
            evidence: [],
            confidence: 0.8,
          },
        ],
        verdict: "needs_review",
        verifiedBy: "claude",
        overallReasoning: "Partial",
        suggestions: [],
        codeQualityNotes: [],
        relatedFilesAnalyzed: [],
      };

      const summary = createVerificationSummary(result);

      expect(summary.verifiedAt).toBe("2024-01-01T00:00:00.000Z");
      expect(summary.verdict).toBe("needs_review");
      expect(summary.verifiedBy).toBe("claude");
      expect(summary.commitHash).toBe("abc123");
      expect(summary.summary).toBe("1/2 criteria satisfied");
    });

    it("should handle all criteria satisfied", () => {
      const result: VerificationResult = {
        featureId: "test.feature",
        timestamp: "2024-01-01T00:00:00.000Z",
        commitHash: "abc123",
        changedFiles: [],
        diffSummary: "",
        automatedChecks: [],
        criteriaResults: [
          {
            criterion: "C1",
            index: 0,
            satisfied: true,
            reasoning: "OK",
            evidence: [],
            confidence: 1,
          },
          {
            criterion: "C2",
            index: 1,
            satisfied: true,
            reasoning: "OK",
            evidence: [],
            confidence: 1,
          },
        ],
        verdict: "pass",
        verifiedBy: "claude",
        overallReasoning: "",
        suggestions: [],
        codeQualityNotes: [],
        relatedFilesAnalyzed: [],
      };

      const summary = createVerificationSummary(result);

      expect(summary.summary).toBe("2/2 criteria satisfied");
    });
  });

  describe("formatVerificationResult", () => {
    const baseResult: VerificationResult = {
      featureId: "test.feature",
      timestamp: "2024-01-01T00:00:00.000Z",
      commitHash: "abc123",
      changedFiles: ["file.ts"],
      diffSummary: "1 files changed",
      automatedChecks: [],
      criteriaResults: [
        {
          criterion: "Criterion 1 that is very long and should be truncated",
          index: 0,
          satisfied: true,
          reasoning: "Implemented correctly",
          evidence: ["line 10", "line 20"],
          confidence: 0.95,
        },
      ],
      verdict: "pass",
      verifiedBy: "claude",
      overallReasoning: "All criteria satisfied",
      suggestions: ["Consider adding more tests"],
      codeQualityNotes: [],
      relatedFilesAnalyzed: [],
    };

    it("should format result without verbose", () => {
      const output = formatVerificationResult(baseResult);

      expect(output).toContain("Verification Result");
      expect(output).toContain("Criteria Analysis");
      expect(output).toContain("Verdict");
      expect(output).toContain("PASS");
      expect(output).not.toContain("Implemented correctly");
    });

    it("should format result with verbose mode", () => {
      const output = formatVerificationResult(baseResult, true);

      expect(output).toContain("Implemented correctly");
      expect(output).toContain("Evidence");
      expect(output).toContain("line 10");
      expect(output).toContain("All criteria satisfied");
    });

    it("should format automated checks", () => {
      const resultWithChecks: VerificationResult = {
        ...baseResult,
        automatedChecks: [
          { type: "test", success: true, output: "", duration: 1500 },
          { type: "lint", success: false, output: "", duration: 500 },
        ],
      };

      const output = formatVerificationResult(resultWithChecks);

      expect(output).toContain("Automated Checks");
      expect(output).toContain("test");
      expect(output).toContain("PASSED");
      expect(output).toContain("lint");
      expect(output).toContain("FAILED");
      expect(output).toContain("1.5s");
    });

    it("should format fail verdict", () => {
      const failResult: VerificationResult = {
        ...baseResult,
        verdict: "fail",
        criteriaResults: [
          {
            ...baseResult.criteriaResults[0],
            satisfied: false,
          },
        ],
      };

      const output = formatVerificationResult(failResult);

      expect(output).toContain("FAIL");
    });

    it("should format needs_review verdict", () => {
      const reviewResult: VerificationResult = {
        ...baseResult,
        verdict: "needs_review",
      };

      const output = formatVerificationResult(reviewResult);

      expect(output).toContain("NEEDS_REVIEW");
    });

    it("should format suggestions", () => {
      const output = formatVerificationResult(baseResult);

      expect(output).toContain("Suggestions");
      expect(output).toContain("Consider adding more tests");
    });

    it("should handle empty suggestions", () => {
      const noSuggestions: VerificationResult = {
        ...baseResult,
        suggestions: [],
      };

      const output = formatVerificationResult(noSuggestions);

      expect(output).not.toContain("Suggestions:");
    });

    it("should handle check without duration", () => {
      const resultWithChecks: VerificationResult = {
        ...baseResult,
        automatedChecks: [
          { type: "test", success: true, output: "" },
        ],
      };

      const output = formatVerificationResult(resultWithChecks);

      expect(output).toContain("test");
      expect(output).toContain("PASSED");
    });
  });

  describe("isTransientError", () => {
    it("should return false for undefined error", () => {
      expect(isTransientError(undefined)).toBe(false);
    });

    it("should return false for empty string", () => {
      expect(isTransientError("")).toBe(false);
    });

    it("should identify timeout errors as transient", () => {
      expect(isTransientError("Request timed out")).toBe(true);
      expect(isTransientError("timeout")).toBe(true);
      expect(isTransientError("ETIMEDOUT")).toBe(true);
    });

    it("should identify network errors as transient", () => {
      expect(isTransientError("ECONNRESET")).toBe(true);
      expect(isTransientError("ECONNREFUSED")).toBe(true);
      expect(isTransientError("ENETUNREACH")).toBe(true);
      expect(isTransientError("network error")).toBe(true);
      expect(isTransientError("socket hang up")).toBe(true);
    });

    it("should identify connection errors as transient", () => {
      expect(isTransientError("connection reset")).toBe(true);
      expect(isTransientError("connection refused")).toBe(true);
      expect(isTransientError("connection closed")).toBe(true);
    });

    it("should identify rate limit errors as transient", () => {
      expect(isTransientError("rate limit exceeded")).toBe(true);
      expect(isTransientError("too many requests")).toBe(true);
      expect(isTransientError("HTTP 429")).toBe(true);
    });

    it("should identify HTTP status errors as transient", () => {
      expect(isTransientError("HTTP 502")).toBe(true);
      expect(isTransientError("HTTP 503")).toBe(true);
      expect(isTransientError("HTTP 504")).toBe(true);
    });

    it("should identify overload errors as transient", () => {
      expect(isTransientError("server overloaded")).toBe(true);
      expect(isTransientError("at capacity")).toBe(true);
      expect(isTransientError("temporarily unavailable")).toBe(true);
    });

    it("should return false for permanent errors", () => {
      expect(isTransientError("Invalid API key")).toBe(false);
      expect(isTransientError("Authentication failed")).toBe(false);
      expect(isTransientError("Permission denied")).toBe(false);
      expect(isTransientError("File not found")).toBe(false);
    });
  });

  describe("calculateBackoff", () => {
    it("should calculate exponential delays", () => {
      // Disable jitter for deterministic testing
      const backup = Math.random;
      Math.random = () => 0.5; // Returns 0 jitter

      expect(calculateBackoff(1, 1000)).toBe(1000); // 1s
      expect(calculateBackoff(2, 1000)).toBe(2000); // 2s
      expect(calculateBackoff(3, 1000)).toBe(4000); // 4s
      expect(calculateBackoff(4, 1000)).toBe(8000); // 8s

      Math.random = backup;
    });

    it("should respect max delay", () => {
      Math.random = () => 0.5;

      // Very high attempt should be capped at maxDelayMs (10000)
      const delay = calculateBackoff(10, 1000);
      expect(delay).toBeLessThanOrEqual(RETRY_CONFIG.maxDelayMs);

      Math.random = Math.random; // Restore
    });

    it("should use default base delay", () => {
      Math.random = () => 0.5;

      const delay = calculateBackoff(1);
      expect(delay).toBe(RETRY_CONFIG.baseDelayMs);

      Math.random = Math.random;
    });

    it("should add jitter to delay", () => {
      // Test that jitter is applied by checking the delay is within expected range
      // Base delay for attempt 2 is 2000ms (2^1 * 1000)
      // Jitter is ±10%, so range is 1800-2200ms
      const delay = calculateBackoff(2, 1000);

      // Delay should be within ±10% of base (2000ms)
      expect(delay).toBeGreaterThanOrEqual(1800);
      expect(delay).toBeLessThanOrEqual(2200);
    });
  });

  describe("RETRY_CONFIG", () => {
    it("should have correct default values", () => {
      expect(RETRY_CONFIG.maxRetries).toBe(3);
      expect(RETRY_CONFIG.baseDelayMs).toBe(1000);
      expect(RETRY_CONFIG.maxDelayMs).toBe(10000);
    });
  });

  describe("analyzeWithAI - retry logic", () => {
    const mockFeature: Feature = {
      id: "test.feature",
      description: "Test feature",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: ["Criterion 1"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };

    beforeEach(() => {
      mockBuildPrompt.mockReturnValue("verification prompt");
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should retry on transient errors", async () => {
      let callCount = 0;
      mockCallAgent.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            success: false,
            error: "timeout",
            output: "",
            agentUsed: "claude",
          });
        }
        return Promise.resolve({
          success: true,
          output: "success",
          agentUsed: "claude",
        });
      });

      mockParseResponse.mockReturnValue({
        criteriaResults: [
          {
            criterion: "Criterion 1",
            index: 0,
            satisfied: true,
            reasoning: "OK",
            evidence: [],
            confidence: 0.9,
          },
        ],
        verdict: "pass",
        overallReasoning: "Done",
        suggestions: [],
        codeQualityNotes: [],
      });

      const result = await analyzeWithAI(
        testDir,
        mockFeature,
        "diff",
        [],
        []
      );

      expect(callCount).toBe(3);
      expect(result.verdict).toBe("pass");
    });

    it("should not retry on permanent errors", async () => {
      let callCount = 0;
      mockCallAgent.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: false,
          error: "Invalid API key",
          output: "",
          agentUsed: "claude",
        });
      });

      const result = await analyzeWithAI(
        testDir,
        mockFeature,
        "diff",
        [],
        []
      );

      // Should only call once (no retries for permanent errors)
      expect(callCount).toBe(1);
      expect(result.verdict).toBe("needs_review");
    });

    it("should fail after max retries exhausted", async () => {
      let callCount = 0;
      mockCallAgent.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: false,
          error: "connection timeout",
          output: "",
          agentUsed: "claude",
        });
      });

      const result = await analyzeWithAI(
        testDir,
        mockFeature,
        "diff",
        [],
        []
      );

      expect(callCount).toBe(RETRY_CONFIG.maxRetries);
      expect(result.verdict).toBe("needs_review");
      expect(result.overallReasoning).toContain("failed after retries");
    });

    it("should succeed on first try without retrying", async () => {
      let callCount = 0;
      mockCallAgent.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: true,
          output: "success",
          agentUsed: "gemini",
        });
      });

      mockParseResponse.mockReturnValue({
        criteriaResults: [
          {
            criterion: "Criterion 1",
            index: 0,
            satisfied: true,
            reasoning: "OK",
            evidence: [],
            confidence: 0.9,
          },
        ],
        verdict: "pass",
        overallReasoning: "Done",
        suggestions: [],
        codeQualityNotes: [],
      });

      const result = await analyzeWithAI(
        testDir,
        mockFeature,
        "diff",
        [],
        []
      );

      expect(callCount).toBe(1);
      expect(result.verdict).toBe("pass");
    });
  });

  describe("runAutomatedChecks - selective testing", () => {
    it("should use selective test command in quick mode", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: true,
        typeCheckCommand: "tsc --noEmit",
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        testMode: "quick",
        selectiveTestCommand: "npx vitest run tests/auth.test.ts",
        testDiscovery: {
          pattern: "tests/auth.test.ts",
          source: "auto-detected",
          testFiles: ["tests/auth.test.ts"],
          confidence: 0.9,
        },
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      expect(results).toHaveLength(2); // test + typecheck
      expect(commands).toContain("npx vitest run tests/auth.test.ts");
      expect(commands).not.toContain("npm test");
    });

    it("should fall back to full tests when no selective command in quick mode", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        testMode: "quick",
        // No selectiveTestCommand - should fall back to full tests
      };

      await runAutomatedChecks(testDir, capabilities, options);

      expect(commands).toContain("npm test");
    });

    it("should skip tests in skip mode", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: true,
        typeCheckCommand: "tsc --noEmit",
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        testMode: "skip",
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      expect(results).toHaveLength(1); // Only typecheck
      expect(results[0].type).toBe("typecheck");
      expect(commands).not.toContain("npm test");
    });

    it("should run full tests in full mode (default)", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        testMode: "full",
      };

      await runAutomatedChecks(testDir, capabilities, options);

      expect(commands).toContain("npm test");
    });

    it("should handle boolean verbose parameter for backward compatibility", async () => {
      setExecMock(() => ({ stdout: "success" }));

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      // Test with boolean parameter (backward compatible)
      const results = await runAutomatedChecks(testDir, capabilities, true);

      expect(results).toHaveLength(1);
    });

    it("should include verbose test discovery info", async () => {
      const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      setExecMock(() => ({ stdout: "success" }));

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        verbose: true,
        testMode: "quick",
        selectiveTestCommand: "npx vitest run tests/auth.test.ts",
        testDiscovery: {
          pattern: "tests/auth.test.ts",
          source: "auto-detected",
          testFiles: ["tests/auth.test.ts"],
          confidence: 0.9,
        },
      };

      await runAutomatedChecks(testDir, capabilities, options);

      // Verbose mode should log discovery info
      expect(logSpy.mock.calls.some(call =>
        call.some(arg => typeof arg === "string" && arg.includes("auto-detected"))
      )).toBe(true);

      logSpy.mockRestore();
    });
  });

  describe("verifyFeature - testMode options", () => {
    const mockFeature: Feature = {
      id: "test.feature",
      description: "Test feature",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: ["Criterion 1"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };

    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "commit123\n" };
        }
        if (cmd.includes("--name-only")) {
          return { stdout: "file.ts\n" };
        }
        return { stdout: "diff content" };
      });

      mockDetectCapabilities.mockResolvedValue({
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      });

      mockBuildPrompt.mockReturnValue("prompt");
      mockParseResponse.mockReturnValue({
        criteriaResults: [
          {
            criterion: "Criterion 1",
            index: 0,
            satisfied: true,
            reasoning: "OK",
            evidence: [],
            confidence: 0.95,
          },
        ],
        verdict: "pass",
        overallReasoning: "Feature verified",
        suggestions: [],
        codeQualityNotes: [],
      });

      mockCallAgent.mockResolvedValue({
        success: true,
        output: "AI output",
        agentUsed: "claude",
      });

      mockSaveResult.mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should pass testMode option to runAutomatedChecks", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "commit123\n" };
        }
        if (cmd.includes("--name-only")) {
          return { stdout: "src/file.ts\n" };
        }
        return { stdout: "success" };
      });

      await verifyFeature(testDir, mockFeature, {
        testMode: "quick",
      });

      // In quick mode, if no explicit pattern found, it falls back to full tests
      expect(commands.some(cmd => cmd.includes("test"))).toBe(true);
    });

    it("should use explicit testPattern when provided", async () => {
      const featureWithPattern: Feature = {
        ...mockFeature,
        testPattern: "tests/specific/**",
      };

      await verifyFeature(testDir, featureWithPattern, {
        testMode: "quick",
      });

      // The test pattern should be used
      expect(mockDetectCapabilities).toHaveBeenCalled();
    });

    it("should skip tests with testMode skip", async () => {
      mockDetectCapabilities.mockResolvedValue({
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: true,
        typeCheckCommand: "tsc --noEmit",
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      });

      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "commit123\n" };
        }
        if (cmd.includes("--name-only")) {
          return { stdout: "file.ts\n" };
        }
        return { stdout: "success" };
      });

      const result = await verifyFeature(testDir, mockFeature, {
        testMode: "skip",
      });

      // Should only have typecheck result, not test
      const testCheck = result.automatedChecks.find(c => c.type === "test");
      expect(testCheck).toBeUndefined();
    });
  });

  // ============================================================================
  // Autonomous Verification Tests
  // ============================================================================

  describe("buildAutonomousVerificationPrompt", () => {
    const mockFeature: Feature = {
      id: "test.autonomous",
      description: "Test autonomous verification",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: ["Criterion A", "Criterion B"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };

    it("should include feature information in prompt", () => {
      const prompt = buildAutonomousVerificationPrompt(
        "/test/dir",
        mockFeature,
        []
      );

      expect(prompt).toContain("test.autonomous");
      expect(prompt).toContain("Test autonomous verification");
      expect(prompt).toContain("test");
      expect(prompt).toContain("Criterion A");
      expect(prompt).toContain("Criterion B");
    });

    it("should include working directory", () => {
      const prompt = buildAutonomousVerificationPrompt(
        "/my/project/dir",
        mockFeature,
        []
      );

      expect(prompt).toContain("/my/project/dir");
    });

    it("should format acceptance criteria as numbered list", () => {
      const prompt = buildAutonomousVerificationPrompt(
        "/test",
        mockFeature,
        []
      );

      expect(prompt).toContain("1. Criterion A");
      expect(prompt).toContain("2. Criterion B");
    });

    it("should include automated check results when provided", () => {
      const automatedResults: AutomatedCheckResult[] = [
        { type: "test", success: true, output: "", duration: 1000 },
        { type: "lint", success: false, output: "", duration: 500 },
      ];

      const prompt = buildAutonomousVerificationPrompt(
        "/test",
        mockFeature,
        automatedResults
      );

      expect(prompt).toContain("TEST: PASSED");
      expect(prompt).toContain("LINT: FAILED");
      expect(prompt).toContain("1000ms");
      expect(prompt).toContain("500ms");
    });

    it("should show no checks message when no automated results", () => {
      const prompt = buildAutonomousVerificationPrompt(
        "/test",
        mockFeature,
        []
      );

      expect(prompt).toContain("No automated checks were run");
    });

    it("should include JSON output format instructions", () => {
      const prompt = buildAutonomousVerificationPrompt(
        "/test",
        mockFeature,
        []
      );

      expect(prompt).toContain("criteriaResults");
      expect(prompt).toContain("verdict");
      expect(prompt).toContain("pass|fail|needs_review");
    });
  });

  describe("verifyFeatureAutonomous", () => {
    const mockFeature: Feature = {
      id: "test.autonomous",
      description: "Test autonomous verification",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: ["Criterion 1", "Criterion 2"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };

    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});

      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "autonomous123\n" };
        }
        return { stdout: "" };
      });

      mockDetectCapabilities.mockResolvedValue({
        hasTests: false,
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      });

      mockSaveResult.mockResolvedValue(undefined);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should complete autonomous verification with successful AI response", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            {
              index: 0,
              criterion: "Criterion 1",
              satisfied: true,
              reasoning: "Found in src/file.ts:10",
              evidence: ["src/file.ts:10"],
              confidence: 0.9,
            },
            {
              index: 1,
              criterion: "Criterion 2",
              satisfied: true,
              reasoning: "Tests exist",
              evidence: ["tests/file.test.ts:20"],
              confidence: 0.85,
            },
          ],
          verdict: "pass",
          overallReasoning: "All criteria satisfied",
          suggestions: [],
          codeQualityNotes: [],
        }),
        agentUsed: "codex",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature);

      expect(result.featureId).toBe("test.autonomous");
      expect(result.verdict).toBe("pass");
      expect(result.verifiedBy).toBe("codex");
      expect(result.criteriaResults).toHaveLength(2);
      expect(result.criteriaResults[0].satisfied).toBe(true);
      expect(result.criteriaResults[1].satisfied).toBe(true);
      expect(result.diffSummary).toContain("Autonomous");
      expect(mockSaveResult).toHaveBeenCalled();
    });

    it("should handle AI response in markdown code block", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: "```json\n" + JSON.stringify({
          criteriaResults: [
            { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
            { index: 1, criterion: "Criterion 2", satisfied: false, reasoning: "Missing", evidence: [], confidence: 0.8 },
          ],
          verdict: "fail",
          overallReasoning: "One criterion failed",
          suggestions: ["Add test coverage"],
          codeQualityNotes: [],
        }) + "\n```",
        agentUsed: "claude",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature);

      expect(result.verdict).toBe("fail");
      expect(result.criteriaResults[0].satisfied).toBe(true);
      expect(result.criteriaResults[1].satisfied).toBe(false);
    });

    it("should handle malformed JSON response", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: "This is not valid JSON { broken",
        agentUsed: "gemini",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature);

      expect(result.verdict).toBe("needs_review");
      expect(result.criteriaResults).toHaveLength(2);
      result.criteriaResults.forEach(cr => {
        expect(cr.satisfied).toBe(false);
        expect(cr.reasoning).toContain("Failed to parse");
      });
    });

    it("should handle missing criteria in response", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            // Only index 0, missing index 1
            { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
          ],
          verdict: "pass",
          overallReasoning: "Partial",
          suggestions: [],
          codeQualityNotes: [],
        }),
        agentUsed: "claude",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature);

      expect(result.criteriaResults).toHaveLength(2);
      expect(result.criteriaResults[0].satisfied).toBe(true);
      expect(result.criteriaResults[1].satisfied).toBe(false);
      expect(result.criteriaResults[1].reasoning).toContain("not analyzed");
    });

    it("should skip automated checks with skipChecks option", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
            { index: 1, criterion: "Criterion 2", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
          ],
          verdict: "pass",
          overallReasoning: "Done",
          suggestions: [],
          codeQualityNotes: [],
        }),
        agentUsed: "claude",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(result.automatedChecks).toEqual([]);
      expect(mockDetectCapabilities).not.toHaveBeenCalled();
    });

    it("should run automated checks when not skipped", async () => {
      mockDetectCapabilities.mockResolvedValue({
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      });

      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "commit123\n" };
        }
        if (cmd === "npm test") {
          return { stdout: "tests passed" };
        }
        return { stdout: "" };
      });

      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
            { index: 1, criterion: "Criterion 2", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
          ],
          verdict: "pass",
          overallReasoning: "Done",
          suggestions: [],
          codeQualityNotes: [],
        }),
        agentUsed: "claude",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature);

      expect(result.automatedChecks).toHaveLength(1);
      expect(result.automatedChecks[0].type).toBe("test");
    });

    it("should handle AI failure with needs_review verdict", async () => {
      mockCallAgent.mockResolvedValue({
        success: false,
        error: "Agent unavailable",
        output: "",
        agentUsed: "none",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(result.verdict).toBe("needs_review");
      expect(result.verifiedBy).toBe("none");
      result.criteriaResults.forEach(cr => {
        expect(cr.satisfied).toBe(false);
        expect(cr.reasoning).toContain("AI exploration failed");
      });
    });

    it("should retry on transient errors", async () => {
      let callCount = 0;
      mockCallAgent.mockImplementation(() => {
        callCount++;
        if (callCount < 3) {
          return Promise.resolve({
            success: false,
            error: "timeout",
            output: "",
            agentUsed: "claude",
          });
        }
        return Promise.resolve({
          success: true,
          output: JSON.stringify({
            criteriaResults: [
              { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
              { index: 1, criterion: "Criterion 2", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
            ],
            verdict: "pass",
            overallReasoning: "Done",
            suggestions: [],
            codeQualityNotes: [],
          }),
          agentUsed: "claude",
        });
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(callCount).toBe(3);
      expect(result.verdict).toBe("pass");
    });

    it("should not retry on permanent errors", async () => {
      let callCount = 0;
      mockCallAgent.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: false,
          error: "Invalid API key",
          output: "",
          agentUsed: "claude",
        });
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(callCount).toBe(1);
      expect(result.verdict).toBe("needs_review");
    });

    it("should fail after max retries exhausted", async () => {
      let callCount = 0;
      mockCallAgent.mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          success: false,
          error: "network error",
          output: "",
          agentUsed: "claude",
        });
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(callCount).toBe(RETRY_CONFIG.maxRetries);
      expect(result.verdict).toBe("needs_review");
      expect(result.overallReasoning).toContain("failed after retries");
    });

    it("should get commit hash from git", async () => {
      setExecMock((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return { stdout: "mycommithash456\n" };
        }
        return { stdout: "" };
      });

      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
            { index: 1, criterion: "Criterion 2", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
          ],
          verdict: "pass",
          overallReasoning: "Done",
          suggestions: [],
          codeQualityNotes: [],
        }),
        agentUsed: "claude",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(result.commitHash).toBe("mycommithash456");
    });

    it("should handle git errors gracefully", async () => {
      setExecMockWithErrors((cmd: string) => {
        if (cmd.includes("rev-parse HEAD")) {
          return new Error("Not a git repository");
        }
        return { stdout: "" };
      });

      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
            { index: 1, criterion: "Criterion 2", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
          ],
          verdict: "pass",
          overallReasoning: "Done",
          suggestions: [],
          codeQualityNotes: [],
        }),
        agentUsed: "claude",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(result.commitHash).toBe("unknown");
      expect(result.verdict).toBe("pass");
    });

    it("should handle response with missing optional fields", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            { index: 0, satisfied: true }, // Missing many fields
          ],
          verdict: "pass",
        }),
        agentUsed: "claude",
      });

      const result = await verifyFeatureAutonomous(testDir, mockFeature, {
        skipChecks: true,
      });

      expect(result.verdict).toBe("pass");
      expect(result.criteriaResults[0].reasoning).toBe("No reasoning provided");
      expect(result.criteriaResults[0].evidence).toEqual([]);
      expect(result.criteriaResults[0].confidence).toBe(0.5);
    });

    it("should save verification result", async () => {
      mockCallAgent.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          criteriaResults: [
            { index: 0, criterion: "Criterion 1", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
            { index: 1, criterion: "Criterion 2", satisfied: true, reasoning: "OK", evidence: [], confidence: 0.9 },
          ],
          verdict: "pass",
          overallReasoning: "Done",
          suggestions: [],
          codeQualityNotes: [],
        }),
        agentUsed: "claude",
      });

      await verifyFeatureAutonomous(testDir, mockFeature, { skipChecks: true });

      expect(mockSaveResult).toHaveBeenCalledWith(
        testDir,
        expect.objectContaining({
          featureId: "test.autonomous",
          verdict: "pass",
        })
      );
    });

    it("should save result even on failure", async () => {
      mockCallAgent.mockResolvedValue({
        success: false,
        error: "permanent error",
        output: "",
        agentUsed: "none",
      });

      await verifyFeatureAutonomous(testDir, mockFeature, { skipChecks: true });

      expect(mockSaveResult).toHaveBeenCalledWith(
        testDir,
        expect.objectContaining({
          featureId: "test.autonomous",
          verdict: "needs_review",
        })
      );
    });
  });

  // ============================================================================
  // E2E Integration Tests for runAutomatedChecks
  // ============================================================================

  describe("runAutomatedChecks - E2E integration", () => {
    it("should include E2E check when e2eInfo is provided with smoke mode", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        e2eInfo: {
          available: true,
          framework: "playwright",
          command: "npx playwright test",
          grepTemplate: "npx playwright test --grep {tags}",
        },
        e2eMode: "smoke",
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      // Should have test + e2e checks
      const e2eCheck = results.find(r => r.type === "e2e");
      expect(e2eCheck).toBeDefined();
      expect(commands.some(cmd => cmd.includes("playwright") && cmd.includes("@smoke"))).toBe(true);
    });

    it("should run full E2E tests when e2eMode is full", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        e2eInfo: {
          available: true,
          framework: "playwright",
          command: "npx playwright test",
          grepTemplate: "npx playwright test --grep {tags}",
        },
        e2eMode: "full",
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      const e2eCheck = results.find(r => r.type === "e2e");
      expect(e2eCheck).toBeDefined();
      // Full mode should run without grep filter
      expect(commands.some(cmd => cmd === "npx playwright test")).toBe(true);
    });

    it("should skip E2E tests when skipE2E is true", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        e2eInfo: {
          available: true,
          framework: "playwright",
          command: "npx playwright test",
        },
        skipE2E: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      const e2eCheck = results.find(r => r.type === "e2e");
      expect(e2eCheck).toBeUndefined();
      expect(commands.every(cmd => !cmd.includes("playwright"))).toBe(true);
    });

    it("should use e2eTags when provided in tags mode", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        e2eInfo: {
          available: true,
          framework: "playwright",
          command: "npx playwright test",
          grepTemplate: "npx playwright test --grep {tags}",
        },
        e2eTags: ["@auth", "@login"],
        e2eMode: "tags",
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      const e2eCheck = results.find(r => r.type === "e2e");
      expect(e2eCheck).toBeDefined();
      expect(commands.some(cmd => cmd.includes("--grep") && cmd.includes("@auth|@login"))).toBe(true);
    });

    it("should handle E2E test failure separately", async () => {
      setExecMock((cmd: string) => {
        if (cmd.includes("playwright")) {
          const error = new Error("E2E tests failed") as Error & { stdout: string; stderr: string };
          error.stdout = "";
          error.stderr = "Test failed";
          throw error;
        }
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        e2eInfo: {
          available: true,
          framework: "playwright",
          command: "npx playwright test",
        },
        e2eMode: "full",
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      const e2eCheck = results.find(r => r.type === "e2e");
      expect(e2eCheck).toBeDefined();
      expect(e2eCheck?.success).toBe(false);

      // Unit tests should still pass
      const testCheck = results.find(r => r.type === "test");
      expect(testCheck?.success).toBe(true);
    });

    it("should not include E2E check when e2eInfo is not available", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        e2eInfo: {
          available: false,
        },
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      const e2eCheck = results.find(r => r.type === "e2e");
      expect(e2eCheck).toBeUndefined();
    });

    it("should use default smoke mode when no e2eMode specified", async () => {
      const commands: string[] = [];
      setExecMock((cmd: string) => {
        commands.push(cmd);
        return { stdout: "success" };
      });

      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const options: AutomatedCheckOptions = {
        e2eInfo: {
          available: true,
          framework: "playwright",
          command: "npx playwright test",
          grepTemplate: "npx playwright test --grep {tags}",
        },
        // No e2eMode specified - should default based on testMode
      };

      const results = await runAutomatedChecks(testDir, capabilities, options);

      const e2eCheck = results.find(r => r.type === "e2e");
      expect(e2eCheck).toBeDefined();
    });
  });
});
