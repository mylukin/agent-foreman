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
  selectNextFeatureQuick,
  findFeatureById,
  updateFeatureStatus,
  updateFeatureStatusQuick,
  updateFeatureVerification,
  getFeatureStatsQuick,
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

  describe("loadFeatureList with modular format", () => {
    it("should load from new modular format when index.json exists", async () => {
      // Create modular format structure
      const featuresDir = path.join(tempDir, "ai", "features");
      await fs.mkdir(path.join(featuresDir, "test"), { recursive: true });

      // Create index.json
      const index = {
        version: "2.0.0",
        updatedAt: "2024-01-15T10:00:00Z",
        metadata: {
          projectGoal: "Test project",
          createdAt: "2024-01-15T10:00:00Z",
          updatedAt: "2024-01-15T10:00:00Z",
          version: "1.0.0",
        },
        features: {
          "test.modular": {
            status: "passing",
            priority: 5,
            module: "test",
            description: "Modular feature test",
          },
        },
      };
      await fs.writeFile(
        path.join(featuresDir, "index.json"),
        JSON.stringify(index, null, 2)
      );

      // Create feature markdown file
      const featureMd = `---
id: test.modular
module: test
priority: 5
status: passing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---

# Modular feature test

## Acceptance Criteria

1. First criterion
2. Second criterion

## Notes

This is a modular feature.
`;
      await fs.writeFile(path.join(featuresDir, "test", "modular.md"), featureMd);

      // Load and verify
      const loaded = await loadFeatureList(tempDir);

      expect(loaded).not.toBeNull();
      expect(loaded?.features).toHaveLength(1);
      expect(loaded?.features[0].id).toBe("test.modular");
      expect(loaded?.features[0].status).toBe("passing");
      expect(loaded?.features[0].acceptance).toContain("First criterion");
    });

    it("should auto-migrate legacy format on load", async () => {
      // Create legacy format
      const legacyList = createTestFeatureList([
        createTestFeature({ id: "legacy.feature", description: "Legacy feature" }),
      ]);
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai", "feature_list.json"),
        JSON.stringify(legacyList, null, 2)
      );

      // Load - should trigger auto-migration
      const loaded = await loadFeatureList(tempDir);

      expect(loaded).not.toBeNull();
      expect(loaded?.features).toHaveLength(1);
      expect(loaded?.features[0].id).toBe("legacy.feature");

      // Verify migration created new format
      const indexPath = path.join(tempDir, "ai", "features", "index.json");
      const indexExists = await fs
        .access(indexPath)
        .then(() => true)
        .catch(() => false);
      expect(indexExists).toBe(true);
    });

    it("should return null when neither format exists", async () => {
      const loaded = await loadFeatureList(tempDir);
      expect(loaded).toBeNull();
    });

    it("should return same FeatureList interface for both formats", async () => {
      // Create legacy format first
      const legacyList = createTestFeatureList([
        createTestFeature({ id: "test.compat", description: "Compatibility test" }),
      ]);
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai", "feature_list.json"),
        JSON.stringify(legacyList, null, 2)
      );

      const loaded = await loadFeatureList(tempDir);

      // Verify same interface
      expect(loaded).toHaveProperty("features");
      expect(loaded).toHaveProperty("metadata");
      expect(loaded?.metadata).toHaveProperty("projectGoal");
      expect(loaded?.metadata).toHaveProperty("createdAt");
      expect(loaded?.metadata).toHaveProperty("updatedAt");
      expect(Array.isArray(loaded?.features)).toBe(true);
    });

    it("should create minimal feature when markdown file is missing in loadAllFeaturesFromMarkdown", async () => {
      // Create index with feature but no markdown file
      const featuresDir = path.join(tempDir, "ai", "features");
      await fs.mkdir(featuresDir, { recursive: true });

      const index = {
        version: "2.0.0",
        updatedAt: "2024-01-15T10:00:00Z",
        metadata: {
          projectGoal: "Test missing file",
          createdAt: "2024-01-15T10:00:00Z",
          updatedAt: "2024-01-15T10:00:00Z",
          version: "1.0.0",
        },
        features: {
          "missing.markdown": {
            status: "failing",
            priority: 5,
            module: "missing",
            description: "Feature without markdown file",
          },
        },
      };
      await fs.writeFile(
        path.join(featuresDir, "index.json"),
        JSON.stringify(index, null, 2)
      );

      // Load - should create minimal feature from index
      const loaded = await loadFeatureList(tempDir);

      expect(loaded).not.toBeNull();
      expect(loaded?.features).toHaveLength(1);
      expect(loaded?.features[0].id).toBe("missing.markdown");
      expect(loaded?.features[0].description).toBe("Feature without markdown file");
      expect(loaded?.features[0].status).toBe("failing");
      expect(loaded?.features[0].acceptance).toEqual([]);
      expect(loaded?.features[0].origin).toBe("manual");
    });
  });

  describe("saveFeatureList with modular format", () => {
    it("should create directory structure", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "test.save", description: "Save test" }),
      ]);

      await saveFeatureList(tempDir, list);

      // Verify directory structure
      const featuresDir = path.join(tempDir, "ai", "features");
      const stat = await fs.stat(featuresDir);
      expect(stat.isDirectory()).toBe(true);

      const testDir = path.join(featuresDir, "test");
      const testStat = await fs.stat(testDir);
      expect(testStat.isDirectory()).toBe(true);
    });

    it("should write each feature to markdown file", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "auth.login", module: "auth", description: "User login" }),
        createTestFeature({ id: "auth.logout", module: "auth", description: "User logout" }),
      ]);

      await saveFeatureList(tempDir, list);

      // Verify markdown files exist
      const loginFile = path.join(tempDir, "ai", "features", "auth", "login.md");
      const logoutFile = path.join(tempDir, "ai", "features", "auth", "logout.md");

      await expect(fs.access(loginFile)).resolves.toBeUndefined();
      await expect(fs.access(logoutFile)).resolves.toBeUndefined();

      // Verify content
      const content = await fs.readFile(loginFile, "utf-8");
      expect(content).toContain("id: auth.login");
      expect(content).toContain("# User login");
    });

    it("should create index.json with feature entries", async () => {
      const list = createTestFeatureList([
        createTestFeature({
          id: "core.feature",
          module: "core",
          description: "Core feature",
          status: "passing",
          priority: 5,
        }),
      ]);

      await saveFeatureList(tempDir, list);

      const indexPath = path.join(tempDir, "ai", "features", "index.json");
      const indexContent = await fs.readFile(indexPath, "utf-8");
      const index = JSON.parse(indexContent);

      expect(index.version).toBe("2.0.0");
      expect(index.features["core.feature"]).toEqual({
        status: "passing",
        priority: 5,
        module: "core",
        description: "Core feature",
      });
    });

    it("should preserve FeatureList interface compatibility", async () => {
      const originalList = createTestFeatureList([
        createTestFeature({ id: "compat.test", description: "Compatibility" }),
      ]);

      await saveFeatureList(tempDir, originalList);
      const loaded = await loadFeatureList(tempDir);

      // Same interface
      expect(loaded).toHaveProperty("features");
      expect(loaded).toHaveProperty("metadata");
      expect(loaded?.features[0].id).toBe("compat.test");
      expect(loaded?.metadata.projectGoal).toBe("Test project");
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

    it("should return true for new modular format", async () => {
      // Manually create the new format
      const featuresDir = path.join(tempDir, "ai", "features");
      await fs.mkdir(featuresDir, { recursive: true });
      await fs.writeFile(
        path.join(featuresDir, "index.json"),
        JSON.stringify({ version: "2.0.0", features: {} })
      );

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

    it("should return features unchanged if ID not found", () => {
      const features = [createTestFeature({ id: "f1", status: "failing" })];
      const updated = updateFeatureStatus(features, "nonexistent", "passing");

      expect(updated[0].status).toBe("failing");
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

  describe("updateFeatureVerification", () => {
    it("should update verification of specified feature", () => {
      const features = [
        createTestFeature({ id: "f1" }),
        createTestFeature({ id: "f2" }),
      ];
      const verification = {
        verifiedAt: "2024-01-15T10:00:00Z",
        verdict: "pass" as const,
        verifiedBy: "test",
        commitHash: "abc123",
        summary: "All tests passed",
      };
      const updated = updateFeatureVerification(features, "f1", verification);

      expect(updated[0].verification).toEqual(verification);
      expect(updated[1].verification).toBeUndefined();
    });

    it("should return features unchanged if ID not found", () => {
      const features = [createTestFeature({ id: "f1" })];
      const verification = {
        verifiedAt: "2024-01-15T10:00:00Z",
        verdict: "pass" as const,
        verifiedBy: "test",
        commitHash: "abc123",
        summary: "Test",
      };
      const updated = updateFeatureVerification(features, "nonexistent", verification);

      expect(updated[0].verification).toBeUndefined();
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

    it("should return features unchanged if ID not found", () => {
      const features = [createTestFeature({ id: "f1", status: "passing" })];
      const updated = deprecateFeature(features, "nonexistent", "f2");

      expect(updated[0].status).toBe("passing");
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

  describe("updateFeatureStatusQuick", () => {
    it("should update only index and single feature file", async () => {
      // Set up modular format
      const list = createTestFeatureList([
        createTestFeature({ id: "quick.test", module: "quick", status: "failing" }),
        createTestFeature({ id: "quick.other", module: "quick", status: "failing" }),
      ]);
      await saveFeatureList(tempDir, list);

      // Update status
      const updated = await updateFeatureStatusQuick(tempDir, "quick.test", "passing");

      expect(updated.status).toBe("passing");

      // Verify index was updated
      const indexPath = path.join(tempDir, "ai", "features", "index.json");
      const indexContent = await fs.readFile(indexPath, "utf-8");
      const index = JSON.parse(indexContent);
      expect(index.features["quick.test"].status).toBe("passing");
      expect(index.features["quick.other"].status).toBe("failing"); // Unchanged

      // Verify feature file was updated
      const featurePath = path.join(tempDir, "ai", "features", "quick", "test.md");
      const featureContent = await fs.readFile(featurePath, "utf-8");
      expect(featureContent).toContain("status: passing");
    });

    it("should validate status value", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "validate.test", module: "validate", status: "failing" }),
      ]);
      await saveFeatureList(tempDir, list);

      await expect(
        updateFeatureStatusQuick(tempDir, "validate.test", "invalid_status" as any)
      ).rejects.toThrow("Invalid status");
    });

    it("should return updated feature", async () => {
      const list = createTestFeatureList([
        createTestFeature({
          id: "return.test",
          module: "return",
          status: "failing",
          description: "Return test",
        }),
      ]);
      await saveFeatureList(tempDir, list);

      const updated = await updateFeatureStatusQuick(tempDir, "return.test", "passing", "Updated notes");

      expect(updated.id).toBe("return.test");
      expect(updated.status).toBe("passing");
      expect(updated.notes).toBe("Updated notes");
      expect(updated.description).toBe("Return test");
    });

    it("should throw error for non-existent feature", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "exists.test", module: "exists", status: "failing" }),
      ]);
      await saveFeatureList(tempDir, list);

      await expect(
        updateFeatureStatusQuick(tempDir, "nonexistent.feature", "passing")
      ).rejects.toThrow("Feature not found");
    });

    it("should throw error when index does not exist", async () => {
      await expect(
        updateFeatureStatusQuick(tempDir, "any.feature", "passing")
      ).rejects.toThrow("Feature index not found");
    });

    it("should throw error when feature file is missing but exists in index", async () => {
      // Create index with feature but no markdown file
      const featuresDir = path.join(tempDir, "ai", "features");
      await fs.mkdir(featuresDir, { recursive: true });

      const index = {
        version: "2.0.0",
        updatedAt: "2024-01-15T10:00:00Z",
        metadata: {
          projectGoal: "Test",
          createdAt: "2024-01-15T10:00:00Z",
          updatedAt: "2024-01-15T10:00:00Z",
          version: "1.0.0",
        },
        features: {
          "missing.file": {
            status: "failing",
            priority: 1,
            module: "missing",
            description: "Missing file test",
          },
        },
      };
      await fs.writeFile(
        path.join(featuresDir, "index.json"),
        JSON.stringify(index, null, 2)
      );

      // No markdown file exists - should throw error
      await expect(
        updateFeatureStatusQuick(tempDir, "missing.file", "passing")
      ).rejects.toThrow("Feature file not found");
    });
  });

  describe("getFeatureStatsQuick", () => {
    it("should read only index.json for stats", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "stats.a", module: "stats", status: "passing" }),
        createTestFeature({ id: "stats.b", module: "stats", status: "passing" }),
        createTestFeature({ id: "stats.c", module: "stats", status: "failing" }),
        createTestFeature({ id: "stats.d", module: "stats", status: "blocked" }),
        createTestFeature({ id: "stats.e", module: "stats", status: "needs_review" }),
      ]);
      await saveFeatureList(tempDir, list);

      const stats = await getFeatureStatsQuick(tempDir);

      expect(stats.passing).toBe(2);
      expect(stats.failing).toBe(1);
      expect(stats.blocked).toBe(1);
      expect(stats.needs_review).toBe(1);
      expect(stats.deprecated).toBe(0);
    });

    it("should return Record<FeatureStatus, number> type", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "type.test", module: "type", status: "passing" }),
      ]);
      await saveFeatureList(tempDir, list);

      const stats = await getFeatureStatsQuick(tempDir);

      // Verify all status keys exist
      expect(stats).toHaveProperty("passing");
      expect(stats).toHaveProperty("failing");
      expect(stats).toHaveProperty("blocked");
      expect(stats).toHaveProperty("needs_review");
      expect(stats).toHaveProperty("deprecated");

      // Verify all values are numbers
      expect(typeof stats.passing).toBe("number");
      expect(typeof stats.failing).toBe("number");
    });

    it("should throw error when index does not exist", async () => {
      await expect(getFeatureStatsQuick(tempDir)).rejects.toThrow(
        "Feature index not found"
      );
    });

    it("should return same results as getFeatureStats", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "compare.a", module: "compare", status: "passing" }),
        createTestFeature({ id: "compare.b", module: "compare", status: "failing" }),
        createTestFeature({ id: "compare.c", module: "compare", status: "deprecated" }),
      ]);
      await saveFeatureList(tempDir, list);

      const quickStats = await getFeatureStatsQuick(tempDir);
      const regularStats = getFeatureStats(list.features);

      expect(quickStats).toEqual(regularStats);
    });
  });

  describe("selectNextFeatureQuick", () => {
    it("should read index.json for selection", async () => {
      const list = createTestFeatureList([
        createTestFeature({ id: "next.a", module: "next", status: "passing", priority: 1 }),
        createTestFeature({ id: "next.b", module: "next", status: "failing", priority: 2 }),
        createTestFeature({ id: "next.c", module: "next", status: "failing", priority: 3 }),
      ]);
      await saveFeatureList(tempDir, list);

      const next = await selectNextFeatureQuick(tempDir);

      expect(next).not.toBeNull();
      expect(next?.id).toBe("next.b"); // Lowest priority among failing
    });

    it("should return Feature or null", async () => {
      // All passing - should return null
      const allPassing = createTestFeatureList([
        createTestFeature({ id: "null.test", module: "null", status: "passing" }),
      ]);
      await saveFeatureList(tempDir, allPassing);

      const result = await selectNextFeatureQuick(tempDir);
      expect(result).toBeNull();
    });

    it("should load full feature when selected", async () => {
      const list = createTestFeatureList([
        createTestFeature({
          id: "full.load",
          module: "full",
          status: "failing",
          description: "Full load test",
          acceptance: ["First criterion", "Second criterion"],
        }),
      ]);
      await saveFeatureList(tempDir, list);

      const next = await selectNextFeatureQuick(tempDir);

      expect(next).not.toBeNull();
      expect(next?.id).toBe("full.load");
      expect(next?.acceptance).toContain("First criterion");
      expect(next?.acceptance).toContain("Second criterion");
    });

    it("should follow same priority logic as selectNextFeature", async () => {
      const features = [
        createTestFeature({ id: "prio.a", module: "prio", status: "failing", priority: 5 }),
        createTestFeature({ id: "prio.b", module: "prio", status: "needs_review", priority: 10 }),
        createTestFeature({ id: "prio.c", module: "prio", status: "failing", priority: 1 }),
      ];
      const list = createTestFeatureList(features);
      await saveFeatureList(tempDir, list);

      const quickNext = await selectNextFeatureQuick(tempDir);
      const regularNext = selectNextFeature(features);

      // Both should select needs_review first (higher priority than failing)
      expect(quickNext?.id).toBe(regularNext?.id);
      expect(quickNext?.id).toBe("prio.b");
    });

    it("should throw error when index does not exist", async () => {
      await expect(selectNextFeatureQuick(tempDir)).rejects.toThrow(
        "Feature index not found"
      );
    });

    it("should fallback to minimal feature when markdown file is missing", async () => {
      // Create index with feature but no markdown file
      const featuresDir = path.join(tempDir, "ai", "features");
      await fs.mkdir(featuresDir, { recursive: true });

      const index = {
        version: "2.0.0",
        updatedAt: "2024-01-15T10:00:00Z",
        metadata: {
          projectGoal: "Test",
          createdAt: "2024-01-15T10:00:00Z",
          updatedAt: "2024-01-15T10:00:00Z",
          version: "1.0.0",
        },
        features: {
          "orphan.feature": {
            status: "failing",
            priority: 1,
            module: "orphan",
            description: "Orphan feature without markdown file",
          },
        },
      };
      await fs.writeFile(
        path.join(featuresDir, "index.json"),
        JSON.stringify(index, null, 2)
      );

      // Should return minimal feature from index when file is missing
      const next = await selectNextFeatureQuick(tempDir);

      expect(next).not.toBeNull();
      expect(next?.id).toBe("orphan.feature");
      expect(next?.description).toBe("Orphan feature without markdown file");
      expect(next?.module).toBe("orphan");
      expect(next?.status).toBe("failing");
      expect(next?.priority).toBe(1);
      // Minimal feature defaults
      expect(next?.acceptance).toEqual([]);
      expect(next?.dependsOn).toEqual([]);
      expect(next?.version).toBe(1);
      expect(next?.origin).toBe("manual");
    });
  });
});
