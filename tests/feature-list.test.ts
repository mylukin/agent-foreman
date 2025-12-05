/**
 * Tests for src/feature-list.ts - Feature list operations
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadFeatureList,
  saveFeatureList,
  featureListExists,
  selectNextFeature,
  findFeatureById,
  updateFeatureStatus,
  findDependentFeatures,
  findSameModuleFeatures,
  mergeFeatures,
  createEmptyFeatureList,
  discoveredToFeature,
  getFeatureStats,
  getCompletionPercentage,
  groupByModule,
  deprecateFeature,
  addFeature,
  createFeature,
  generateTestPattern,
} from "../src/feature-list.js";
import type { Feature, FeatureList, DiscoveredFeature } from "../src/types.js";

describe("Feature List Operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-foreman-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createTestFeature = (overrides: Partial<Feature> = {}): Feature => ({
    id: "test.feature",
    description: "Test feature",
    module: "test",
    priority: 1,
    status: "failing",
    acceptance: ["Test criterion"],
    dependsOn: [],
    supersedes: [],
    tags: [],
    version: 1,
    origin: "manual",
    notes: "",
    ...overrides,
  });

  const createTestFeatureList = (features: Feature[] = []): FeatureList => ({
    features,
    metadata: {
      projectGoal: "Test project",
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
      version: "1.0.0",
    },
  });

  describe("loadFeatureList / saveFeatureList", () => {
    it("should save and load feature list", async () => {
      const list = createTestFeatureList([createTestFeature()]);
      await saveFeatureList(tempDir, list);
      const loaded = await loadFeatureList(tempDir);

      expect(loaded).not.toBeNull();
      expect(loaded?.features).toHaveLength(1);
      expect(loaded?.features[0].id).toBe("test.feature");
    });

    it("should return null for non-existent file", async () => {
      const loaded = await loadFeatureList(tempDir);
      expect(loaded).toBeNull();
    });

    it("should update updatedAt on save", async () => {
      const list = createTestFeatureList([]);
      const originalTime = list.metadata.updatedAt;

      await new Promise((resolve) => setTimeout(resolve, 10));
      await saveFeatureList(tempDir, list);
      const loaded = await loadFeatureList(tempDir);

      expect(loaded?.metadata.updatedAt).not.toBe(originalTime);
    });

    it("should create ai directory if not exists", async () => {
      const list = createTestFeatureList([]);
      await saveFeatureList(tempDir, list);

      const aiDir = path.join(tempDir, "ai");
      const stat = await fs.stat(aiDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("featureListExists", () => {
    it("should return false for non-existent file", async () => {
      const exists = await featureListExists(tempDir);
      expect(exists).toBe(false);
    });

    it("should return true for existing file", async () => {
      const list = createTestFeatureList([]);
      await saveFeatureList(tempDir, list);

      const exists = await featureListExists(tempDir);
      expect(exists).toBe(true);
    });
  });

  describe("selectNextFeature", () => {
    it("should return null for empty list", () => {
      const next = selectNextFeature([]);
      expect(next).toBeNull();
    });

    it("should return null when all features are passing", () => {
      const features = [
        createTestFeature({ id: "f1", status: "passing" }),
        createTestFeature({ id: "f2", status: "passing" }),
      ];
      const next = selectNextFeature(features);
      expect(next).toBeNull();
    });

    it("should prioritize needs_review over failing", () => {
      const features = [
        createTestFeature({ id: "f1", status: "failing", priority: 1 }),
        createTestFeature({ id: "f2", status: "needs_review", priority: 10 }),
      ];
      const next = selectNextFeature(features);
      expect(next?.id).toBe("f2");
    });

    it("should select by priority within same status", () => {
      const features = [
        createTestFeature({ id: "f1", status: "failing", priority: 5 }),
        createTestFeature({ id: "f2", status: "failing", priority: 1 }),
        createTestFeature({ id: "f3", status: "failing", priority: 10 }),
      ];
      const next = selectNextFeature(features);
      expect(next?.id).toBe("f2");
    });

    it("should skip deprecated and blocked features", () => {
      const features = [
        createTestFeature({ id: "f1", status: "deprecated", priority: 1 }),
        createTestFeature({ id: "f2", status: "blocked", priority: 1 }),
        createTestFeature({ id: "f3", status: "failing", priority: 10 }),
      ];
      const next = selectNextFeature(features);
      expect(next?.id).toBe("f3");
    });
  });

  describe("findFeatureById", () => {
    it("should find existing feature", () => {
      const features = [
        createTestFeature({ id: "f1" }),
        createTestFeature({ id: "f2" }),
      ];
      const found = findFeatureById(features, "f2");
      expect(found?.id).toBe("f2");
    });

    it("should return undefined for non-existent feature", () => {
      const features = [createTestFeature({ id: "f1" })];
      const found = findFeatureById(features, "f999");
      expect(found).toBeUndefined();
    });
  });

  describe("updateFeatureStatus", () => {
    it("should update status of specified feature", () => {
      const features = [
        createTestFeature({ id: "f1", status: "failing" }),
        createTestFeature({ id: "f2", status: "failing" }),
      ];
      const updated = updateFeatureStatus(features, "f1", "passing");

      expect(updated[0].status).toBe("passing");
      expect(updated[1].status).toBe("failing");
    });

    it("should update notes if provided", () => {
      const features = [createTestFeature({ id: "f1", notes: "old" })];
      const updated = updateFeatureStatus(features, "f1", "passing", "new notes");

      expect(updated[0].notes).toBe("new notes");
    });

    it("should preserve notes if not provided", () => {
      const features = [createTestFeature({ id: "f1", notes: "keep this" })];
      const updated = updateFeatureStatus(features, "f1", "passing");

      expect(updated[0].notes).toBe("keep this");
    });
  });

  describe("findDependentFeatures", () => {
    it("should find features that depend on given feature", () => {
      const features = [
        createTestFeature({ id: "f1", dependsOn: [] }),
        createTestFeature({ id: "f2", dependsOn: ["f1"] }),
        createTestFeature({ id: "f3", dependsOn: ["f1", "f2"] }),
        createTestFeature({ id: "f4", dependsOn: ["f2"] }),
      ];
      const dependents = findDependentFeatures(features, "f1");

      expect(dependents).toHaveLength(2);
      expect(dependents.map((f) => f.id)).toContain("f2");
      expect(dependents.map((f) => f.id)).toContain("f3");
    });

    it("should return empty array if no dependents", () => {
      const features = [
        createTestFeature({ id: "f1", dependsOn: [] }),
        createTestFeature({ id: "f2", dependsOn: [] }),
      ];
      const dependents = findDependentFeatures(features, "f1");
      expect(dependents).toHaveLength(0);
    });
  });

  describe("findSameModuleFeatures", () => {
    it("should find features in same module", () => {
      const features = [
        createTestFeature({ id: "f1", module: "auth" }),
        createTestFeature({ id: "f2", module: "auth" }),
        createTestFeature({ id: "f3", module: "user" }),
      ];
      const sameModule = findSameModuleFeatures(features, "auth", "f1");

      expect(sameModule).toHaveLength(1);
      expect(sameModule[0].id).toBe("f2");
    });

    it("should exclude the specified feature ID", () => {
      const features = [
        createTestFeature({ id: "f1", module: "auth" }),
        createTestFeature({ id: "f2", module: "auth" }),
      ];
      const sameModule = findSameModuleFeatures(features, "auth", "f1");

      expect(sameModule.map((f) => f.id)).not.toContain("f1");
    });
  });

  describe("mergeFeatures", () => {
    it("should add new features without duplicates", () => {
      const existing = [createTestFeature({ id: "f1" })];
      const discovered = [
        createTestFeature({ id: "f1" }), // duplicate
        createTestFeature({ id: "f2" }), // new
      ];
      const merged = mergeFeatures(existing, discovered);

      expect(merged).toHaveLength(2);
      expect(merged.map((f) => f.id)).toContain("f1");
      expect(merged.map((f) => f.id)).toContain("f2");
    });

    it("should preserve existing feature data", () => {
      const existing = [createTestFeature({ id: "f1", status: "passing" })];
      const discovered = [createTestFeature({ id: "f1", status: "failing" })];
      const merged = mergeFeatures(existing, discovered);

      expect(merged[0].status).toBe("passing");
    });
  });

  describe("createEmptyFeatureList", () => {
    it("should create valid empty feature list", () => {
      const list = createEmptyFeatureList("Test goal");

      expect(list.features).toHaveLength(0);
      expect(list.metadata.projectGoal).toBe("Test goal");
      expect(list.metadata.version).toBe("1.0.0");
      expect(list.metadata.createdAt).toBeDefined();
      expect(list.metadata.updatedAt).toBeDefined();
    });
  });

  describe("discoveredToFeature", () => {
    it("should convert discovered feature to full Feature", () => {
      const discovered: DiscoveredFeature = {
        id: "api.users",
        description: "Users API",
        module: "api",
        source: "route",
        confidence: 0.8,
      };
      const feature = discoveredToFeature(discovered, 5);

      expect(feature.id).toBe("api.users");
      expect(feature.description).toBe("Users API");
      expect(feature.module).toBe("api");
      expect(feature.priority).toBe(15); // 10 + index
      expect(feature.status).toBe("failing");
      expect(feature.origin).toBe("init-from-routes");
      expect(feature.acceptance).toHaveLength(1);
    });

    it("should set origin based on source", () => {
      const routeFeature = discoveredToFeature(
        { id: "f1", description: "d", module: "m", source: "route", confidence: 0.8 },
        0
      );
      expect(routeFeature.origin).toBe("init-from-routes");

      const testFeature = discoveredToFeature(
        { id: "f2", description: "d", module: "m", source: "test", confidence: 0.9 },
        0
      );
      expect(testFeature.origin).toBe("init-from-tests");

      const otherFeature = discoveredToFeature(
        { id: "f3", description: "d", module: "m", source: "inferred", confidence: 0.5 },
        0
      );
      expect(otherFeature.origin).toBe("init-auto");
    });
  });

  describe("getFeatureStats", () => {
    it("should count features by status", () => {
      const features = [
        createTestFeature({ id: "f1", status: "failing" }),
        createTestFeature({ id: "f2", status: "passing" }),
        createTestFeature({ id: "f3", status: "passing" }),
        createTestFeature({ id: "f4", status: "needs_review" }),
        createTestFeature({ id: "f5", status: "blocked" }),
        createTestFeature({ id: "f6", status: "deprecated" }),
      ];
      const stats = getFeatureStats(features);

      expect(stats.failing).toBe(1);
      expect(stats.passing).toBe(2);
      expect(stats.needs_review).toBe(1);
      expect(stats.blocked).toBe(1);
      expect(stats.deprecated).toBe(1);
    });

    it("should return zeros for empty list", () => {
      const stats = getFeatureStats([]);

      expect(stats.failing).toBe(0);
      expect(stats.passing).toBe(0);
    });
  });

  describe("getCompletionPercentage", () => {
    it("should calculate percentage correctly", () => {
      const features = [
        createTestFeature({ id: "f1", status: "passing" }),
        createTestFeature({ id: "f2", status: "passing" }),
        createTestFeature({ id: "f3", status: "failing" }),
        createTestFeature({ id: "f4", status: "failing" }),
      ];
      const percentage = getCompletionPercentage(features);
      expect(percentage).toBe(50);
    });

    it("should exclude deprecated features", () => {
      const features = [
        createTestFeature({ id: "f1", status: "passing" }),
        createTestFeature({ id: "f2", status: "failing" }),
        createTestFeature({ id: "f3", status: "deprecated" }),
      ];
      const percentage = getCompletionPercentage(features);
      expect(percentage).toBe(50); // 1 passing out of 2 active
    });

    it("should return 0 for empty list", () => {
      const percentage = getCompletionPercentage([]);
      expect(percentage).toBe(0);
    });

    it("should return 100 for all passing", () => {
      const features = [
        createTestFeature({ id: "f1", status: "passing" }),
        createTestFeature({ id: "f2", status: "passing" }),
      ];
      const percentage = getCompletionPercentage(features);
      expect(percentage).toBe(100);
    });
  });

  describe("groupByModule", () => {
    it("should group features by module", () => {
      const features = [
        createTestFeature({ id: "f1", module: "auth" }),
        createTestFeature({ id: "f2", module: "auth" }),
        createTestFeature({ id: "f3", module: "user" }),
      ];
      const groups = groupByModule(features);

      expect(groups.get("auth")).toHaveLength(2);
      expect(groups.get("user")).toHaveLength(1);
    });
  });

  describe("deprecateFeature", () => {
    it("should mark feature as deprecated", () => {
      const features = [createTestFeature({ id: "f1", status: "passing" })];
      const updated = deprecateFeature(features, "f1");

      expect(updated[0].status).toBe("deprecated");
    });

    it("should add replacement note if provided", () => {
      const features = [createTestFeature({ id: "f1", notes: "" })];
      const updated = deprecateFeature(features, "f1", "f2");

      expect(updated[0].notes).toContain("Replaced by f2");
    });
  });

  describe("addFeature", () => {
    it("should add new feature to list", () => {
      const features = [createTestFeature({ id: "f1" })];
      const newFeature = createTestFeature({ id: "f2" });
      const updated = addFeature(features, newFeature);

      expect(updated).toHaveLength(2);
      expect(updated[1].id).toBe("f2");
    });

    it("should throw error for duplicate ID", () => {
      const features = [createTestFeature({ id: "f1" })];
      const duplicate = createTestFeature({ id: "f1" });

      expect(() => addFeature(features, duplicate)).toThrow("already exists");
    });
  });

  describe("createFeature", () => {
    it("should create feature with required fields", () => {
      const feature = createFeature("test.new", "New feature", "test", ["Criterion 1"]);

      expect(feature.id).toBe("test.new");
      expect(feature.description).toBe("New feature");
      expect(feature.module).toBe("test");
      expect(feature.acceptance).toEqual(["Criterion 1"]);
      expect(feature.status).toBe("failing");
      expect(feature.origin).toBe("manual");
    });

    it("should accept optional overrides", () => {
      const feature = createFeature("test.new", "New", "test", ["C1"], {
        priority: 5,
        status: "blocked",
        tags: ["important"],
      });

      expect(feature.priority).toBe(5);
      expect(feature.status).toBe("blocked");
      expect(feature.tags).toEqual(["important"]);
    });

    it("should auto-generate testRequirements if not provided", () => {
      const feature = createFeature("auth.login", "Login feature", "auth", ["Login works"]);

      expect(feature.testRequirements?.unit?.pattern).toBe("tests/auth/**/*.test.*");
      expect(feature.testRequirements?.unit?.required).toBe(false);
    });

    it("should use provided testRequirements over auto-generated", () => {
      const feature = createFeature("auth.login", "Login feature", "auth", ["Login works"], {
        testRequirements: { unit: { required: true, pattern: "custom/path/*.spec.ts" } },
      });

      expect(feature.testRequirements?.unit?.pattern).toBe("custom/path/*.spec.ts");
      expect(feature.testRequirements?.unit?.required).toBe(true);
    });
  });

  describe("generateTestPattern", () => {
    it("should generate module-based test pattern", () => {
      const pattern = generateTestPattern("auth");
      expect(pattern).toBe("tests/auth/**/*.test.*");
    });

    it("should sanitize module names with special characters", () => {
      const pattern = generateTestPattern("my-module");
      expect(pattern).toBe("tests/my-module/**/*.test.*");
    });

    it("should handle modules with underscores", () => {
      const pattern = generateTestPattern("my_module");
      expect(pattern).toBe("tests/my_module/**/*.test.*");
    });

    it("should remove invalid characters from module name", () => {
      const pattern = generateTestPattern("module/with/slashes");
      expect(pattern).toBe("tests/modulewithslashes/**/*.test.*");
    });

    it("should handle complex module names", () => {
      const pattern = generateTestPattern("verification");
      expect(pattern).toBe("tests/verification/**/*.test.*");
    });
  });

  describe("discoveredToFeature with testRequirements", () => {
    it("should auto-generate testRequirements for discovered features", () => {
      const discovered: DiscoveredFeature = {
        id: "api.users",
        description: "Users API",
        module: "api",
        source: "route",
        confidence: 0.8,
      };
      const feature = discoveredToFeature(discovered, 0);

      expect(feature.testRequirements?.unit?.pattern).toBe("tests/api/**/*.test.*");
    });

    it("should generate different patterns for different modules", () => {
      const authFeature = discoveredToFeature(
        { id: "auth.login", description: "d", module: "auth", source: "route", confidence: 0.8 },
        0
      );
      const userFeature = discoveredToFeature(
        { id: "user.profile", description: "d", module: "user", source: "route", confidence: 0.8 },
        0
      );

      expect(authFeature.testRequirements?.unit?.pattern).toBe("tests/auth/**/*.test.*");
      expect(userFeature.testRequirements?.unit?.pattern).toBe("tests/user/**/*.test.*");
    });
  });
});
