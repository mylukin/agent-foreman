/**
 * Tests for BehaviorStrategyExecutor
 * Universal Verification Strategy (UVS) Phase 3
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { mkdtemp, writeFile, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Feature } from "../../src/types/index.js";
import type { BehaviorVerificationStrategy } from "../../src/verifier/types/index.js";

import {
  BehaviorStrategyExecutor,
  behaviorStrategyExecutor,
} from "../../src/strategies/behavior-strategy.js";
import { defaultRegistry } from "../../src/strategy-executor.js";

// Base feature for testing
const baseFeature: Feature = {
  id: "test.feature",
  description: "Test feature",
  module: "test",
  priority: 1,
  status: "failing",
  acceptance: ["Acceptance criterion"],
  dependsOn: [],
  supersedes: [],
  tags: [],
  version: 1,
  origin: "manual",
  notes: "",
};

describe("BehaviorStrategyExecutor", () => {
  let executor: BehaviorStrategyExecutor;
  let tempDir: string;

  beforeEach(async () => {
    executor = new BehaviorStrategyExecutor();
    // Create a temporary directory for tests
    tempDir = await mkdtemp(join(tmpdir(), "behavior-strategy-test-"));
    // Create ai/tasks directory structure
    await mkdir(join(tempDir, "ai"), { recursive: true });
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await rm(tempDir, { recursive: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("type property", () => {
    it("should have type 'behavior'", () => {
      expect(executor.type).toBe("behavior");
    });
  });

  describe("execute with no logs", () => {
    it("should pass when no log file exists", async () => {
      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath: join(tempDir, "ai/progress.log"),
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.success).toBe(false);
      expect(result.output).toContain("Failed to collect logs");
    });

    it("should pass when log file is empty", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(logPath, "");

      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.success).toBe(true);
      expect(result.output).toContain("No behavior logs available");
    });
  });

  describe("execute with clean logs", () => {
    it("should pass when no violations detected", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
2025-01-15T10:30:00Z STEP task=auth.login status=passing summary="Implemented login flow"
2025-01-15T11:00:00Z VERIFY task=auth.login result=passed
      `.trim()
      );

      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.success).toBe(true);
      expect(result.output).toContain("No workflow violations");
    });
  });

  describe("execute with violations", () => {
    it("should detect critical workflow bypass", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
I'll skip the check since I'm confident the code works.
agent-foreman done auth.login
      `.trim()
      );

      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "critical",
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.success).toBe(false);
      expect((result.details?.violations as { critical: number })?.critical).toBeGreaterThan(0);
    });

    it("should detect file reading violations", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
Let me read ai/tasks/index.json to see what tasks are pending.
Then I'll implement the next one.
      `.trim()
      );

      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "critical",
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.success).toBe(false);
      expect(result.output).toContain("CRITICAL");
    });

    it("should respect minSeverity option", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
I think the task is probably done now.
      `.trim()
      );

      // Critical only - should pass (this is a warning)
      const criticalStrategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "critical",
      };

      const criticalResult = await executor.execute(tempDir, criticalStrategy, baseFeature);
      expect(criticalResult.success).toBe(true);

      // Warning - should detect the issue
      const warningStrategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "warning",
      };

      const warningResult = await executor.execute(tempDir, warningStrategy, baseFeature);
      expect((warningResult.details?.violations as { warning: number })?.warning).toBeGreaterThan(0);
    });

    it("should respect failFast option", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
The task is probably done now.
I think the feature should be working.
      `.trim()
      );

      // With failFast=true (default), passes if no critical
      const fastStrategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "warning",
        failFast: true,
      };

      const fastResult = await executor.execute(tempDir, fastStrategy, baseFeature);
      expect(fastResult.success).toBe(true);

      // With failFast=false, fails on any violation
      const noFailFastStrategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "warning",
        failFast: false,
      };

      const noFastResult = await executor.execute(tempDir, noFailFastStrategy, baseFeature);
      expect(noFastResult.success).toBe(false);
    });
  });

  describe("execute with category filtering", () => {
    it("should filter by specific categories", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
Let me read ai/tasks/index.json to see what's next.
I'll skip the check since I'm sure it works.
      `.trim()
      );

      // Only check file-reading category
      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "critical",
        categories: ["file-reading"],
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.success).toBe(false);
      // Should only have file-reading violations
      const detectionResult = result.details?.detectionResult as { byCategory?: Record<string, number> };
      expect(detectionResult?.byCategory?.["file-reading"]).toBeGreaterThan(0);
    });
  });

  describe("execute with custom patterns", () => {
    it("should detect custom patterns", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
Using the forbidden shortcut command here.
      `.trim()
      );

      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
        minSeverity: "critical",
        customPatterns: [
          {
            id: "custom-forbidden",
            pattern: "forbidden\\s+shortcut",
            severity: "critical",
            message: "Custom forbidden pattern detected",
          },
        ],
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.success).toBe(false);
    });
  });

  describe("execute with session source", () => {
    it("should handle session source (placeholder)", async () => {
      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "session",
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      // Session currently returns empty content, should pass
      expect(result.success).toBe(true);
    });
  });

  describe("result details", () => {
    it("should include detection details", async () => {
      const logPath = join(tempDir, "ai/progress.log");
      await writeFile(
        logPath,
        `
Let me read ai/tasks/index.json directly.
      `.trim()
      );

      const strategy: BehaviorVerificationStrategy = {
        type: "behavior",
        required: true,
        logSource: "file",
        logPath,
      };

      const result = await executor.execute(tempDir, strategy, baseFeature);

      expect(result.details).toBeDefined();
      expect(result.details?.violations).toBeDefined();
      expect(result.details?.logSource).toBe("file");
      expect(result.details?.logPath).toBe(logPath);
      expect(result.details?.detectionResult).toBeDefined();
    });
  });

  describe("getDetector and getRegistry", () => {
    it("should expose detector and registry", () => {
      expect(executor.getDetector()).toBeDefined();
      expect(executor.getRegistry()).toBeDefined();
    });
  });
});

describe("behaviorStrategyExecutor singleton", () => {
  it("should be a BehaviorStrategyExecutor instance", () => {
    expect(behaviorStrategyExecutor).toBeInstanceOf(BehaviorStrategyExecutor);
  });

  it("should have type 'behavior'", () => {
    expect(behaviorStrategyExecutor.type).toBe("behavior");
  });
});

describe("defaultRegistry integration", () => {
  it("should have behavior executor registered", () => {
    expect(defaultRegistry.has("behavior")).toBe(true);
  });

  it("should return behaviorStrategyExecutor for 'behavior' type", () => {
    const executor = defaultRegistry.get("behavior");
    expect(executor).toBe(behaviorStrategyExecutor);
  });
});
