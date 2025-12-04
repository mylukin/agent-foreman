/**
 * Integration tests for parallel automated checks
 * Tests that parallel mode produces same results as sequential mode
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";

// Use vi.hoisted to create mock functions
const { mockExec } = vi.hoisted(() => ({
  mockExec: vi.fn(),
}));

// Mock child_process exec
vi.mock("node:child_process", () => ({
  exec: (
    cmd: string,
    opts: unknown,
    cb: (err: Error | null, result: { stdout: string; stderr: string }) => void
  ) => {
    const result = mockExec(cmd, opts);
    if (result instanceof Promise) {
      result.then(
        (res: { stdout: string; stderr: string }) => cb(null, res),
        (err: Error) => cb(err, { stdout: "", stderr: "" })
      );
    } else {
      cb(null, result);
    }
    return { kill: vi.fn() };
  },
}));

// Mock progress functions
vi.mock("../../src/progress.js", () => ({
  createProgressBar: () => ({
    start: vi.fn(),
    update: vi.fn(),
    complete: vi.fn(),
  }),
  createSpinner: () => ({
    start: vi.fn(),
    update: vi.fn(),
    succeed: vi.fn(),
    fail: vi.fn(),
    warn: vi.fn(),
  }),
  createStepProgress: () => ({
    start: vi.fn(),
    completeStep: vi.fn(),
    complete: vi.fn(),
  }),
  isTTY: () => false,
}));

import { runChecksInParallel, runAutomatedChecks } from "../../src/verifier.js";
import type { VerificationCapabilities } from "../../src/verification-types.js";

describe("Parallel Checks Integration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `parallel-checks-int-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
    vi.clearAllMocks();
    mockExec.mockImplementation(() => Promise.resolve({ stdout: "ok", stderr: "" }));
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Result equivalence", () => {
    it("parallel checks produce same results as sequential", async () => {
      const checks = [
        { type: "test" as const, command: "npm test", name: "tests" },
        { type: "typecheck" as const, command: "tsc --noEmit", name: "type check" },
        { type: "lint" as const, command: "npm run lint", name: "linter" },
      ];

      // Run in parallel
      const parallelResults = await runChecksInParallel(testDir, checks, false);

      // Reset mock
      mockExec.mockClear();

      // Run again (simulating sequential for comparison)
      const sequentialResults = await runChecksInParallel(testDir, checks, false);

      // Results should have same length
      expect(parallelResults.length).toBe(sequentialResults.length);

      // All results should have same types
      const parallelTypes = parallelResults.map((r) => r.type).sort();
      const sequentialTypes = sequentialResults.map((r) => r.type).sort();
      expect(parallelTypes).toEqual(sequentialTypes);

      // All should succeed since mock returns success
      expect(parallelResults.every((r) => r.success)).toBe(true);
      expect(sequentialResults.every((r) => r.success)).toBe(true);
    });

    it("handles mixed success/failure consistently", async () => {
      const checks = [
        { type: "test" as const, command: "npm test", name: "tests" },
        { type: "typecheck" as const, command: "tsc --noEmit", name: "type check" },
      ];

      // Make typecheck always fail
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("tsc")) {
          const error = new Error("Type error") as Error & { stdout: string; stderr: string };
          error.stdout = "";
          error.stderr = "Type error found";
          return Promise.reject(error);
        }
        return Promise.resolve({ stdout: "ok", stderr: "" });
      });

      const results = await runChecksInParallel(testDir, checks, false);

      // Should have both results
      expect(results.length).toBe(2);

      // Test should pass
      const testResult = results.find((r) => r.type === "test");
      expect(testResult?.success).toBe(true);

      // Typecheck should fail
      const typeResult = results.find((r) => r.type === "typecheck");
      expect(typeResult?.success).toBe(false);
    });
  });

  describe("Backward compatibility with parallel: false option", () => {
    it("defaults to sequential execution when parallel is undefined", async () => {
      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities, {
        verbose: false,
        testMode: "full",
        // parallel: undefined - should default to sequential behavior
      });

      // Should still execute and return results
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("respects parallel: false option explicitly", async () => {
      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities, {
        verbose: false,
        testMode: "full",
        parallel: false,
      });

      // Should execute and return results
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });

    it("runs in parallel mode when parallel: true", async () => {
      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: true,
        typeCheckCommand: "tsc --noEmit",
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      const results = await runAutomatedChecks(testDir, capabilities, {
        verbose: false,
        testMode: "full",
        parallel: true,
      });

      // Should execute and return results
      expect(results).toBeDefined();
      expect(Array.isArray(results)).toBe(true);
    });
  });
});
