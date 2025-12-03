/**
 * Tests for feature-storage.ts
 * Tests parseFeatureMarkdown, serializeFeatureMarkdown, and index operations
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  parseFeatureMarkdown,
  serializeFeatureMarkdown,
  featureIdToPath,
  pathToFeatureId,
  loadFeatureIndex,
  saveFeatureIndex,
  loadSingleFeature,
  saveSingleFeature,
  needsMigration,
  migrateToMarkdown,
  autoMigrateIfNeeded,
} from "../src/feature-storage.js";
import type { Feature, FeatureIndex } from "../src/types.js";

describe("parseFeatureMarkdown", () => {
  it("should extract YAML frontmatter into Feature object", () => {
    const content = `---
id: cli.survey
version: 2
origin: manual
dependsOn:
  - cli.init
supersedes: []
tags:
  - cli
  - survey
---

# Generate project survey

## Acceptance Criteria

1. Survey generates successfully

## Notes

Test notes.
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.id).toBe("cli.survey");
    expect(feature.version).toBe(2);
    expect(feature.origin).toBe("manual");
    expect(feature.dependsOn).toEqual(["cli.init"]);
    expect(feature.supersedes).toEqual([]);
    expect(feature.tags).toEqual(["cli", "survey"]);
  });

  it("should extract description from H1 heading", () => {
    const content = `---
id: test.feature
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---

# My Feature Description

## Acceptance Criteria

1. First criterion
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.description).toBe("My Feature Description");
  });

  it("should extract acceptance criteria from numbered list", () => {
    const content = `---
id: test.feature
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---

# Test Feature

## Acceptance Criteria

1. First acceptance criterion
2. Second acceptance criterion
3. Third acceptance criterion

## Notes

Some notes.
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.acceptance).toHaveLength(3);
    expect(feature.acceptance[0]).toBe("First acceptance criterion");
    expect(feature.acceptance[1]).toBe("Second acceptance criterion");
    expect(feature.acceptance[2]).toBe("Third acceptance criterion");
  });

  it("should extract notes from Notes section", () => {
    const content = `---
id: test.feature
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---

# Test Feature

## Acceptance Criteria

1. First criterion

## Notes

This is a multi-line note.
It spans multiple lines.
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.notes).toContain("This is a multi-line note.");
    expect(feature.notes).toContain("It spans multiple lines.");
  });

  it("should handle optional verification field", () => {
    const content = `---
id: test.feature
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
verification:
  verifiedAt: "2025-01-01T00:00:00Z"
  verdict: pass
  verifiedBy: codex
  summary: All tests pass
---

# Test Feature

## Acceptance Criteria

1. First criterion
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.verification).toBeDefined();
    expect(feature.verification?.verdict).toBe("pass");
    expect(feature.verification?.verifiedBy).toBe("codex");
  });

  it("should handle optional testRequirements field", () => {
    const content = `---
id: test.feature
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
testRequirements:
  unit:
    required: true
    pattern: "tests/**/*.test.ts"
---

# Test Feature

## Acceptance Criteria

