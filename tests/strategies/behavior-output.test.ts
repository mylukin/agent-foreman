/**
 * Tests for behavior-strategy/output.ts
 */
import { describe, it, expect } from "vitest";

import {
  formatBehaviorOutput,
  formatCompactSummary,
  formatViolationsJson,
} from "../../src/strategies/behavior-strategy/output.js";
import type { BehaviorVerificationResult } from "../../src/strategies/behavior-strategy/types.js";
import type { AntiPatternMatch, DetectionResult } from "../../src/anti-patterns/types.js";

// Helper to create a mock violation
function createMockViolation(overrides: Partial<AntiPatternMatch> = {}): AntiPatternMatch {
  return {
    pattern: {
      id: "test-pattern",
      description: "Test pattern description",
      category: "file-reading",
      severity: "critical",
      detectionPatterns: [/test/],
      remediation: "Fix the issue",
    },
    matchedText: "test matched text",
    lineNumber: 1,
    timestamp: new Date("2025-01-18T12:00:00Z"),
    ...overrides,
  };
}

// Helper to create a mock detection result
function createMockDetectionResult(overrides: Partial<DetectionResult> = {}): DetectionResult {
  return {
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
    ...overrides,
  };
}

// Helper to create a mock behavior result
function createMockResult(overrides: Partial<BehaviorVerificationResult> = {}): BehaviorVerificationResult {
  return {
    passed: true,
    summary: "No workflow violations detected",
    criticalViolations: [],
    warningViolations: [],
    infoNotices: [],
    remediations: [],
    detectionResult: createMockDetectionResult(),
    ...overrides,
  };
}

