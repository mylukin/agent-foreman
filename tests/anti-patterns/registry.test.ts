/**
 * Tests for AntiPatternRegistry
 */
import { describe, it, expect, beforeEach } from "vitest";
import { AntiPatternRegistry } from "../../src/anti-patterns/registry.js";
import type { AntiPattern } from "../../src/anti-patterns/types.js";

// Test patterns
const testPatternCritical: AntiPattern = {
  id: "test-critical",
  description: "Test critical pattern",
  category: "workflow-bypass",
  severity: "critical",
  detectionPatterns: [/test-pattern/i],
  remediation: "Fix it",
};

const testPatternWarning: AntiPattern = {
  id: "test-warning",
  description: "Test warning pattern",
  category: "file-reading",
  severity: "warning",
  detectionPatterns: [/another-pattern/i],
  remediation: "Fix it too",
};

const testPatternInfo: AntiPattern = {
  id: "test-info",
  description: "Test info pattern",
  category: "status-guess",
  severity: "info",
  detectionPatterns: [/info-pattern/i],
  remediation: "Consider fixing",
};

describe("AntiPatternRegistry", () => {
  let registry: AntiPatternRegistry;

  beforeEach(() => {
    registry = new AntiPatternRegistry();
  });

  describe("register", () => {
    it("should register a pattern", () => {
      registry.register(testPatternCritical);
      expect(registry.has("test-critical")).toBe(true);
    });

    it("should throw when registering duplicate ID", () => {
      registry.register(testPatternCritical);
      expect(() => registry.register(testPatternCritical)).toThrow(
        "Anti-pattern with ID 'test-critical' already registered"
      );
    });
  });

  describe("registerAll", () => {
    it("should register multiple patterns", () => {
      registry.registerAll([testPatternCritical, testPatternWarning]);
      expect(registry.size).toBe(2);
      expect(registry.has("test-critical")).toBe(true);
      expect(registry.has("test-warning")).toBe(true);
    });
  });

  describe("get", () => {
    it("should return registered pattern", () => {
      registry.register(testPatternCritical);
      const pattern = registry.get("test-critical");
      expect(pattern).toEqual(testPatternCritical);
    });

    it("should return undefined for unregistered pattern", () => {
      const pattern = registry.get("nonexistent");
      expect(pattern).toBeUndefined();
    });
  });

  describe("has", () => {
    it("should return true for registered pattern", () => {
      registry.register(testPatternCritical);
      expect(registry.has("test-critical")).toBe(true);
    });

    it("should return false for unregistered pattern", () => {
      expect(registry.has("nonexistent")).toBe(false);
    });
  });

  describe("getAll", () => {
    it("should return all registered patterns", () => {
      registry.registerAll([testPatternCritical, testPatternWarning]);
      const all = registry.getAll();
      expect(all).toHaveLength(2);
      expect(all).toContainEqual(testPatternCritical);
      expect(all).toContainEqual(testPatternWarning);
    });

    it("should return empty array when no patterns registered", () => {
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe("getByCategory", () => {
    it("should return patterns by category", () => {
      registry.registerAll([testPatternCritical, testPatternWarning, testPatternInfo]);

      const workflowPatterns = registry.getByCategory("workflow-bypass");
      expect(workflowPatterns).toHaveLength(1);
      expect(workflowPatterns[0].id).toBe("test-critical");

      const filePatterns = registry.getByCategory("file-reading");
      expect(filePatterns).toHaveLength(1);
      expect(filePatterns[0].id).toBe("test-warning");
    });

    it("should return empty array for category with no patterns", () => {
      registry.register(testPatternCritical);
      const patterns = registry.getByCategory("manual-edit");
      expect(patterns).toEqual([]);
    });
  });

  describe("getBySeverity", () => {
    it("should return patterns by severity", () => {
      registry.registerAll([testPatternCritical, testPatternWarning, testPatternInfo]);

      const criticalPatterns = registry.getBySeverity("critical");
      expect(criticalPatterns).toHaveLength(1);
      expect(criticalPatterns[0].id).toBe("test-critical");

      const warningPatterns = registry.getBySeverity("warning");
      expect(warningPatterns).toHaveLength(1);
      expect(warningPatterns[0].id).toBe("test-warning");
    });
  });

  describe("getByMinSeverity", () => {
    it("should return patterns at or above minimum severity", () => {
      registry.registerAll([testPatternCritical, testPatternWarning, testPatternInfo]);

      // Critical only
      const criticalOnly = registry.getByMinSeverity("critical");
      expect(criticalOnly).toHaveLength(1);
      expect(criticalOnly[0].severity).toBe("critical");

      // Warning and above (critical + warning)
      const warningAndAbove = registry.getByMinSeverity("warning");
      expect(warningAndAbove).toHaveLength(2);
      expect(warningAndAbove.map((p) => p.severity)).toContain("critical");
      expect(warningAndAbove.map((p) => p.severity)).toContain("warning");

      // All severities
      const allSeverities = registry.getByMinSeverity("info");
      expect(allSeverities).toHaveLength(3);
    });
  });

  describe("size", () => {
    it("should return correct count", () => {
      expect(registry.size).toBe(0);
      registry.register(testPatternCritical);
      expect(registry.size).toBe(1);
      registry.register(testPatternWarning);
      expect(registry.size).toBe(2);
    });
  });

  describe("remove", () => {
    it("should remove a pattern", () => {
      registry.register(testPatternCritical);
      expect(registry.has("test-critical")).toBe(true);

      const removed = registry.remove("test-critical");
      expect(removed).toBe(true);
      expect(registry.has("test-critical")).toBe(false);
    });

    it("should return false when pattern not found", () => {
      const removed = registry.remove("nonexistent");
      expect(removed).toBe(false);
    });
  });

  describe("clear", () => {
    it("should clear all patterns", () => {
      registry.registerAll([testPatternCritical, testPatternWarning]);
      expect(registry.size).toBe(2);

      registry.clear();
      expect(registry.size).toBe(0);
      expect(registry.getAll()).toEqual([]);
    });
  });

  describe("getIds", () => {
    it("should return all pattern IDs", () => {
      registry.registerAll([testPatternCritical, testPatternWarning]);
      const ids = registry.getIds();
      expect(ids).toHaveLength(2);
      expect(ids).toContain("test-critical");
      expect(ids).toContain("test-warning");
    });
  });
});
