/**
 * Tests for built-in anti-patterns
 * Verifies pattern matching accuracy
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AntiPatternDetector } from "../../src/anti-patterns/detector.js";
import { AntiPatternRegistry } from "../../src/anti-patterns/registry.js";
import {
  builtInPatterns,
  getBuiltInPatterns,
  getBuiltInPatternsByCategory,
  getBuiltInPatternIds,
} from "../../src/anti-patterns/patterns.js";

describe("Built-in Patterns", () => {
  let registry: AntiPatternRegistry;
  let detector: AntiPatternDetector;

  beforeEach(() => {
    registry = new AntiPatternRegistry();
    registry.registerAll(builtInPatterns);
    detector = new AntiPatternDetector(registry);
  });

  describe("Pattern exports", () => {
    it("should export built-in patterns array", () => {
      expect(builtInPatterns).toBeDefined();
      expect(Array.isArray(builtInPatterns)).toBe(true);
      expect(builtInPatterns.length).toBeGreaterThan(0);
    });

    it("should have unique IDs", () => {
      const ids = builtInPatterns.map((p) => p.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it("getBuiltInPatterns should return a copy", () => {
      const patterns = getBuiltInPatterns();
      expect(patterns).toEqual(builtInPatterns);
      expect(patterns).not.toBe(builtInPatterns);
    });

    it("getBuiltInPatternsByCategory should filter correctly", () => {
      const workflowPatterns = getBuiltInPatternsByCategory("workflow-bypass");
      expect(workflowPatterns.length).toBeGreaterThan(0);
      expect(workflowPatterns.every((p) => p.category === "workflow-bypass")).toBe(true);
    });

    it("getBuiltInPatternIds should return all IDs", () => {
      const ids = getBuiltInPatternIds();
      expect(ids).toHaveLength(builtInPatterns.length);
      expect(ids).toContain("skip-next-command");
      expect(ids).toContain("read-index-json");
    });
  });

  describe("skip-next-command pattern", () => {
    it("should detect starting implementation without next", () => {
      const content = "Let me start implementing the login feature now";
      const result = detector.detect(content, { minSeverity: "critical" });

      const violations = result.violations.filter((v) => v.pattern.id === "skip-next-command");
      expect(violations.length).toBeGreaterThan(0);
    });

    it("should not flag when next was run", () => {
      const content = `
        agent-foreman next auth.login
        Now let me start implementing the login feature
      `;
      const result = detector.detect(content, { minSeverity: "critical" });

      const violations = result.violations.filter((v) => v.pattern.id === "skip-next-command");
      expect(violations).toHaveLength(0);
    });
  });

  describe("skip-check-command pattern", () => {
    it("should detect running done without check", () => {
      const content = "agent-foreman done auth.login";
      const result = detector.detect(content, { minSeverity: "critical" });

      const violations = result.violations.filter((v) => v.pattern.id === "skip-check-command");
      expect(violations.length).toBeGreaterThan(0);
    });

    it("should not flag when check was run first", () => {
      const content = `
        agent-foreman check auth.login
        agent-foreman done auth.login
      `;
      const result = detector.detect(content, { minSeverity: "critical" });

      const violations = result.violations.filter((v) => v.pattern.id === "skip-check-command");
      expect(violations).toHaveLength(0);
    });
  });

  describe("read-index-json pattern", () => {
    it("should detect reading index.json directly", () => {
      const violations = [
        "Let me read ai/tasks/index.json to see what's next",
        "I'll check the index.json file",
        "readFileSync('ai/tasks/index.json')",
      ];

      for (const content of violations) {
        const result = detector.detect(content, { minSeverity: "critical" });
        const matches = result.violations.filter((v) => v.pattern.id === "read-index-json");
        expect(matches.length, `Should detect: "${content}"`).toBeGreaterThan(0);
      }
    });

    it("should not flag documentation references", () => {
      const content = "The format of index.json is documented in the schema";
      const result = detector.detect(content, { minSeverity: "critical" });

      const violations = result.violations.filter((v) => v.pattern.id === "read-index-json");
      expect(violations).toHaveLength(0);
    });
  });

  describe("read-task-for-status pattern", () => {
    it("should detect reading task files for status", () => {
      const violations = [
        "Let me read the task file to check its status",
        "reading ai/tasks/auth/login.md to see the status",
      ];

      for (const content of violations) {
        const result = detector.detect(content, { minSeverity: "critical" });
        const matches = result.violations.filter((v) => v.pattern.id === "read-task-for-status");
        expect(matches.length, `Should detect: "${content}"`).toBeGreaterThan(0);
      }
    });

    it("should not flag reading for acceptance criteria", () => {
      const content = "After running next, I'll check the acceptance criteria";
      const result = detector.detect(content, { minSeverity: "critical" });

      const violations = result.violations.filter((v) => v.pattern.id === "read-task-for-status");
      expect(violations).toHaveLength(0);
    });
  });

  describe("edit-task-status pattern", () => {
    it("should detect manual status edits", () => {
      const violations = [
        "I'll edit the status to passing",
        "Let me update the status field in the task",
        "change the status to failing",
      ];

      for (const content of violations) {
        const result = detector.detect(content, { minSeverity: "critical" });
        const matches = result.violations.filter((v) => v.pattern.id === "edit-task-status");
        expect(matches.length, `Should detect: "${content}"`).toBeGreaterThan(0);
      }
    });
  });

  describe("edit-index-json pattern", () => {
    it("should detect editing index.json directly", () => {
      const violations = [
        "Let me edit index.json to update the status",
        "I'll update ai/tasks/index.json",
        "writeFileSync('index.json', ...)",
      ];

      for (const content of violations) {
        const result = detector.detect(content, { minSeverity: "critical" });
        const matches = result.violations.filter((v) => v.pattern.id === "edit-index-json");
        expect(matches.length, `Should detect: "${content}"`).toBeGreaterThan(0);
      }
    });

    it("should not flag CLI commands", () => {
      const content = "agent-foreman done auth.login will update index.json";
      const result = detector.detect(content, { minSeverity: "critical" });

      const violations = result.violations.filter((v) => v.pattern.id === "edit-index-json");
      expect(violations).toHaveLength(0);
    });
  });

  describe("local-task-selection pattern", () => {
    it("should detect implementing selection locally", () => {
      // These need to contain "task" or "feature" context words
      const violations = [
        "sort by priority to find the next task",
        "filter task status failing and select highest priority",
        "Object.entries(features).filter() to get next feature",
      ];

      for (const content of violations) {
        const result = detector.detect(content, { minSeverity: "info" });
        const matches = result.violations.filter((v) => v.pattern.id === "local-task-selection");
        expect(matches.length, `Should detect: "${content}"`).toBeGreaterThan(0);
      }
    });
  });

  describe("assume-task-status pattern", () => {
    it("should detect assuming status", () => {
      const violations = [
        "I assume the task is passing now",
        "The feature is probably done",
        "I think the task is complete",
      ];

      for (const content of violations) {
        const result = detector.detect(content, { minSeverity: "info" });
        const matches = result.violations.filter((v) => v.pattern.id === "assume-task-status");
        expect(matches.length, `Should detect: "${content}"`).toBeGreaterThan(0);
      }
    });
  });

  describe("skip-verification-confidence pattern", () => {
    it("should detect skipping verification due to confidence", () => {
      const violations = [
        "I'm confident the code works, no need to check",
        "Looks good to me, skipping verification",
        "Don't need to test, the implementation is straightforward",
      ];

      for (const content of violations) {
        const result = detector.detect(content, { minSeverity: "info" });
        const matches = result.violations.filter(
          (v) => v.pattern.id === "skip-verification-confidence"
        );
        expect(matches.length, `Should detect: "${content}"`).toBeGreaterThan(0);
      }
    });

    it("should not flag after running check", () => {
      const content = "After running check, it looks good to me";
      const result = detector.detect(content, { minSeverity: "info" });

      const violations = result.violations.filter(
        (v) => v.pattern.id === "skip-verification-confidence"
      );
      expect(violations).toHaveLength(0);
    });
  });

  describe("All patterns have required fields", () => {
    it("should have all required fields", () => {
      for (const pattern of builtInPatterns) {
        expect(pattern.id, `Pattern should have id`).toBeDefined();
        expect(pattern.description, `Pattern ${pattern.id} should have description`).toBeDefined();
        expect(pattern.category, `Pattern ${pattern.id} should have category`).toBeDefined();
        expect(pattern.severity, `Pattern ${pattern.id} should have severity`).toBeDefined();
        expect(
          pattern.detectionPatterns,
          `Pattern ${pattern.id} should have detectionPatterns`
        ).toBeDefined();
        expect(
          pattern.detectionPatterns.length,
          `Pattern ${pattern.id} should have at least one detection pattern`
        ).toBeGreaterThan(0);
        expect(pattern.remediation, `Pattern ${pattern.id} should have remediation`).toBeDefined();
      }
    });

    it("should have valid severity values", () => {
      const validSeverities = ["critical", "warning", "info"];
      for (const pattern of builtInPatterns) {
        expect(
          validSeverities,
          `Pattern ${pattern.id} has invalid severity: ${pattern.severity}`
        ).toContain(pattern.severity);
      }
    });

    it("should have valid category values", () => {
      const validCategories = [
        "workflow-bypass",
        "file-reading",
        "manual-edit",
        "algorithm-local",
        "status-guess",
      ];
      for (const pattern of builtInPatterns) {
        expect(
          validCategories,
          `Pattern ${pattern.id} has invalid category: ${pattern.category}`
        ).toContain(pattern.category);
      }
    });
  });
});
