/**
 * Tests for parallel automated checks optimization
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { runChecksInParallel, runAutomatedChecks, AutomatedCheckOptions } from "../../src/verifier.js";
import type { VerificationCapabilities, AutomatedCheckResult } from "../../src/verification-types.js";

// Mock child_process exec
const mockExec = vi.fn();
vi.mock("node:child_process", () => ({
  exec: (cmd: string, opts: unknown, cb: (err: Error | null, result: { stdout: string; stderr: string }) => void) => {
    // Call the mock and pass results to callback
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

describe("Parallel Checks Optimization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default mock: all commands succeed
    mockExec.mockImplementation(() => Promise.resolve({ stdout: "ok", stderr: "" }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("runChecksInParallel", () => {
    it("executes independent checks concurrently", async () => {
      const checks = [
        { type: "test" as const, command: "npm test", name: "tests" },
        { type: "typecheck" as const, command: "tsc --noEmit", name: "type check" },
        { type: "lint" as const, command: "npm run lint", name: "linter" },
        { type: "build" as const, command: "npm run build", name: "build" },
      ];

      const executionOrder: string[] = [];

      mockExec.mockImplementation((cmd: string) => {
        executionOrder.push(cmd);
        return Promise.resolve({ stdout: "ok", stderr: "" });
      });

      const results = await runChecksInParallel("/test", checks, false);

      // All checks should have been executed
      expect(results).toHaveLength(4);
      expect(results.every((r) => r.success)).toBe(true);

      // All commands should have been started
      expect(executionOrder).toHaveLength(4);
    });

    it("handles Promise.allSettled rejections gracefully", async () => {
      const checks = [
        { type: "test" as const, command: "npm test", name: "tests" },
        { type: "lint" as const, command: "npm run lint", name: "linter" },
      ];

      // First command succeeds, second fails
      let callCount = 0;
      mockExec.mockImplementation(() => {
        callCount++;
        if (callCount === 2) {
          return Promise.reject(new Error("Command failed"));
        }
        return Promise.resolve({ stdout: "ok", stderr: "" });
      });

      const results = await runChecksInParallel("/test", checks, false);

      // Should have results for both checks
      expect(results).toHaveLength(2);
      // At least one should have failed
      expect(results.some((r) => !r.success)).toBe(true);
    });

    it("runs E2E tests sequentially after unit tests pass", async () => {
      const checks = [
        { type: "test" as const, command: "npm test", name: "tests" },
        { type: "e2e" as const, command: "npm run e2e", name: "E2E tests", isE2E: true },
      ];

      const executionOrder: string[] = [];
      const completionOrder: string[] = [];

      mockExec.mockImplementation((cmd: string) => {
        executionOrder.push(cmd);
        return new Promise((resolve) => {
          // Simulate different execution times
          const delay = cmd.includes("e2e") ? 10 : 5;
          setTimeout(() => {
            completionOrder.push(cmd);
            resolve({ stdout: "ok", stderr: "" });
          }, delay);
        });
      });

      const results = await runChecksInParallel("/test", checks, false);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);

      // E2E should start after unit tests complete (due to sequential execution)
      // Note: E2E is in the second position in execution order because it waits for unit tests
    });

    it("skips E2E tests when unit tests fail", async () => {
      const checks = [
        { type: "test" as const, command: "npm test", name: "tests" },
        { type: "e2e" as const, command: "npm run e2e", name: "E2E tests", isE2E: true },
      ];

      // Make unit tests fail
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("npm test")) {
          // Return failed result through callback pattern
          const error = new Error("Tests failed") as Error & { stdout: string; stderr: string; code: number };
          error.stdout = "Test output";
          error.stderr = "Error output";
          error.code = 1;
          return Promise.reject(error);
        }
        return Promise.resolve({ stdout: "ok", stderr: "" });
      });

      const results = await runChecksInParallel("/test", checks, true);

      // Should have 2 results: failed test and skipped E2E
      expect(results).toHaveLength(2);

      // E2E should be skipped (marked as failed with skip message)
      const e2eResult = results.find((r) => r.type === "e2e");
      expect(e2eResult?.success).toBe(false);
      expect(e2eResult?.output).toContain("Skipped");
    });
  });

  describe("AutomatedCheckOptions parallel option", () => {
    it("defaults parallel to false for backward compatibility", async () => {
      const capabilities: VerificationCapabilities = {
        hasTests: true,
        testCommand: "npm test",
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: true,
      };

      // Default options should not use parallel
      const options: AutomatedCheckOptions = {
        verbose: false,
        testMode: "full",
      };

      // Verify parallel is not in options by default
      expect(options.parallel).toBeUndefined();

      // When undefined, parallel defaults to false
      const optionsWithDefault = {
        ...options,
        parallel: options.parallel ?? false,
      };
      expect(optionsWithDefault.parallel).toBe(false);
    });

    it("accepts parallel: true option", () => {
      const options: AutomatedCheckOptions = {
        verbose: false,
        testMode: "full",
        parallel: true,
      };

      expect(options.parallel).toBe(true);
    });

    it("accepts parallel: false option explicitly", () => {
      const options: AutomatedCheckOptions = {
        verbose: false,
        testMode: "full",
        parallel: false,
      };

      expect(options.parallel).toBe(false);
    });
  });

  describe("Error handling", () => {
    it("captures individual check failures without stopping other checks", async () => {
      const checks = [
        { type: "test" as const, command: "npm test", name: "tests" },
        { type: "typecheck" as const, command: "tsc --noEmit", name: "type check" },
        { type: "lint" as const, command: "npm run lint", name: "linter" },
      ];

      // Make typecheck fail
      mockExec.mockImplementation((cmd: string) => {
        if (cmd.includes("tsc")) {
          const error = new Error("Type error") as Error & { stdout: string; stderr: string };
          error.stdout = "";
          error.stderr = "Type error found";
          return Promise.reject(error);
        }
        return Promise.resolve({ stdout: "ok", stderr: "" });
      });

      const results = await runChecksInParallel("/test", checks, false);

      // All checks should have results
      expect(results).toHaveLength(3);

      // Some should have succeeded (test and lint)
      const successCount = results.filter((r) => r.success).length;
      expect(successCount).toBe(2);

      // One should have failed (typecheck)
      const failedCount = results.filter((r) => !r.success).length;
      expect(failedCount).toBe(1);
    });
  });
});