1. First criterion
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.testRequirements).toBeDefined();
    expect(feature.testRequirements?.unit?.required).toBe(true);
    expect(feature.testRequirements?.unit?.pattern).toBe("tests/**/*.test.ts");
  });

  it("should extract module from feature ID", () => {
    const content = `---
id: storage.parse_serialize
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---

# Parse and serialize

## Acceptance Criteria

1. Works correctly
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.module).toBe("storage");
  });
});

describe("serializeFeatureMarkdown", () => {
  it("should produce valid YAML frontmatter", () => {
    const feature: Feature = {
      id: "cli.survey",
      description: "Generate project survey",
      module: "cli",
      priority: 10,
      status: "passing",
      acceptance: ["Survey generates successfully"],
      dependsOn: [],
      supersedes: [],
      tags: ["cli"],
      version: 1,
      origin: "manual",
      notes: "",
    };

    const markdown = serializeFeatureMarkdown(feature);

    expect(markdown).toContain("---");
    expect(markdown).toContain("id: cli.survey");
    expect(markdown).toContain("version: 1");
    expect(markdown).toContain("origin: manual");
  });

  it("should produce valid Markdown body", () => {
    const feature: Feature = {
      id: "test.feature",
      description: "Test Feature Description",
      module: "test",
      priority: 5,
      status: "failing",
      acceptance: ["First criterion", "Second criterion"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "Some notes here.",
    };

    const markdown = serializeFeatureMarkdown(feature);

    expect(markdown).toContain("# Test Feature Description");
    expect(markdown).toContain("## Acceptance Criteria");
    expect(markdown).toContain("1. First criterion");
    expect(markdown).toContain("2. Second criterion");
    expect(markdown).toContain("## Notes");
    expect(markdown).toContain("Some notes here.");
  });

  it("should include optional fields when present", () => {
    const feature: Feature = {
      id: "test.feature",
      description: "Test Feature",
      module: "test",
      priority: 1,
      status: "passing",
      acceptance: ["Criterion"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
      e2eTags: ["@smoke"],
      testRequirements: {
        unit: { required: true, pattern: "tests/**/*.test.ts" },
      },
      verification: {
        verifiedAt: "2025-01-01T00:00:00Z",
        verdict: "pass",
        verifiedBy: "codex",
        summary: "All pass",
      },
    };

    const markdown = serializeFeatureMarkdown(feature);

    expect(markdown).toContain("e2eTags:");
    expect(markdown).toContain("testRequirements:");
    expect(markdown).toContain("verification:");
  });
});

describe("round-trip: parse(serialize(feature))", () => {
  it("should produce equivalent feature after round-trip", () => {
    const original: Feature = {
      id: "cli.survey",
      description: "Generate project survey report",
      module: "cli",
      priority: 10,
      status: "passing",
      acceptance: [
        "Survey generates markdown output",
        "Survey includes all modules",
        "Survey is saved to file",
      ],
      dependsOn: ["cli.init"],
      supersedes: [],
      tags: ["cli", "survey"],
      version: 2,
      origin: "manual",
      notes: "This is a test note.",
    };

    const markdown = serializeFeatureMarkdown(original);
    const parsed = parseFeatureMarkdown(markdown);

    // Core fields should match
    expect(parsed.id).toBe(original.id);
    expect(parsed.description).toBe(original.description);
    expect(parsed.module).toBe(original.module);
    expect(parsed.priority).toBe(original.priority);
    expect(parsed.status).toBe(original.status);
    expect(parsed.version).toBe(original.version);
    expect(parsed.origin).toBe(original.origin);
    expect(parsed.dependsOn).toEqual(original.dependsOn);
    expect(parsed.supersedes).toEqual(original.supersedes);
    expect(parsed.tags).toEqual(original.tags);
    expect(parsed.acceptance).toEqual(original.acceptance);
    expect(parsed.notes).toBe(original.notes);
  });

  it("should preserve optional fields after round-trip", () => {
    const original: Feature = {
      id: "test.roundtrip",
      description: "Round trip test",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: ["Works"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
      e2eTags: ["@tag1", "@tag2"],
      testRequirements: {
        unit: { required: true, pattern: "tests/**/*.test.ts" },
        e2e: { required: false, tags: ["@smoke"] },
      },
      verification: {
        verifiedAt: "2025-01-01T00:00:00Z",
        verdict: "pass",
        verifiedBy: "codex",
        summary: "All tests pass",
      },
    };

    const markdown = serializeFeatureMarkdown(original);
    const parsed = parseFeatureMarkdown(markdown);

    expect(parsed.e2eTags).toEqual(original.e2eTags);
    expect(parsed.testRequirements).toEqual(original.testRequirements);
    expect(parsed.verification).toEqual(original.verification);
  });
});

describe("featureIdToPath", () => {
  it("should convert cli.survey to cli/survey.md", () => {
    expect(featureIdToPath("cli.survey")).toBe("cli/survey.md");
  });

  it("should handle deeply nested IDs", () => {
    expect(featureIdToPath("module.sub.feature")).toBe("module/sub.feature.md");
  });

  it("should handle single-part IDs", () => {
    expect(featureIdToPath("standalone")).toBe("standalone.md");
  });
});

describe("pathToFeatureId", () => {
  it("should convert cli/survey.md to cli.survey", () => {
    expect(pathToFeatureId("cli/survey.md")).toBe("cli.survey");
  });

  it("should handle nested paths", () => {
    expect(pathToFeatureId("module/sub.feature.md")).toBe("module.sub.feature");
  });

  it("should handle root-level files", () => {
    expect(pathToFeatureId("standalone.md")).toBe("standalone");
  });
});

describe("loadFeatureIndex", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-storage-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should read ai/features/index.json and return FeatureIndex", async () => {
    const indexData: FeatureIndex = {
      version: "2.0.0",
      updatedAt: "2025-01-01T00:00:00Z",
      metadata: {
        projectGoal: "Test project",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        version: "1.0.0",
      },
      features: {
        "cli.survey": {
          status: "passing",
          priority: 10,
          module: "cli",
          description: "Generate project survey",
        },
      },
    };

    await fs.mkdir(path.join(tempDir, "ai/features"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/features/index.json"),
      JSON.stringify(indexData, null, 2)
    );

    const result = await loadFeatureIndex(tempDir);

    expect(result).not.toBeNull();
    expect(result?.version).toBe("2.0.0");
    expect(result?.features["cli.survey"]).toBeDefined();
    expect(result?.features["cli.survey"].status).toBe("passing");
  });

  it("should return null if file doesn't exist", async () => {
    const result = await loadFeatureIndex(tempDir);
    expect(result).toBeNull();
  });
});

describe("saveFeatureIndex", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-storage-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should write JSON with proper formatting", async () => {
    const indexData: FeatureIndex = {
      version: "2.0.0",
      updatedAt: "2025-01-01T00:00:00Z",
      metadata: {
        projectGoal: "Test project",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        version: "1.0.0",
      },
      features: {
        "test.feature": {
          status: "failing",
          priority: 5,
          module: "test",
          description: "Test feature",
        },
      },
    };

    await saveFeatureIndex(tempDir, indexData);

    const content = await fs.readFile(
      path.join(tempDir, "ai/features/index.json"),
      "utf-8"
    );

    // Check proper JSON formatting (should have indentation)
    expect(content).toContain("  ");
    expect(content).toContain('"version": "2.0.0"');
    expect(content).toContain('"test.feature"');
  });

  it("should update the updatedAt timestamp", async () => {
    const oldTimestamp = "2020-01-01T00:00:00Z";
    const indexData: FeatureIndex = {
      version: "2.0.0",
      updatedAt: oldTimestamp,
      metadata: {
        projectGoal: "Test",
        createdAt: "2020-01-01T00:00:00Z",
        updatedAt: "2020-01-01T00:00:00Z",
        version: "1.0.0",
      },
      features: {},
    };

    await saveFeatureIndex(tempDir, indexData);

    const savedIndex = await loadFeatureIndex(tempDir);
    expect(savedIndex?.updatedAt).not.toBe(oldTimestamp);
    // Check it's a recent timestamp (within last minute)
    const savedDate = new Date(savedIndex!.updatedAt);
    const now = new Date();
    expect(now.getTime() - savedDate.getTime()).toBeLessThan(60000);
  });

  it("should use atomic write to prevent corruption", async () => {
    const indexData: FeatureIndex = {
      version: "2.0.0",
      updatedAt: "2025-01-01T00:00:00Z",
      metadata: {
        projectGoal: "Test",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        version: "1.0.0",
      },
      features: {},
    };

    await saveFeatureIndex(tempDir, indexData);

    // Verify no temp file remains after save
    const files = await fs.readdir(path.join(tempDir, "ai/features"));
    expect(files).not.toContain("index.json.tmp");
    expect(files).toContain("index.json");
  });

  it("should create directory structure if it doesn't exist", async () => {
    const indexData: FeatureIndex = {
      version: "2.0.0",
      updatedAt: "2025-01-01T00:00:00Z",
      metadata: {
        projectGoal: "Test",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        version: "1.0.0",
      },
      features: {},
    };

    // Directory doesn't exist yet
    await saveFeatureIndex(tempDir, indexData);

    // Verify file was created
    const exists = await fs
      .access(path.join(tempDir, "ai/features/index.json"))
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(true);
  });
});

describe("loadSingleFeature", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-storage-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should read ai/features/{module}/{name}.md", async () => {
    const featureContent = `---
id: cli.survey
module: cli
priority: 10
status: passing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---

# Generate project survey

## Acceptance Criteria

1. Survey generates successfully

## Notes

Test feature.
`;
    await fs.mkdir(path.join(tempDir, "ai/features/cli"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/features/cli/survey.md"),
      featureContent
    );

    const feature = await loadSingleFeature(tempDir, "cli.survey");

    expect(feature).not.toBeNull();
    expect(feature?.id).toBe("cli.survey");
    expect(feature?.module).toBe("cli");
    expect(feature?.description).toBe("Generate project survey");
    expect(feature?.status).toBe("passing");
  });

  it("should return null if file doesn't exist", async () => {
    const feature = await loadSingleFeature(tempDir, "nonexistent.feature");
    expect(feature).toBeNull();
  });
});

describe("saveSingleFeature", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-storage-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should create module directory if needed", async () => {
    const feature: Feature = {
      id: "newmodule.newfeature",
      description: "New feature",
      module: "newmodule",
      priority: 5,
      status: "failing",
      acceptance: ["Works"],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };

    await saveSingleFeature(tempDir, feature);

    // Verify directory was created
    const dirExists = await fs
      .access(path.join(tempDir, "ai/features/newmodule"))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });

  it("should write markdown with YAML frontmatter", async () => {
    const feature: Feature = {
      id: "test.feature",
      description: "Test feature description",
      module: "test",
      priority: 10,
      status: "passing",
      acceptance: ["First criterion", "Second criterion"],
      dependsOn: [],
      supersedes: [],
      tags: ["test"],
      version: 2,
      origin: "manual",
      notes: "Test notes here.",
    };

    await saveSingleFeature(tempDir, feature);

    const content = await fs.readFile(
      path.join(tempDir, "ai/features/test/feature.md"),
      "utf-8"
    );

    // Check frontmatter
    expect(content).toContain("---");
    expect(content).toContain("id: test.feature");
    expect(content).toContain("status: passing");
    expect(content).toContain("priority: 10");

    // Check markdown body
    expect(content).toContain("# Test feature description");
    expect(content).toContain("## Acceptance Criteria");
    expect(content).toContain("1. First criterion");
    expect(content).toContain("2. Second criterion");
    expect(content).toContain("## Notes");
    expect(content).toContain("Test notes here.");
  });

  it("should round-trip correctly with loadSingleFeature", async () => {
    const original: Feature = {
      id: "roundtrip.test",
      description: "Round trip test",
      module: "roundtrip",
      priority: 3,
      status: "failing",
      acceptance: ["Criterion one", "Criterion two"],
      dependsOn: ["other.feature"],
      supersedes: [],
      tags: ["test", "roundtrip"],
      version: 1,
      origin: "manual",
      notes: "Notes for round trip.",
    };

    await saveSingleFeature(tempDir, original);
    const loaded = await loadSingleFeature(tempDir, "roundtrip.test");

    expect(loaded).not.toBeNull();
    expect(loaded?.id).toBe(original.id);
    expect(loaded?.description).toBe(original.description);
    expect(loaded?.module).toBe(original.module);
    expect(loaded?.priority).toBe(original.priority);
    expect(loaded?.status).toBe(original.status);
    expect(loaded?.acceptance).toEqual(original.acceptance);
    expect(loaded?.dependsOn).toEqual(original.dependsOn);
    expect(loaded?.tags).toEqual(original.tags);
    expect(loaded?.notes).toBe(original.notes);
  });
});

describe("needsMigration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-storage-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should return true if feature_list.json exists but index.json doesn't", async () => {
    // Create legacy feature_list.json
    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/feature_list.json"),
      JSON.stringify({ features: [], metadata: {} })
    );

    const result = await needsMigration(tempDir);
    expect(result).toBe(true);
  });

  it("should return false if index.json already exists", async () => {
    // Create both files
    await fs.mkdir(path.join(tempDir, "ai/features"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/feature_list.json"),
      JSON.stringify({ features: [], metadata: {} })
    );
    await fs.writeFile(
      path.join(tempDir, "ai/features/index.json"),
      JSON.stringify({ version: "2.0.0", features: {}, metadata: {} })
    );

    const result = await needsMigration(tempDir);
    expect(result).toBe(false);
  });

  it("should return false if neither file exists", async () => {
    const result = await needsMigration(tempDir);
    expect(result).toBe(false);
  });

  it("should return false if only index.json exists", async () => {
    // Create only index.json (new format already in use)
    await fs.mkdir(path.join(tempDir, "ai/features"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/features/index.json"),
      JSON.stringify({ version: "2.0.0", features: {}, metadata: {} })
    );

    const result = await needsMigration(tempDir);
    expect(result).toBe(false);
  });
});

describe("migrateToMarkdown", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-storage-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createLegacyFeatureList = async (features: Feature[]) => {
    const data = {
      features,
      metadata: {
        projectGoal: "Test project",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        version: "1.0.0",
      },
    };
    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/feature_list.json"),
      JSON.stringify(data, null, 2)
    );
  };

  it("should load existing feature_list.json", async () => {
    const features: Feature[] = [
      {
        id: "cli.survey",
        description: "Generate survey",
        module: "cli",
        priority: 10,
        status: "passing",
        acceptance: ["Works"],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ];
    await createLegacyFeatureList(features);

    const result = await migrateToMarkdown(tempDir);

    expect(result.migrated).toBe(1);
    expect(result.success).toBe(true);
  });

  it("should create ai/features/ directory structure", async () => {
    await createLegacyFeatureList([]);

    await migrateToMarkdown(tempDir);

    const dirExists = await fs
      .access(path.join(tempDir, "ai/features"))
      .then(() => true)
      .catch(() => false);
    expect(dirExists).toBe(true);
  });

  it("should write each feature to {module}/{name}.md", async () => {
    const features: Feature[] = [
      {
        id: "cli.survey",
        description: "Generate survey",
        module: "cli",
        priority: 10,
        status: "passing",
        acceptance: ["Works"],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
      {
        id: "auth.login",
        description: "User login",
        module: "auth",
        priority: 5,
        status: "failing",
        acceptance: ["Login works"],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ];
    await createLegacyFeatureList(features);

    await migrateToMarkdown(tempDir);

    // Check feature files exist
    const cliSurveyExists = await fs
      .access(path.join(tempDir, "ai/features/cli/survey.md"))
      .then(() => true)
      .catch(() => false);
    const authLoginExists = await fs
      .access(path.join(tempDir, "ai/features/auth/login.md"))
      .then(() => true)
      .catch(() => false);

    expect(cliSurveyExists).toBe(true);
    expect(authLoginExists).toBe(true);
  });

  it("should build and save index.json", async () => {
    const features: Feature[] = [
      {
        id: "cli.survey",
        description: "Generate survey",
        module: "cli",
        priority: 10,
        status: "passing",
        acceptance: ["Works"],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ];
    await createLegacyFeatureList(features);

    await migrateToMarkdown(tempDir);

    const index = await loadFeatureIndex(tempDir);
    expect(index).not.toBeNull();
    expect(index?.version).toBe("2.0.0");
    expect(index?.features["cli.survey"]).toBeDefined();
    expect(index?.features["cli.survey"].status).toBe("passing");
  });

  it("should backup old file as feature_list.json.bak", async () => {
    await createLegacyFeatureList([]);

    await migrateToMarkdown(tempDir);

    const backupExists = await fs
      .access(path.join(tempDir, "ai/feature_list.json.bak"))
      .then(() => true)
      .catch(() => false);
    expect(backupExists).toBe(true);
  });

  it("should return MigrationResult with count and errors", async () => {
    const features: Feature[] = [
      {
        id: "test.one",
        description: "Test one",
        module: "test",
        priority: 1,
        status: "failing",
        acceptance: [],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
      {
        id: "test.two",
        description: "Test two",
        module: "test",
        priority: 2,
        status: "passing",
        acceptance: [],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ];
    await createLegacyFeatureList(features);

    const result = await migrateToMarkdown(tempDir);

    expect(result.migrated).toBe(2);
    expect(result.errors).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("should return error if feature_list.json doesn't exist", async () => {
    const result = await migrateToMarkdown(tempDir);

    expect(result.migrated).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.success).toBe(false);
  });

  it("should preserve data integrity - migrated files match original data", async () => {
    // Create a feature with all fields populated
    const originalFeatures: Feature[] = [
      {
        id: "integrity.test",
        description: "Test data integrity during migration",
        module: "integrity",
        priority: 5,
        status: "passing",
        acceptance: [
          "First acceptance criterion",
          "Second acceptance criterion",
          "Third acceptance criterion",
        ],
        dependsOn: ["other.feature"],
        supersedes: ["old.feature"],
        tags: ["test", "integrity"],
        version: 2,
        origin: "manual",
        notes: "Important notes about this feature.\nSpans multiple lines.",
        verification: {
          verifiedAt: "2025-01-01T00:00:00Z",
          verdict: "pass",
          verifiedBy: "codex",
          summary: "All tests pass",
        },
        testRequirements: {
          unit: { required: true, pattern: "tests/**/*.test.ts" },
        },
        e2eTags: ["@smoke", "@integrity"],
      },
    ];
    await createLegacyFeatureList(originalFeatures);

    // Perform migration
    const result = await migrateToMarkdown(tempDir);
    expect(result.success).toBe(true);
    expect(result.migrated).toBe(1);

    // Load migrated feature back
    const migratedFeature = await loadSingleFeature(tempDir, "integrity.test");

    // Verify all fields match original
    expect(migratedFeature).not.toBeNull();
    expect(migratedFeature?.id).toBe(originalFeatures[0].id);
    expect(migratedFeature?.description).toBe(originalFeatures[0].description);
    expect(migratedFeature?.module).toBe(originalFeatures[0].module);
    expect(migratedFeature?.priority).toBe(originalFeatures[0].priority);
    expect(migratedFeature?.status).toBe(originalFeatures[0].status);
    expect(migratedFeature?.acceptance).toEqual(originalFeatures[0].acceptance);
    expect(migratedFeature?.dependsOn).toEqual(originalFeatures[0].dependsOn);
    expect(migratedFeature?.supersedes).toEqual(originalFeatures[0].supersedes);
    expect(migratedFeature?.tags).toEqual(originalFeatures[0].tags);
    expect(migratedFeature?.version).toBe(originalFeatures[0].version);
    expect(migratedFeature?.origin).toBe(originalFeatures[0].origin);
    expect(migratedFeature?.notes).toBe(originalFeatures[0].notes);
    expect(migratedFeature?.verification).toEqual(originalFeatures[0].verification);
    expect(migratedFeature?.testRequirements).toEqual(originalFeatures[0].testRequirements);
    expect(migratedFeature?.e2eTags).toEqual(originalFeatures[0].e2eTags);
  });
});

describe("autoMigrateIfNeeded", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "feature-storage-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createLegacyFeatureList = async (features: Feature[]) => {
    const data = {
      features,
      metadata: {
        projectGoal: "Test project",
        createdAt: "2025-01-01T00:00:00Z",
        updatedAt: "2025-01-01T00:00:00Z",
        version: "1.0.0",
      },
    };
    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/feature_list.json"),
      JSON.stringify(data, null, 2)
    );
  };

  it("should call needsMigration to check", async () => {
    // When no files exist, should return null (needsMigration returns false)
    const result = await autoMigrateIfNeeded(tempDir, true);
    expect(result).toBeNull();
  });

  it("should call migrateToMarkdown if needed", async () => {
    const features: Feature[] = [
      {
        id: "test.feature",
        description: "Test",
        module: "test",
        priority: 1,
        status: "failing",
        acceptance: [],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ];
    await createLegacyFeatureList(features);

    const result = await autoMigrateIfNeeded(tempDir, true);

    expect(result).not.toBeNull();
    expect(result?.migrated).toBe(1);
    expect(result?.success).toBe(true);

    // Verify migration actually happened
    const index = await loadFeatureIndex(tempDir);
    expect(index).not.toBeNull();
  });

  it("should be idempotent - safe to call multiple times", async () => {
    const features: Feature[] = [
      {
        id: "test.feature",
        description: "Test",
        module: "test",
        priority: 1,
        status: "failing",
        acceptance: [],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ];
    await createLegacyFeatureList(features);

    // First call - should migrate
    const result1 = await autoMigrateIfNeeded(tempDir, true);
    expect(result1).not.toBeNull();
    expect(result1?.migrated).toBe(1);

    // Second call - should return null (already migrated)
    const result2 = await autoMigrateIfNeeded(tempDir, true);
    expect(result2).toBeNull();

    // Third call - still null
    const result3 = await autoMigrateIfNeeded(tempDir, true);
    expect(result3).toBeNull();
  });

  it("should return null if index.json already exists", async () => {
    // Create both legacy and new format
    await createLegacyFeatureList([]);
    await fs.mkdir(path.join(tempDir, "ai/features"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai/features/index.json"),
      JSON.stringify({ version: "2.0.0", features: {}, metadata: {} })
    );

    const result = await autoMigrateIfNeeded(tempDir, true);
    expect(result).toBeNull();
  });

  it("should log migration messages when not silent", async () => {
    const features: Feature[] = [
      {
        id: "test.feature",
        description: "Test",
        module: "test",
        priority: 1,
        status: "failing",
        acceptance: [],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ];
    await createLegacyFeatureList(features);

    // Capture console.log calls
    const logs: string[] = [];
    const originalLog = console.log;
    console.log = (...args) => logs.push(args.join(" "));

    try {
      const result = await autoMigrateIfNeeded(tempDir, false);
      expect(result).not.toBeNull();
      expect(result?.success).toBe(true);
      expect(logs.some((log) => log.includes("Migrating"))).toBe(true);
      expect(logs.some((log) => log.includes("Migrated"))).toBe(true);
    } finally {
      console.log = originalLog;
    }
  });
});

describe("parseFeatureMarkdown edge cases", () => {
  it("should handle testFiles field", () => {
    const content = `---
id: test.feature
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
testFiles:
  - tests/test.spec.ts
  - tests/test2.spec.ts
---

# Test Feature

## Acceptance Criteria

1. Works
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.testFiles).toBeDefined();
    expect(feature.testFiles).toHaveLength(2);
    expect(feature.testFiles).toContain("tests/test.spec.ts");
  });

  it("should handle missing optional fields with defaults", () => {
    const content = `---
id: minimal.feature
version: 1
origin: manual
---

# Minimal Feature

## Acceptance Criteria

1. Works
`;
    const feature = parseFeatureMarkdown(content);

    expect(feature.id).toBe("minimal.feature");
    expect(feature.dependsOn).toEqual([]);
    expect(feature.supersedes).toEqual([]);
    expect(feature.tags).toEqual([]);
    expect(feature.module).toBe("minimal");
    expect(feature.priority).toBe(0);
    expect(feature.status).toBe("failing");
  });
});
