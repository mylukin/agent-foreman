/**
 * Tests for Strategy Registry Index
 * Universal Verification Strategy (UVS) Phase 3
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Feature } from "../../src/types/index.js";
import type { VerificationStrategy, FileVerificationStrategy } from "../../src/verifier/types/index.js";
import {
  initializeStrategies,
  executeStrategy,
  getRegisteredStrategyTypes,
  hasStrategy,
  defaultRegistry,
  StrategyRegistry,
  // Executor classes
  TestStrategyExecutor,
  E2EStrategyExecutor,
  ScriptStrategyExecutor,
  HttpStrategyExecutor,
  FileStrategyExecutor,
  CommandStrategyExecutor,
  ManualStrategyExecutor,
  AIStrategyExecutor,
  CompositeStrategyExecutor,
  // Executor instances
  testStrategyExecutor,
  e2eStrategyExecutor,
  scriptStrategyExecutor,
  httpStrategyExecutor,
  fileStrategyExecutor,
  commandStrategyExecutor,
  manualStrategyExecutor,
  aiStrategyExecutor,
  compositeStrategyExecutor,
} from "../../src/strategies/index.js";

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

describe("Strategy Registry Index", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Suppress console output during tests
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("initializeStrategies", () => {
    it("should return defaultRegistry", () => {
      const registry = initializeStrategies();
      expect(registry).toBe(defaultRegistry);
    });

    it("should be idempotent", () => {
      const registry1 = initializeStrategies();
      const registry2 = initializeStrategies();
      expect(registry1).toBe(registry2);
    });
  });

  describe("all executors registered", () => {
    const expectedTypes = [
      "test",
      "e2e",
      "script",
      "http",
      "file",
      "command",
      "manual",
      "ai",
      "composite",
      "behavior",
    ];

    it.each(expectedTypes)("should have '%s' executor registered", (type) => {
      expect(defaultRegistry.has(type as any)).toBe(true);
    });

    it("should have all 10 strategy types registered", () => {
      const registeredTypes = getRegisteredStrategyTypes();
      expect(registeredTypes).toHaveLength(10);
      for (const type of expectedTypes) {
        expect(registeredTypes).toContain(type);
      }
    });
  });

  describe("hasStrategy", () => {
    it("should return true for registered types", () => {
      expect(hasStrategy("test")).toBe(true);
      expect(hasStrategy("file")).toBe(true);
      expect(hasStrategy("composite")).toBe(true);
    });

    it("should return false for unregistered types", () => {
      expect(hasStrategy("unknown")).toBe(false);
      expect(hasStrategy("nonexistent")).toBe(false);
    });
  });

  describe("getRegisteredStrategyTypes", () => {
    it("should return array of all registered types", () => {
      const types = getRegisteredStrategyTypes();
      expect(Array.isArray(types)).toBe(true);
      expect(types.length).toBeGreaterThanOrEqual(9);
    });
  });

  describe("executeStrategy", () => {
    it("should execute a file strategy", async () => {
      const strategy: FileVerificationStrategy = {
        type: "file",
        required: true,
        path: __filename, // This test file exists
        exists: true,
      };

      const result = await executeStrategy(__dirname, strategy, baseFeature);

      expect(result.success).toBe(true);
    });

    it("should throw for unregistered strategy type", async () => {
      const strategy = {
        type: "unknown",
        required: true,
      } as unknown as VerificationStrategy;

      await expect(executeStrategy("/project", strategy, baseFeature)).rejects.toThrow(
        "No executor registered for strategy type: unknown"
      );
    });
  });

  describe("executor class exports", () => {
    it("should export TestStrategyExecutor class", () => {
      expect(TestStrategyExecutor).toBeDefined();
      expect(typeof TestStrategyExecutor).toBe("function");
    });

    it("should export E2EStrategyExecutor class", () => {
      expect(E2EStrategyExecutor).toBeDefined();
      expect(typeof E2EStrategyExecutor).toBe("function");
    });

    it("should export ScriptStrategyExecutor class", () => {
      expect(ScriptStrategyExecutor).toBeDefined();
      expect(typeof ScriptStrategyExecutor).toBe("function");
    });

    it("should export HttpStrategyExecutor class", () => {
      expect(HttpStrategyExecutor).toBeDefined();
      expect(typeof HttpStrategyExecutor).toBe("function");
    });

    it("should export FileStrategyExecutor class", () => {
      expect(FileStrategyExecutor).toBeDefined();
      expect(typeof FileStrategyExecutor).toBe("function");
    });

    it("should export CommandStrategyExecutor class", () => {
      expect(CommandStrategyExecutor).toBeDefined();
      expect(typeof CommandStrategyExecutor).toBe("function");
    });

    it("should export ManualStrategyExecutor class", () => {
      expect(ManualStrategyExecutor).toBeDefined();
      expect(typeof ManualStrategyExecutor).toBe("function");
    });

    it("should export AIStrategyExecutor class", () => {
      expect(AIStrategyExecutor).toBeDefined();
      expect(typeof AIStrategyExecutor).toBe("function");
    });

    it("should export CompositeStrategyExecutor class", () => {
      expect(CompositeStrategyExecutor).toBeDefined();
      expect(typeof CompositeStrategyExecutor).toBe("function");
    });
  });

  describe("executor instance exports", () => {
    it("should export testStrategyExecutor singleton", () => {
      expect(testStrategyExecutor).toBeInstanceOf(TestStrategyExecutor);
      expect(testStrategyExecutor.type).toBe("test");
    });

    it("should export e2eStrategyExecutor singleton", () => {
      expect(e2eStrategyExecutor).toBeInstanceOf(E2EStrategyExecutor);
      expect(e2eStrategyExecutor.type).toBe("e2e");
    });

    it("should export scriptStrategyExecutor singleton", () => {
      expect(scriptStrategyExecutor).toBeInstanceOf(ScriptStrategyExecutor);
      expect(scriptStrategyExecutor.type).toBe("script");
    });

    it("should export httpStrategyExecutor singleton", () => {
      expect(httpStrategyExecutor).toBeInstanceOf(HttpStrategyExecutor);
      expect(httpStrategyExecutor.type).toBe("http");
    });

    it("should export fileStrategyExecutor singleton", () => {
      expect(fileStrategyExecutor).toBeInstanceOf(FileStrategyExecutor);
      expect(fileStrategyExecutor.type).toBe("file");
    });

    it("should export commandStrategyExecutor singleton", () => {
      expect(commandStrategyExecutor).toBeInstanceOf(CommandStrategyExecutor);
      expect(commandStrategyExecutor.type).toBe("command");
    });

    it("should export manualStrategyExecutor singleton", () => {
      expect(manualStrategyExecutor).toBeInstanceOf(ManualStrategyExecutor);
      expect(manualStrategyExecutor.type).toBe("manual");
    });

    it("should export aiStrategyExecutor singleton", () => {
      expect(aiStrategyExecutor).toBeInstanceOf(AIStrategyExecutor);
      expect(aiStrategyExecutor.type).toBe("ai");
    });

    it("should export compositeStrategyExecutor singleton", () => {
      expect(compositeStrategyExecutor).toBeInstanceOf(CompositeStrategyExecutor);
      expect(compositeStrategyExecutor.type).toBe("composite");
    });
  });

  describe("StrategyRegistry export", () => {
    it("should export StrategyRegistry class", () => {
      expect(StrategyRegistry).toBeDefined();
      expect(typeof StrategyRegistry).toBe("function");
    });

    it("should export defaultRegistry singleton", () => {
      expect(defaultRegistry).toBeInstanceOf(StrategyRegistry);
    });
  });

  describe("integration: all strategy types can be executed", () => {
    // We can't easily test all strategy types in a unit test,
    // but we verify that the registry can lookup each executor
    const strategyTypes = [
      "test",
      "e2e",
      "script",
      "http",
      "file",
      "command",
      "manual",
      "ai",
      "composite",
    ];

    it.each(strategyTypes)("should have executable '%s' strategy", (type) => {
      const executor = defaultRegistry.get(type as any);
      expect(executor).toBeDefined();
      expect(typeof executor?.execute).toBe("function");
      expect(executor?.type).toBe(type);
    });
  });
});
