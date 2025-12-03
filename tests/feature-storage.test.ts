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
