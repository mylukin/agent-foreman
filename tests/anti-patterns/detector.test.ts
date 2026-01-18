/**
 * Tests for AntiPatternDetector
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AntiPatternDetector } from "../../src/anti-patterns/detector.js";
import { AntiPatternRegistry } from "../../src/anti-patterns/registry.js";
import type { AntiPattern } from "../../src/anti-patterns/types.js";

// Test patterns
const testPatterns: AntiPattern[] = [
  {
    id: "test-workflow-bypass",
    description: "Test workflow bypass",
    category: "workflow-bypass",
    severity: "critical",
    detectionPatterns: [/skip\s+the\s+check/i, /bypass\s+workflow/i],
    remediation: "Don't skip checks",
  },
  {
    id: "test-file-reading",
    description: "Test file reading",
    category: "file-reading",
    severity: "critical",
    detectionPatterns: [/read.*index\.json/i],
    excludePatterns: [/documentation/i],
    remediation: "Use CLI instead",
  },
  {
    id: "test-warning-pattern",
    description: "Test warning",
    category: "status-guess",
    severity: "warning",
    detectionPatterns: [/probably\s+done/i],
    remediation: "Verify with CLI",
  },
  {
    id: "test-info-pattern",
    description: "Test info",
    category: "algorithm-local",
    severity: "info",
    detectionPatterns: [/minor\s+issue/i],
    remediation: "Consider fixing",
  },
  {
    id: "test-context-pattern",
    description: "Test context matching",
    category: "manual-edit",
    severity: "critical",
    detectionPatterns: [/edit\s+status/i],
    contextPatterns: [/task|feature/i],
    remediation: "Use CLI",
  },
];

describe("AntiPatternDetector", () => {
  let registry: AntiPatternRegistry;
  let detector: AntiPatternDetector;

  beforeEach(() => {
    registry = new AntiPatternRegistry();
    registry.registerAll(testPatterns);
    detector = new AntiPatternDetector(registry);
  });

  describe("detect", () => {
    it("should detect violations matching patterns", () => {
      const content = "I'll skip the check since I'm confident";
      const result = detector.detect(content);

      expect(result.hasViolations).toBe(true);
      expect(result.violations).toHaveLength(1);
      expect(result.violations[0].pattern.id).toBe("test-workflow-bypass");
      expect(result.violations[0].matchedText).toBe("skip the check");
    });

    it("should detect multiple violations", () => {
      const content = `
        I'll skip the check and read index.json directly.
        The task is probably done now.
      `;
      const result = detector.detect(content, { minSeverity: "info" });

      expect(result.hasViolations).toBe(true);
      expect(result.violations.length).toBeGreaterThanOrEqual(3);
    });

    it("should respect excludePatterns", () => {
      const content = "See documentation for index.json format";
      const result = detector.detect(content);

      // Should not match because of exclude pattern
      const fileReadingViolations = result.violations.filter(
        (v) => v.pattern.id === "test-file-reading"
      );
      expect(fileReadingViolations).toHaveLength(0);
    });

    it("should respect contextPatterns", () => {
      const contentWithContext = "I'll edit status of the task manually";
      const resultWithContext = detector.detect(contentWithContext);

      // Should match because context pattern matches
      expect(resultWithContext.violations.some((v) => v.pattern.id === "test-context-pattern")).toBe(
        true
      );

      // Without context word, should not match
      const contentWithoutContext = "I'll edit status in the database";
      const resultWithoutContext = detector.detect(contentWithoutContext);

      const contextViolations = resultWithoutContext.violations.filter(
        (v) => v.pattern.id === "test-context-pattern"
      );
      expect(contextViolations).toHaveLength(0);
    });

    it("should filter by minSeverity", () => {
      const content = `
        skip the check (critical)
        probably done (warning)
        minor issue (info)
      `;

      // Critical only
      const criticalResult = detector.detect(content, { minSeverity: "critical" });
      expect(criticalResult.violations.every((v) => v.pattern.severity === "critical")).toBe(true);

      // Warning and above
      const warningResult = detector.detect(content, { minSeverity: "warning" });
      expect(
        warningResult.violations.every(
          (v) => v.pattern.severity === "critical" || v.pattern.severity === "warning"
        )
      ).toBe(true);

      // All severities
      const allResult = detector.detect(content, { minSeverity: "info" });
      expect(allResult.bySeverity.info).toBeGreaterThan(0);
    });

    it("should filter by categories", () => {
      const content = `
        skip the check (workflow-bypass)
        read index.json (file-reading)
      `;

      const result = detector.detect(content, { categories: ["workflow-bypass"] });

      expect(result.violations.every((v) => v.pattern.category === "workflow-bypass")).toBe(true);
    });

    it("should include context when requested", () => {
      const content = `Line 1
Line 2
skip the check
Line 4
Line 5`;

      const resultWithContext = detector.detect(content, {
        includeContext: true,
        contextLines: 1,
      });

      expect(resultWithContext.violations[0].context).toBeDefined();
      expect(resultWithContext.violations[0].context).toContain("Line 2");
      expect(resultWithContext.violations[0].context).toContain("Line 4");
    });

    it("should include line numbers", () => {
      const content = `Line 1
Line 2
skip the check
Line 4`;

      const result = detector.detect(content);

      expect(result.violations[0].lineNumber).toBe(3);
    });

    it("should return correct severity counts", () => {
      const content = `
        skip the check (critical)
        bypass workflow (critical)
        probably done (warning)
      `;

      const result = detector.detect(content, { minSeverity: "info" });

      expect(result.bySeverity.critical).toBe(2);
      expect(result.bySeverity.warning).toBe(1);
    });

    it("should return correct category counts", () => {
      const content = `
        skip the check (workflow-bypass)
        bypass workflow (workflow-bypass)
        probably done (status-guess)
      `;

      const result = detector.detect(content, { minSeverity: "info" });

      expect(result.byCategory["workflow-bypass"]).toBe(2);
      expect(result.byCategory["status-guess"]).toBe(1);
    });

    it("should generate summary", () => {
      const content = "skip the check and bypass workflow";
      const result = detector.detect(content);

      expect(result.summary).toContain("2 anti-pattern");
      expect(result.summary).toContain("critical");
    });

    it("should handle no violations", () => {
      const content = "This is perfectly valid behavior";
      const result = detector.detect(content);

      expect(result.hasViolations).toBe(false);
      expect(result.violations).toHaveLength(0);
      expect(result.summary).toBe("No anti-patterns detected");
    });
  });

  describe("detectPattern", () => {
    it("should detect a specific pattern", () => {
      const content = "I'll skip the check";
      const matches = detector.detectPattern(content, "test-workflow-bypass");

      expect(matches).toHaveLength(1);
      expect(matches[0].pattern.id).toBe("test-workflow-bypass");
    });

    it("should return empty array for non-matching pattern", () => {
      const content = "Valid content";
      const matches = detector.detectPattern(content, "test-workflow-bypass");

      expect(matches).toHaveLength(0);
    });

    it("should return empty array for unknown pattern ID", () => {
      const content = "skip the check";
      const matches = detector.detectPattern(content, "nonexistent");

      expect(matches).toHaveLength(0);
    });
  });

  describe("hasViolations", () => {
    it("should return true when violations exist", () => {
      const content = "skip the check";
      expect(detector.hasViolations(content)).toBe(true);
    });

    it("should return false when no violations", () => {
      const content = "Valid content";
      expect(detector.hasViolations(content)).toBe(false);
    });

    it("should respect minSeverity", () => {
      const content = "probably done (warning only)";

      // Default is critical - should not find warning
      expect(detector.hasViolations(content, "critical")).toBe(false);

      // Warning level should find it
      expect(detector.hasViolations(content, "warning")).toBe(true);
    });
  });

  describe("getRegistry", () => {
    it("should return the registry", () => {
      expect(detector.getRegistry()).toBe(registry);
    });
  });
});

describe("Convenience functions", () => {
  // Note: These use the default registry with built-in patterns
  // Import and initialize explicitly to ensure patterns are loaded
  beforeEach(async () => {
    // Dynamically import to ensure initialization
    const { initializeAntiPatterns } = await import("../../src/anti-patterns/index.js");
    initializeAntiPatterns();
  });

  describe("detectAntiPatterns", () => {
    it("should detect patterns using default registry", async () => {
      // Re-import to get fresh functions with initialized registry
      const { detectAntiPatterns: detect } = await import("../../src/anti-patterns/index.js");

      // Use a content that clearly matches the read-index-json pattern
      const content = "Let me read the ai/tasks/index.json file to see what's next";
      const result = detect(content, { minSeverity: "info" });

      // Should detect file-reading violation
      expect(result.hasViolations).toBe(true);
    });
  });

  describe("hasAntiPatternViolations", () => {
    it("should check for violations using default registry", async () => {
      // Re-import to get fresh functions with initialized registry
      const { hasAntiPatternViolations: hasViolations } = await import("../../src/anti-patterns/index.js");

      // Use content that matches critical patterns
      const content = "Let me read ai/tasks/index.json to check task status";
      // Check at warning level to catch more patterns
      expect(hasViolations(content, "warning")).toBe(true);
    });
  });
});