describe("behavior-strategy/output", () => {
  describe("formatBehaviorOutput", () => {
    it("should format passed result correctly", () => {
      const result = createMockResult({
        passed: true,
        summary: "No workflow violations detected",
      });

      const output = formatBehaviorOutput(result);

      expect(output).toContain("✓ PASSED");
      expect(output).toContain("No workflow violations detected");
    });

    it("should format failed result correctly", () => {
      const result = createMockResult({
        passed: false,
        summary: "1 critical violation found",
      });

      const output = formatBehaviorOutput(result);

      expect(output).toContain("✗ FAILED");
      expect(output).toContain("1 critical violation found");
    });

    it("should include critical violations", () => {
      const violation = createMockViolation({
        pattern: {
          id: "critical-test",
          description: "Critical test violation",
          category: "workflow-bypass",
          severity: "critical",
          detectionPatterns: [/test/],
          remediation: "Use CLI command",
        },
        matchedText: "test text",
        lineNumber: 5,
      });

      const result = createMockResult({
        passed: false,
        criticalViolations: [violation],
      });

      const output = formatBehaviorOutput(result);

      expect(output).toContain("CRITICAL Violations:");
      expect(output).toContain("Critical test violation");
      expect(output).toContain("Line: 5");
      expect(output).toContain("Use CLI command");
    });

    it("should include warning violations", () => {
      const warning = createMockViolation({
        pattern: {
          id: "warning-test",
          description: "Warning test violation",
          category: "status-guess",
          severity: "warning",
          detectionPatterns: [/test/],
          remediation: "Verify status",
        },
        matchedText: "warning text",
        lineNumber: 10,
      });

      const result = createMockResult({
        passed: true,
        warningViolations: [warning],
      });

      const output = formatBehaviorOutput(result);

      expect(output).toContain("Warnings:");
      expect(output).toContain("Warning test violation");
      expect(output).toContain("Verify status");
    });

    it("should include info notices when passed", () => {
      const info = createMockViolation({
        pattern: {
          id: "info-test",
          description: "Info notice",
          category: "algorithm-local",
          severity: "info",
          detectionPatterns: [/test/],
          remediation: "Consider improvement",
        },
        matchedText: "info text",
        lineNumber: 15,
      });

      const result = createMockResult({
        passed: true,
        infoNotices: [info],
      });

      const output = formatBehaviorOutput(result);

      expect(output).toContain("Info:");
      expect(output).toContain("Info notice");
    });

    it("should not include info notices when failed", () => {
      const info = createMockViolation({
        pattern: {
          id: "info-test",
          description: "Info notice",
          category: "algorithm-local",
          severity: "info",
          detectionPatterns: [/test/],
          remediation: "Consider improvement",
        },
      });

      const result = createMockResult({
        passed: false,
        infoNotices: [info],
      });

      const output = formatBehaviorOutput(result);

      expect(output).not.toContain("Info:");
    });

    it("should include remediations when failed", () => {
      const result = createMockResult({
        passed: false,
        remediations: ["Use agent-foreman next", "Run agent-foreman check"],
      });

      const output = formatBehaviorOutput(result);

      expect(output).toContain("Recommended Actions:");
      expect(output).toContain("Use agent-foreman next");
      expect(output).toContain("Run agent-foreman check");
    });

    it("should not include remediations when passed", () => {
      const result = createMockResult({
        passed: true,
        remediations: ["Some action"],
      });

      const output = formatBehaviorOutput(result);

      expect(output).not.toContain("Recommended Actions:");
    });

    it("should truncate long matched text", () => {
      const longText = "a".repeat(100);
      const violation = createMockViolation({
        matchedText: longText,
      });

      const result = createMockResult({
        passed: false,
        criticalViolations: [violation],
      });

      const output = formatBehaviorOutput(result);

      expect(output).toContain("...");
      expect(output).not.toContain(longText);
    });

    it("should handle violation without line number", () => {
      const violation = createMockViolation({
        lineNumber: undefined,
      });

      const result = createMockResult({
        passed: false,
        criticalViolations: [violation],
      });

      const output = formatBehaviorOutput(result);

      expect(output).not.toContain("Line:");
    });
  });

  describe("formatCompactSummary", () => {
    it("should format passed summary correctly", () => {
      const result = createMockResult({
        passed: true,
        detectionResult: createMockDetectionResult({
          bySeverity: { critical: 0, warning: 0, info: 0 },
        }),
      });

      const summary = formatCompactSummary(result);

      expect(summary).toBe("Behavior: PASS");
    });

    it("should format failed summary correctly", () => {
      const result = createMockResult({
        passed: false,
        detectionResult: createMockDetectionResult({
          bySeverity: { critical: 0, warning: 0, info: 0 },
        }),
      });

      const summary = formatCompactSummary(result);

      expect(summary).toBe("Behavior: FAIL");
    });

    it("should include critical count", () => {
      const result = createMockResult({
        passed: false,
        detectionResult: createMockDetectionResult({
          bySeverity: { critical: 2, warning: 0, info: 0 },
        }),
      });

      const summary = formatCompactSummary(result);

      expect(summary).toContain("2 critical");
    });

    it("should include warning count", () => {
      const result = createMockResult({
        passed: true,
        detectionResult: createMockDetectionResult({
          bySeverity: { critical: 0, warning: 3, info: 0 },
        }),
      });

      const summary = formatCompactSummary(result);

      expect(summary).toContain("3 warnings");
    });

    it("should include both critical and warnings", () => {
      const result = createMockResult({
        passed: false,
        detectionResult: createMockDetectionResult({
          bySeverity: { critical: 1, warning: 2, info: 0 },
        }),
      });

      const summary = formatCompactSummary(result);

      expect(summary).toContain("1 critical");
      expect(summary).toContain("2 warnings");
    });
  });

  describe("formatViolationsJson", () => {
    it("should format result as JSON", () => {
      const criticalViolation = createMockViolation({
        pattern: {
          id: "critical-1",
          description: "Critical violation",
          category: "file-reading",
          severity: "critical",
          detectionPatterns: [/test/],
          remediation: "Fix it",
        },
      });

      const warningViolation = createMockViolation({
        pattern: {
          id: "warning-1",
          description: "Warning violation",
          category: "status-guess",
          severity: "warning",
          detectionPatterns: [/test/],
          remediation: "Review it",
        },
      });

      const result = createMockResult({
        passed: false,
        summary: "Violations found",
        criticalViolations: [criticalViolation],
        warningViolations: [warningViolation],
        infoNotices: [],
        remediations: ["Action 1", "Action 2"],
        detectionResult: createMockDetectionResult({
          bySeverity: { critical: 1, warning: 1, info: 0 },
          byCategory: {
            "workflow-bypass": 0,
            "file-reading": 1,
            "manual-edit": 0,
            "algorithm-local": 0,
            "status-guess": 1,
          },
        }),
      });

      const json = formatViolationsJson(result);

      expect(json.passed).toBe(false);
      expect(json.summary).toBe("Violations found");
      expect((json.violations as Record<string, unknown[]>).critical).toHaveLength(1);
      expect((json.violations as Record<string, unknown[]>).warning).toHaveLength(1);
      expect((json.violations as Record<string, unknown[]>).info).toHaveLength(0);
      expect(json.remediations).toEqual(["Action 1", "Action 2"]);
      expect(json.counts).toEqual({ critical: 1, warning: 1, info: 0 });
    });

    it("should include violation details in JSON", () => {
      const violation = createMockViolation({
        pattern: {
          id: "test-id",
          description: "Test description",
          category: "file-reading",
          severity: "critical",
          detectionPatterns: [/test/],
          remediation: "Test remediation",
        },
        matchedText: "matched",
        lineNumber: 42,
        timestamp: new Date("2025-01-18T12:00:00Z"),
      });

      const result = createMockResult({
        criticalViolations: [violation],
      });

      const json = formatViolationsJson(result);
      const criticalList = (json.violations as Record<string, unknown[]>).critical;
      const firstViolation = criticalList[0] as Record<string, unknown>;

      expect(firstViolation.id).toBe("test-id");
      expect(firstViolation.description).toBe("Test description");
      expect(firstViolation.category).toBe("file-reading");
      expect(firstViolation.severity).toBe("critical");
      expect(firstViolation.matchedText).toBe("matched");
      expect(firstViolation.lineNumber).toBe(42);
      expect(firstViolation.remediation).toBe("Test remediation");
      expect(firstViolation.timestamp).toBe("2025-01-18T12:00:00.000Z");
    });
  });
});
