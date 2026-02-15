/**
 * Tests for behavior-check.ts
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fsPromises from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";

import {
  runBehaviorCheck,
  displayBehaviorCheckResult,
  formatBehaviorCheckForTask,
  type BehaviorCheckResult,
} from "../../src/verifier/behavior-check.js";
import { initializeAntiPatterns } from "../../src/anti-patterns/index.js";

describe("behavior-check", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fsPromises.mkdtemp(path.join(tmpdir(), "behavior-check-test-"));
    // Initialize anti-patterns before tests
    initializeAntiPatterns();
  });

  afterEach(async () => {
    await fsPromises.rm(testDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("runBehaviorCheck", () => {
    it("should return passed when log file does not exist", async () => {
      const result = await runBehaviorCheck(testDir);

      expect(result.passed).toBe(true);
      expect(result.logFound).toBe(false);
      expect(result.linesAnalyzed).toBe(0);
      expect(result.detectionResult.hasViolations).toBe(false);
      expect(result.detectionResult.summary).toBe("No progress log found");
    });

    it("should return passed when log file is empty", async () => {
      // Create empty progress.log
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), "");

      const result = await runBehaviorCheck(testDir);

      expect(result.passed).toBe(true);
      expect(result.logFound).toBe(true);
      expect(result.linesAnalyzed).toBe(0);
      expect(result.detectionResult.summary).toBe("Progress log is empty");
    });

    it("should return passed when log file has whitespace only", async () => {
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), "   \n  \n  ");

      const result = await runBehaviorCheck(testDir);

      expect(result.passed).toBe(true);
      expect(result.logFound).toBe(true);
      expect(result.linesAnalyzed).toBe(0);
    });

    it("should detect violations in log content", async () => {
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      const logContent = `2025-01-18T10:00:00Z STEP task=test summary="Let me read ai/tasks/index.json to check status"`;
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), logContent);

      const result = await runBehaviorCheck(testDir);

      expect(result.logFound).toBe(true);
      expect(result.linesAnalyzed).toBe(1);
      expect(result.detectionResult.hasViolations).toBe(true);
      expect(result.passed).toBe(false); // Critical violation
    });

    it("should pass when only warning violations exist", async () => {
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      // Content with warning-level pattern only (assume task status)
      const logContent = `2025-01-18T10:00:00Z STEP task=test summary="The task is probably done"`;
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), logContent);

      const result = await runBehaviorCheck(testDir, { minSeverity: "warning" });

      expect(result.logFound).toBe(true);
      // If no critical violations, it should pass
      if (result.detectionResult.bySeverity.critical === 0) {
        expect(result.passed).toBe(true);
      }
    });

    it("should fail when failOnCritical is true and critical violations exist", async () => {
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      const logContent = `2025-01-18T10:00:00Z STEP task=test summary="Read ai/tasks/index.json"`;
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), logContent);

      const result = await runBehaviorCheck(testDir, { failOnCritical: true });

      expect(result.passed).toBe(false);
    });

    it("should pass with violations when failOnCritical is false and no violations", async () => {
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      const logContent = `2025-01-18T10:00:00Z STEP task=test summary="Valid log entry"`;
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), logContent);

      const result = await runBehaviorCheck(testDir, { failOnCritical: false });

      if (!result.detectionResult.hasViolations) {
        expect(result.passed).toBe(true);
      }
    });

    it("should use custom log path", async () => {
      const customLogPath = path.join(testDir, "custom.log");
      await fsPromises.writeFile(customLogPath, "Valid content");

      const result = await runBehaviorCheck(testDir, { logPath: customLogPath });

      expect(result.logPath).toBe(customLogPath);
      expect(result.logFound).toBe(true);
    });

    it("should include context when verbose is true", async () => {
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      const logContent = `Line 1\nRead ai/tasks/index.json\nLine 3`;
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), logContent);

      const result = await runBehaviorCheck(testDir, { verbose: true });

      expect(result.linesAnalyzed).toBe(3);
    });

    it("should count lines correctly", async () => {
      await fsPromises.mkdir(path.join(testDir, "ai"), { recursive: true });
      const logContent = `Line 1\nLine 2\nLine 3\nLine 4\nLine 5`;
      await fsPromises.writeFile(path.join(testDir, "ai", "progress.log"), logContent);

      const result = await runBehaviorCheck(testDir);

      expect(result.linesAnalyzed).toBe(5);
    });
  });

  describe("displayBehaviorCheckResult", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    it("should display message when log not found", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: false,
        linesAnalyzed: 0,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: false,
          violations: [],
          bySeverity: { critical: 0, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "No progress log found",
        },
      };

      displayBehaviorCheckResult(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No progress log found"));
    });

    it("should display message when log is empty", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: true,
        linesAnalyzed: 0,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: false,
          violations: [],
          bySeverity: { critical: 0, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "Progress log is empty",
        },
      };

      displayBehaviorCheckResult(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Progress log is empty"));
    });

    it("should display success when no violations", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: false,
          violations: [],
          bySeverity: { critical: 0, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "No anti-patterns detected",
        },
      };

      displayBehaviorCheckResult(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("No workflow violations detected"));
    });

    it("should display warning count when passed with warnings", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations: [
            {
              pattern: {
                id: "test-warning",
                description: "Test warning",
                category: "status-guess",
                severity: "warning",
                detectionPatterns: [/test/],
                remediation: "Fix it",
              },
              matchedText: "test",
              lineNumber: 1,
              timestamp: new Date(),
            },
          ],
          bySeverity: { critical: 0, warning: 1, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 1,
          },
          summary: "1 warning",
        },
      };

      displayBehaviorCheckResult(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("1 warning(s) detected"));
    });

    it("should display critical violations when failed", () => {
      const result: BehaviorCheckResult = {
        passed: false,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations: [
            {
              pattern: {
                id: "test-critical",
                description: "Test critical violation",
                category: "file-reading",
                severity: "critical",
                detectionPatterns: [/test/],
                remediation: "Use CLI instead",
              },
              matchedText: "test violation",
              lineNumber: 1,
              timestamp: new Date(),
            },
          ],
          bySeverity: { critical: 1, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 1,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "1 critical",
        },
      };

      displayBehaviorCheckResult(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("CRITICAL violation(s) detected"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("CRITICAL WORKFLOW VIOLATIONS"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Test critical violation"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Use CLI instead"));
    });

    it("should truncate matched text in verbose mode", () => {
      const longText = "a".repeat(100);
      const result: BehaviorCheckResult = {
        passed: false,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations: [
            {
              pattern: {
                id: "test-critical",
                description: "Test critical",
                category: "file-reading",
                severity: "critical",
                detectionPatterns: [/test/],
                remediation: "Fix",
              },
              matchedText: longText,
              lineNumber: 1,
              timestamp: new Date(),
            },
          ],
          bySeverity: { critical: 1, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 1,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "1 critical",
        },
      };

      displayBehaviorCheckResult(result, true);

      // Should show truncated text with "..."
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("..."));
    });

    it("should show '... and N more' when more than 3 critical violations", () => {
      const violations = Array.from({ length: 5 }, (_, i) => ({
        pattern: {
          id: `test-critical-${i}`,
          description: `Critical violation ${i}`,
          category: "file-reading" as const,
          severity: "critical" as const,
          detectionPatterns: [/test/],
          remediation: "Fix",
        },
        matchedText: "test",
        lineNumber: i + 1,
        timestamp: new Date(),
      }));

      const result: BehaviorCheckResult = {
        passed: false,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations,
          bySeverity: { critical: 5, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 5,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "5 critical",
        },
      };

      displayBehaviorCheckResult(result);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("... and 2 more"));
    });

    it("should show warnings in verbose mode", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations: [
            {
              pattern: {
                id: "test-warning",
                description: "Warning violation",
                category: "status-guess",
                severity: "warning",
                detectionPatterns: [/test/],
                remediation: "Fix",
              },
              matchedText: "test",
              lineNumber: 1,
              timestamp: new Date(),
            },
          ],
          bySeverity: { critical: 0, warning: 1, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 1,
          },
          summary: "1 warning",
        },
      };

      displayBehaviorCheckResult(result, true);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Warnings:"));
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("Warning violation"));
    });

    it("should show '... and N more' when more than 2 warnings in verbose mode", () => {
      const warnings = Array.from({ length: 4 }, (_, i) => ({
        pattern: {
          id: `test-warning-${i}`,
          description: `Warning ${i}`,
          category: "status-guess" as const,
          severity: "warning" as const,
          detectionPatterns: [/test/],
          remediation: "Fix",
        },
        matchedText: "test",
        lineNumber: i + 1,
        timestamp: new Date(),
      }));

      const result: BehaviorCheckResult = {
        passed: true,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations: warnings,
          bySeverity: { critical: 0, warning: 4, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 4,
          },
          summary: "4 warnings",
        },
      };

      displayBehaviorCheckResult(result, true);

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining("... and 2 more"));
    });
  });

  describe("formatBehaviorCheckForTask", () => {
    it("should format message when log not found", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: false,
        linesAnalyzed: 0,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: false,
          violations: [],
          bySeverity: { critical: 0, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "No progress log found",
        },
      };

      const output = formatBehaviorCheckForTask(result);

      expect(output).toContain("Behavior Analysis");
      expect(output).toContain("No progress log found");
    });

    it("should format success message when no violations", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: false,
          violations: [],
          bySeverity: { critical: 0, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "No anti-patterns detected",
        },
      };

      const output = formatBehaviorCheckForTask(result);

      expect(output).toContain("No workflow violations detected");
    });

    it("should format critical violations when failed", () => {
      const result: BehaviorCheckResult = {
        passed: false,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations: [
            {
              pattern: {
                id: "test-critical",
                description: "Critical violation description",
                category: "file-reading",
                severity: "critical",
                detectionPatterns: [/test/],
                remediation: "Use the CLI command",
              },
              matchedText: "test",
              lineNumber: 1,
              timestamp: new Date(),
            },
          ],
          bySeverity: { critical: 1, warning: 0, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 1,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 0,
          },
          summary: "1 critical",
        },
      };

      const output = formatBehaviorCheckForTask(result);

      expect(output).toContain("1 critical violation(s) found");
      expect(output).toContain("Critical violation description");
      expect(output).toContain("Use the CLI command");
      expect(output).toContain("Review ai/progress.log");
    });

    it("should format warning message when passed with warnings", () => {
      const result: BehaviorCheckResult = {
        passed: true,
        logFound: true,
        linesAnalyzed: 10,
        logPath: "/test/ai/progress.log",
        detectionResult: {
          hasViolations: true,
          violations: [
            {
              pattern: {
                id: "test-warning",
                description: "Warning description",
                category: "status-guess",
                severity: "warning",
                detectionPatterns: [/test/],
                remediation: "Fix",
              },
              matchedText: "test",
              lineNumber: 1,
              timestamp: new Date(),
            },
          ],
          bySeverity: { critical: 0, warning: 2, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 0,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 2,
          },
          summary: "2 warnings",
        },
      };

      const output = formatBehaviorCheckForTask(result);

      expect(output).toContain("2 warning(s) found (non-blocking)");
    });
  });
});
