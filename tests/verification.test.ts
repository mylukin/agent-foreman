/**
 * Tests for the verification system
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  loadVerificationStore,
  saveVerificationResult,
  getLastVerification,
  createEmptyStore,
  clearVerificationResult,
  getAllVerificationResults,
  hasVerification,
  getVerificationStats,
  STORE_VERSION,
} from "../src/verification-store.js";

import {
  buildVerificationPrompt,
  parseVerificationResponse,
  truncateDiffIntelligently,
  DEFAULT_MAX_DIFF_SIZE,
} from "../src/verification-prompts.js";

import type {
  VerificationResult,
  AutomatedCheckResult,
  CriterionResult,
} from "../src/verification-types.js";

import type { Feature } from "../src/types.js";

// ============================================================================
// Test Helpers
// ============================================================================

function createTestFeature(overrides: Partial<Feature> = {}): Feature {
  return {
    id: "test.feature",
    description: "Test feature description",
    module: "test",
    priority: 1,
    status: "failing",
    acceptance: ["First criterion", "Second criterion"],
    dependsOn: [],
    supersedes: [],
    tags: [],
    version: 1,
    origin: "manual",
    notes: "",
    ...overrides,
  };
}

function createTestVerificationResult(
  overrides: Partial<VerificationResult> = {}
): VerificationResult {
  return {
    featureId: "test.feature",
    timestamp: new Date().toISOString(),
    commitHash: "abc123",
    changedFiles: ["src/test.ts"],
    diffSummary: "1 file changed",
    automatedChecks: [],
    criteriaResults: [
      {
        criterion: "First criterion",
        index: 0,
        satisfied: true,
        reasoning: "Test reasoning",
        evidence: ["src/test.ts:10"],
        confidence: 0.95,
      },
    ],
    verdict: "pass",
    verifiedBy: "claude",
    overallReasoning: "All criteria met",
    suggestions: [],
    ...overrides,
  };
}

// ============================================================================
// Verification Store Tests
// ============================================================================

describe("Verification Store", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verification-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("createEmptyStore", () => {
    it("should create a valid empty store", () => {
      const store = createEmptyStore();

      expect(store.results).toEqual({});
      expect(store.version).toBe(STORE_VERSION);
      expect(store.updatedAt).toBeDefined();
    });
  });

  describe("loadVerificationStore", () => {
    it("should return null for non-existent store", async () => {
      const store = await loadVerificationStore(tempDir);
      expect(store).toBeNull();
    });

    it("should load existing store", async () => {
      // Create store directory and file
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      const storeData = {
        results: {
          "test.feature": createTestVerificationResult(),
        },
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(storeData)
      );

      const store = await loadVerificationStore(tempDir);

      expect(store).not.toBeNull();
      expect(store?.results["test.feature"]).toBeDefined();
      expect(store?.results["test.feature"].verdict).toBe("pass");
    });

    it("should handle corrupted store gracefully", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });
      await fs.writeFile(path.join(storeDir, "results.json"), "{ invalid json");

      const store = await loadVerificationStore(tempDir);

      expect(store).not.toBeNull();
      expect(store?.results).toEqual({});
    });
  });

  describe("saveVerificationResult", () => {
    it("should save result and create directory if needed", async () => {
      const result = createTestVerificationResult();

      await saveVerificationResult(tempDir, result);

      const storePath = path.join(
        tempDir,
        "ai",
        "verification",
        "results.json"
      );
      const content = await fs.readFile(storePath, "utf-8");
      const store = JSON.parse(content);

      expect(store.results["test.feature"]).toBeDefined();
      expect(store.results["test.feature"].verdict).toBe("pass");
    });

    it("should update existing result", async () => {
      const result1 = createTestVerificationResult({ verdict: "fail" });
      const result2 = createTestVerificationResult({ verdict: "pass" });

      await saveVerificationResult(tempDir, result1);
      await saveVerificationResult(tempDir, result2);

      const store = await loadVerificationStore(tempDir);

      expect(store?.results["test.feature"].verdict).toBe("pass");
    });
  });

  describe("getLastVerification", () => {
    it("should return null for non-existent verification", async () => {
      const result = await getLastVerification(tempDir, "non.existent");
      expect(result).toBeNull();
    });

    it("should return stored verification", async () => {
      const saved = createTestVerificationResult();
      await saveVerificationResult(tempDir, saved);

      const result = await getLastVerification(tempDir, "test.feature");

      expect(result).not.toBeNull();
      expect(result?.verdict).toBe("pass");
    });
  });

  describe("clearVerificationResult", () => {
    it("should clear existing verification result", async () => {
      const result = createTestVerificationResult();
      await saveVerificationResult(tempDir, result);

      // Verify it exists
      const before = await getLastVerification(tempDir, "test.feature");
      expect(before).not.toBeNull();

      // Clear it
      await clearVerificationResult(tempDir, "test.feature");

      // Verify it's gone
      const after = await getLastVerification(tempDir, "test.feature");
      expect(after).toBeNull();
    });

    it("should do nothing when store doesn't exist", async () => {
      // Should not throw
      await clearVerificationResult(tempDir, "non.existent");
    });

    it("should do nothing when feature doesn't exist in store", async () => {
      const result = createTestVerificationResult({ featureId: "other.feature" });
      await saveVerificationResult(tempDir, result);

      // Should not throw
      await clearVerificationResult(tempDir, "non.existent");

      // Other feature should still exist
      const other = await getLastVerification(tempDir, "other.feature");
      expect(other).not.toBeNull();
    });
  });

  describe("getAllVerificationResults", () => {
    it("should return empty object when no store exists", async () => {
      const results = await getAllVerificationResults(tempDir);
      expect(results).toEqual({});
    });

    it("should return all stored results", async () => {
      const result1 = createTestVerificationResult({ featureId: "feature.one" });
      const result2 = createTestVerificationResult({ featureId: "feature.two", verdict: "fail" });
      const result3 = createTestVerificationResult({ featureId: "feature.three", verdict: "needs_review" });

      await saveVerificationResult(tempDir, result1);
      await saveVerificationResult(tempDir, result2);
      await saveVerificationResult(tempDir, result3);

      const results = await getAllVerificationResults(tempDir);

      expect(Object.keys(results)).toHaveLength(3);
      expect(results["feature.one"].verdict).toBe("pass");
      expect(results["feature.two"].verdict).toBe("fail");
      expect(results["feature.three"].verdict).toBe("needs_review");
    });
  });

  describe("hasVerification", () => {
    it("should return false when no store exists", async () => {
      const has = await hasVerification(tempDir, "test.feature");
      expect(has).toBe(false);
    });

    it("should return false when feature not verified", async () => {
      const result = createTestVerificationResult({ featureId: "other.feature" });
      await saveVerificationResult(tempDir, result);

      const has = await hasVerification(tempDir, "test.feature");
      expect(has).toBe(false);
    });

    it("should return true when feature has verification", async () => {
      const result = createTestVerificationResult();
      await saveVerificationResult(tempDir, result);

      const has = await hasVerification(tempDir, "test.feature");
      expect(has).toBe(true);
    });
  });

  describe("getVerificationStats", () => {
    it("should return zeros when no store exists", async () => {
      const stats = await getVerificationStats(tempDir);

      expect(stats.total).toBe(0);
      expect(stats.passing).toBe(0);
      expect(stats.failing).toBe(0);
      expect(stats.needsReview).toBe(0);
    });

    it("should count verification results by verdict", async () => {
      await saveVerificationResult(tempDir, createTestVerificationResult({ featureId: "f1", verdict: "pass" }));
      await saveVerificationResult(tempDir, createTestVerificationResult({ featureId: "f2", verdict: "pass" }));
      await saveVerificationResult(tempDir, createTestVerificationResult({ featureId: "f3", verdict: "fail" }));
      await saveVerificationResult(tempDir, createTestVerificationResult({ featureId: "f4", verdict: "needs_review" }));
      await saveVerificationResult(tempDir, createTestVerificationResult({ featureId: "f5", verdict: "needs_review" }));

      const stats = await getVerificationStats(tempDir);

      expect(stats.total).toBe(5);
      expect(stats.passing).toBe(2);
      expect(stats.failing).toBe(1);
      expect(stats.needsReview).toBe(2);
    });
  });

  describe("loadVerificationStore - corrupted results field", () => {
    it("should handle store with invalid results field", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      // Write store with results set to a non-object value
      const invalidStore = {
        results: "not an object",
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(invalidStore)
      );

      const store = await loadVerificationStore(tempDir);

      expect(store).not.toBeNull();
      expect(store?.results).toEqual({});
    });
  });
});

// ============================================================================
// Verification Prompts Tests
// ============================================================================

describe("Verification Prompts", () => {
  describe("buildVerificationPrompt", () => {
    it("should include feature information", () => {
      const feature = createTestFeature();
      const prompt = buildVerificationPrompt(feature, "diff content", [], []);

      expect(prompt).toContain("test.feature");
      expect(prompt).toContain("Test feature description");
      expect(prompt).toContain("test"); // module
    });

    it("should include acceptance criteria", () => {
      const feature = createTestFeature({
        acceptance: ["Criterion A", "Criterion B", "Criterion C"],
      });
      const prompt = buildVerificationPrompt(feature, "diff", [], []);

      expect(prompt).toContain("1. Criterion A");
      expect(prompt).toContain("2. Criterion B");
      expect(prompt).toContain("3. Criterion C");
    });

    it("should include git diff", () => {
      const feature = createTestFeature();
      const diff = `diff --git a/src/test.ts b/src/test.ts
+function newFunction() {
+  return true;
+}`;
      const prompt = buildVerificationPrompt(feature, diff, [], []);

      expect(prompt).toContain("function newFunction");
      expect(prompt).toContain("return true");
    });

    it("should include changed files list", () => {
      const feature = createTestFeature();
      const files = ["src/foo.ts", "src/bar.ts", "tests/foo.test.ts"];
      const prompt = buildVerificationPrompt(feature, "diff", files, []);

      expect(prompt).toContain("src/foo.ts");
      expect(prompt).toContain("src/bar.ts");
      expect(prompt).toContain("tests/foo.test.ts");
    });

    it("should include automated check results", () => {
      const feature = createTestFeature();
      const checks: AutomatedCheckResult[] = [
        { type: "test", success: true, duration: 1500 },
        { type: "lint", success: false, errorCount: 3 },
      ];
      const prompt = buildVerificationPrompt(feature, "diff", [], checks);

      expect(prompt).toContain("TEST");
      expect(prompt).toContain("PASSED");
      expect(prompt).toContain("LINT");
      expect(prompt).toContain("FAILED");
    });
  });

  describe("parseVerificationResponse", () => {
    it("should parse valid JSON response", () => {
      const response = JSON.stringify({
        criteriaResults: [
          {
            index: 0,
            satisfied: true,
            reasoning: "Implemented correctly",
            evidence: ["src/test.ts:10"],
            confidence: 0.95,
          },
          {
            index: 1,
            satisfied: false,
            reasoning: "Not implemented",
            confidence: 0.8,
          },
        ],
        verdict: "fail",
        overallReasoning: "One criterion not met",
        suggestions: ["Add missing feature"],
      });

      const result = parseVerificationResponse(response, [
        "First criterion",
        "Second criterion",
      ]);

      expect(result.verdict).toBe("fail");
      expect(result.criteriaResults).toHaveLength(2);
      expect(result.criteriaResults[0].satisfied).toBe(true);
      expect(result.criteriaResults[1].satisfied).toBe(false);
      expect(result.suggestions).toContain("Add missing feature");
    });

    it("should extract JSON from code block", () => {
      const response = `Here is my analysis:

\`\`\`json
{
  "criteriaResults": [
    {"index": 0, "satisfied": true, "reasoning": "OK", "confidence": 0.9}
  ],
  "verdict": "pass",
  "overallReasoning": "All good"
}
\`\`\`

Thank you.`;

      const result = parseVerificationResponse(response, ["Single criterion"]);

      expect(result.verdict).toBe("pass");
      expect(result.criteriaResults[0].satisfied).toBe(true);
    });

    it("should handle malformed response gracefully", () => {
      const response = "This is not valid JSON at all";

      const result = parseVerificationResponse(response, [
        "Criterion 1",
        "Criterion 2",
      ]);

      expect(result.verdict).toBe("needs_review");
      expect(result.criteriaResults).toHaveLength(2);
      expect(result.criteriaResults[0].satisfied).toBe(false);
      expect(result.overallReasoning).toContain("Failed to parse");
    });

    it("should handle missing criteria in response", () => {
      const response = JSON.stringify({
        criteriaResults: [
          {
            index: 0,
            satisfied: true,
            reasoning: "OK",
            confidence: 0.9,
          },
          // Missing index 1
        ],
        verdict: "pass",
        overallReasoning: "Done",
      });

      const result = parseVerificationResponse(response, [
        "Criterion 1",
        "Criterion 2",
        "Criterion 3",
      ]);

      expect(result.criteriaResults).toHaveLength(3);
      expect(result.criteriaResults[0].satisfied).toBe(true);
      expect(result.criteriaResults[1].satisfied).toBe(false);
      expect(result.criteriaResults[2].satisfied).toBe(false);
    });

    it("should normalize confidence values", () => {
      const response = JSON.stringify({
        criteriaResults: [
          { index: 0, satisfied: true, reasoning: "OK", confidence: 1.5 },
          { index: 1, satisfied: true, reasoning: "OK", confidence: -0.5 },
          { index: 2, satisfied: true, reasoning: "OK", confidence: "invalid" },
        ],
        verdict: "pass",
        overallReasoning: "Done",
      });

      const result = parseVerificationResponse(response, [
        "C1",
        "C2",
        "C3",
      ]);

      expect(result.criteriaResults[0].confidence).toBe(1); // Capped at 1
      expect(result.criteriaResults[1].confidence).toBe(0); // Capped at 0
      expect(result.criteriaResults[2].confidence).toBe(0); // Invalid -> 0
    });

    it("should validate verdict values", () => {
      const response = JSON.stringify({
        criteriaResults: [],
        verdict: "invalid_verdict",
        overallReasoning: "Done",
      });

      const result = parseVerificationResponse(response, []);

      expect(result.verdict).toBe("needs_review");
    });
  });

  describe("truncateDiffIntelligently", () => {
    it("should return diff as-is when under limit", () => {
      const diff = "small diff content";
      const result = truncateDiffIntelligently(diff, { maxSize: 1000 });

      expect(result.wasTruncated).toBe(false);
      expect(result.diff).toBe(diff);
      expect(result.originalSize).toBe(diff.length);
      expect(result.truncatedSize).toBe(diff.length);
    });

    it("should export DEFAULT_MAX_DIFF_SIZE constant", () => {
      expect(DEFAULT_MAX_DIFF_SIZE).toBe(10000);
    });

    it("should truncate large diff with simple fallback when no file sections found", () => {
      // Create a large string without git diff format
      const largeDiff = "x".repeat(15000);
      const result = truncateDiffIntelligently(largeDiff, { maxSize: 1000, logWarnings: false });

      expect(result.wasTruncated).toBe(true);
      expect(result.originalSize).toBe(15000);
      expect(result.diff.length).toBeLessThan(2000); // Less than 2x maxSize
      expect(result.diff).toContain("truncated");
    });

    it("should preserve file headers when truncating", () => {
      const diff = `diff --git a/src/file1.ts b/src/file1.ts
index abc123..def456 100644
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,5 +1,10 @@
+added line 1
+added line 2
+added line 3
 context line
-removed line
+new line
${"x".repeat(20000)}`;

      const result = truncateDiffIntelligently(diff, { maxSize: 500, logWarnings: false });

      expect(result.wasTruncated).toBe(true);
      expect(result.diff).toContain("diff --git a/src/file1.ts");
      expect(result.diff).toContain("--- a/src/file1.ts");
      expect(result.diff).toContain("+++ b/src/file1.ts");
    });

    it("should keep hunk headers when truncating", () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -10,5 +10,10 @@
+added line
-removed line
${"context ".repeat(3000)}`;

      const result = truncateDiffIntelligently(diff, { maxSize: 400, logWarnings: false });

      expect(result.wasTruncated).toBe(true);
      expect(result.diff).toContain("@@ -10,5 +10,10 @@");
    });

    it("should prioritize changed lines (+/-) over context lines", () => {
      // Create a diff larger than maxSize with lots of context and some changes
      // The changed lines are in the middle - they should be prioritized
      const contextLines = Array.from({ length: 30 }, (_, i) => ` context line ${i}`).join("\n");
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,60 +1,62 @@
${contextLines}
+important added line
-important removed line
${contextLines}`;

      // Use a maxSize large enough to include headers and some content
      const result = truncateDiffIntelligently(diff, { maxSize: 800, logWarnings: false });

      expect(result.wasTruncated).toBe(true);
      // Changed lines should be kept (they are prioritized)
      expect(result.diff).toContain("+important added line");
      expect(result.diff).toContain("-important removed line");
    });

    it("should handle multiple file sections", () => {
      const diff = `diff --git a/src/file1.ts b/src/file1.ts
--- a/src/file1.ts
+++ b/src/file1.ts
@@ -1,3 +1,4 @@
+added in file1
 context
diff --git a/src/file2.ts b/src/file2.ts
--- a/src/file2.ts
+++ b/src/file2.ts
@@ -1,3 +1,4 @@
+added in file2
 context`;

      const result = truncateDiffIntelligently(diff, { maxSize: 500, logWarnings: false });

      // Both file headers should be present
      expect(result.diff).toContain("diff --git a/src/file1.ts");
      expect(result.diff).toContain("diff --git a/src/file2.ts");
    });

    it("should include truncation message in output", () => {
      const diff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,100 +1,100 @@
${"content line\n".repeat(1000)}`;

      const result = truncateDiffIntelligently(diff, { maxSize: 500, logWarnings: false });

      expect(result.wasTruncated).toBe(true);
      expect(result.diff).toContain("intelligently truncated");
    });

    it("should log warning when logWarnings is true", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const largeDiff = `diff --git a/src/test.ts b/src/test.ts
${"x".repeat(15000)}`;

      truncateDiffIntelligently(largeDiff, { maxSize: 1000, logWarnings: true });

      expect(warnSpy).toHaveBeenCalled();
      expect(warnSpy.mock.calls[0][0]).toContain("[verification-prompts]");

      warnSpy.mockRestore();
    });

    it("should not log warning when logWarnings is false", () => {
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      const largeDiff = `diff --git a/src/test.ts b/src/test.ts
${"x".repeat(15000)}`;

      truncateDiffIntelligently(largeDiff, { maxSize: 1000, logWarnings: false });

      expect(warnSpy).not.toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should use default maxSize when not specified", () => {
      const diff = "small diff";
      const result = truncateDiffIntelligently(diff);

      expect(result.wasTruncated).toBe(false);
      // Default is 10000, so small diff should not be truncated
    });

    it("should handle new file mode in headers", () => {
      const diff = `diff --git a/src/new-file.ts b/src/new-file.ts
new file mode 100644
index 0000000..abc123
--- /dev/null
+++ b/src/new-file.ts
@@ -0,0 +1,5 @@
+line 1
+line 2
+line 3
+line 4
+line 5`;

      const result = truncateDiffIntelligently(diff, { maxSize: 10000, logWarnings: false });

      expect(result.wasTruncated).toBe(false);
      expect(result.diff).toContain("new file mode");
    });

    it("should handle deleted file mode in headers", () => {
      const diff = `diff --git a/src/deleted-file.ts b/src/deleted-file.ts
deleted file mode 100644
index abc123..0000000
--- a/src/deleted-file.ts
+++ /dev/null
@@ -1,5 +0,0 @@
-line 1
-line 2`;

      const result = truncateDiffIntelligently(diff, { maxSize: 10000, logWarnings: false });

      expect(result.wasTruncated).toBe(false);
      expect(result.diff).toContain("deleted file mode");
    });
  });

  describe("buildVerificationPrompt with truncation", () => {
    it("should truncate large diffs in prompt", () => {
      const feature = createTestFeature();
      const largeDiff = `diff --git a/src/test.ts b/src/test.ts
--- a/src/test.ts
+++ b/src/test.ts
@@ -1,100 +1,100 @@
${"content line\n".repeat(2000)}`;

      const prompt = buildVerificationPrompt(
        feature,
        largeDiff,
        ["src/test.ts"],
        [],
        undefined,
        { maxSize: 500, logWarnings: false }
      );

      // Prompt should be smaller than original diff
      expect(prompt.length).toBeLessThan(largeDiff.length);
      expect(prompt).toContain("truncated");
    });

    it("should accept truncation options parameter", () => {
      const feature = createTestFeature();
      const diff = "small diff";

      // Should not throw with options parameter
      const prompt = buildVerificationPrompt(
        feature,
        diff,
        [],
        [],
        undefined,
        { maxSize: 20000 }
      );

      expect(prompt).toContain("small diff");
    });
  });
});

// ============================================================================
// New Per-Feature Storage Tests
// ============================================================================

import {
  loadVerificationIndex,
  createEmptyIndex,
  getVerificationHistory,
  getFeatureSummary,
  INDEX_VERSION,
  needsMigration,
  migrateResultsJson,
  autoMigrateIfNeeded,
} from "../src/verification-store.js";

import { generateVerificationReport, generateVerificationSummary } from "../src/verification-report.js";

describe("Per-Feature Verification Storage", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verification-new-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("createEmptyIndex", () => {
    it("should create a valid empty index", () => {
      const index = createEmptyIndex();

      expect(index.features).toEqual({});
      expect(index.version).toBe(INDEX_VERSION);
      expect(index.updatedAt).toBeDefined();
    });
  });

  describe("loadVerificationIndex", () => {
    it("should return null for non-existent index", async () => {
      const index = await loadVerificationIndex(tempDir);
      expect(index).toBeNull();
    });

    it("should load existing index", async () => {
      const indexDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(indexDir, { recursive: true });

      const indexData = {
        features: {
          "test.feature": {
            featureId: "test.feature",
            latestRun: 1,
            latestTimestamp: new Date().toISOString(),
            latestVerdict: "pass",
            totalRuns: 1,
            passCount: 1,
            failCount: 0,
          },
        },
        updatedAt: new Date().toISOString(),
        version: INDEX_VERSION,
      };
      await fs.writeFile(
        path.join(indexDir, "index.json"),
        JSON.stringify(indexData)
      );

      const index = await loadVerificationIndex(tempDir);

      expect(index).not.toBeNull();
      expect(index?.features["test.feature"]).toBeDefined();
      expect(index?.features["test.feature"].latestVerdict).toBe("pass");
    });
  });

  describe("Per-Feature Subdirectory Creation", () => {
    it("should create feature subdirectory on save", async () => {
      const result = createTestVerificationResult();
      await saveVerificationResult(tempDir, result);

      const featureDir = path.join(tempDir, "ai", "verification", "test.feature");
      const stat = await fs.stat(featureDir);
      expect(stat.isDirectory()).toBe(true);
    });

    it("should create multiple feature subdirectories", async () => {
      const result1 = createTestVerificationResult({ featureId: "feature.one" });
      const result2 = createTestVerificationResult({ featureId: "feature.two" });

      await saveVerificationResult(tempDir, result1);
      await saveVerificationResult(tempDir, result2);

      const dir1 = path.join(tempDir, "ai", "verification", "feature.one");
      const dir2 = path.join(tempDir, "ai", "verification", "feature.two");

      expect((await fs.stat(dir1)).isDirectory()).toBe(true);
      expect((await fs.stat(dir2)).isDirectory()).toBe(true);
    });
  });

  describe("Sequential Run Numbering", () => {
    it("should create 001.json for first run", async () => {
      const result = createTestVerificationResult();
      await saveVerificationResult(tempDir, result);

      const jsonPath = path.join(tempDir, "ai", "verification", "test.feature", "001.json");
      const stat = await fs.stat(jsonPath);
      expect(stat.isFile()).toBe(true);
    });

    it("should increment run number for subsequent saves", async () => {
      const result1 = createTestVerificationResult({ verdict: "fail" });
      const result2 = createTestVerificationResult({ verdict: "pass" });

      await saveVerificationResult(tempDir, result1);
      await saveVerificationResult(tempDir, result2);

      const json1 = path.join(tempDir, "ai", "verification", "test.feature", "001.json");
      const json2 = path.join(tempDir, "ai", "verification", "test.feature", "002.json");

      expect((await fs.stat(json1)).isFile()).toBe(true);
      expect((await fs.stat(json2)).isFile()).toBe(true);

      // Verify content
      const content1 = JSON.parse(await fs.readFile(json1, "utf-8"));
      const content2 = JSON.parse(await fs.readFile(json2, "utf-8"));

      expect(content1.runNumber).toBe(1);
      expect(content2.runNumber).toBe(2);
    });

    it("should create matching MD files", async () => {
      const result = createTestVerificationResult();
      await saveVerificationResult(tempDir, result);

      const mdPath = path.join(tempDir, "ai", "verification", "test.feature", "001.md");
      const stat = await fs.stat(mdPath);
      expect(stat.isFile()).toBe(true);

      const content = await fs.readFile(mdPath, "utf-8");
      expect(content).toContain("# Verification Report: test.feature");
      expect(content).toContain("**Run**: #001");
    });
  });

  describe("Index Updates", () => {
    it("should create index.json on first save", async () => {
      const result = createTestVerificationResult();
      await saveVerificationResult(tempDir, result);

      const indexPath = path.join(tempDir, "ai", "verification", "index.json");
      const stat = await fs.stat(indexPath);
      expect(stat.isFile()).toBe(true);
    });

    it("should update feature summary in index", async () => {
      const result = createTestVerificationResult({ verdict: "pass" });
      await saveVerificationResult(tempDir, result);

      const index = await loadVerificationIndex(tempDir);

      expect(index?.features["test.feature"]).toBeDefined();
      expect(index?.features["test.feature"].latestRun).toBe(1);
      expect(index?.features["test.feature"].latestVerdict).toBe("pass");
      expect(index?.features["test.feature"].totalRuns).toBe(1);
      expect(index?.features["test.feature"].passCount).toBe(1);
      expect(index?.features["test.feature"].failCount).toBe(0);
    });

    it("should update pass/fail counts on subsequent runs", async () => {
      const result1 = createTestVerificationResult({ verdict: "fail" });
      const result2 = createTestVerificationResult({ verdict: "pass" });

      await saveVerificationResult(tempDir, result1);
      await saveVerificationResult(tempDir, result2);

      const index = await loadVerificationIndex(tempDir);

      expect(index?.features["test.feature"].totalRuns).toBe(2);
      expect(index?.features["test.feature"].passCount).toBe(1);
      expect(index?.features["test.feature"].failCount).toBe(1);
      expect(index?.features["test.feature"].latestVerdict).toBe("pass");
    });
  });

  describe("getVerificationHistory", () => {
    it("should return empty array for non-existent feature", async () => {
      const history = await getVerificationHistory(tempDir, "non.existent");
      expect(history).toEqual([]);
    });

    it("should return all runs for a feature", async () => {
      const result1 = createTestVerificationResult({ verdict: "fail" });
      const result2 = createTestVerificationResult({ verdict: "pass" });
      const result3 = createTestVerificationResult({ verdict: "pass" });

      await saveVerificationResult(tempDir, result1);
      await saveVerificationResult(tempDir, result2);
      await saveVerificationResult(tempDir, result3);

      const history = await getVerificationHistory(tempDir, "test.feature");

      expect(history).toHaveLength(3);
      expect(history[0].runNumber).toBe(1);
      expect(history[1].runNumber).toBe(2);
      expect(history[2].runNumber).toBe(3);
    });
  });

  describe("getFeatureSummary", () => {
    it("should return null for non-existent feature", async () => {
      const summary = await getFeatureSummary(tempDir, "non.existent");
      expect(summary).toBeNull();
    });

    it("should return summary for existing feature", async () => {
      const result = createTestVerificationResult();
      await saveVerificationResult(tempDir, result);

      const summary = await getFeatureSummary(tempDir, "test.feature");

      expect(summary).not.toBeNull();
      expect(summary?.featureId).toBe("test.feature");
      expect(summary?.latestVerdict).toBe("pass");
    });
  });
});

// ============================================================================
// Markdown Report Generator Tests
// ============================================================================

describe("Verification Report Generator", () => {
  describe("generateVerificationReport", () => {
    it("should generate valid markdown report", () => {
      const result = createTestVerificationResult();
      const report = generateVerificationReport(result);

      expect(report).toContain("# Verification Report: test.feature");
      expect(report).toContain("**Verdict**: ✅ PASS");
      expect(report).toContain("**Verified By**: claude");
    });

    it("should include run number when provided", () => {
      const result = createTestVerificationResult();
      const report = generateVerificationReport(result, 5);

      expect(report).toContain("**Run**: #005");
    });

    it("should include changed files section", () => {
      const result = createTestVerificationResult({
        changedFiles: ["src/a.ts", "src/b.ts"],
      });
      const report = generateVerificationReport(result);

      expect(report).toContain("## Changed Files");
      expect(report).toContain("`src/a.ts`");
      expect(report).toContain("`src/b.ts`");
    });

    it("should include automated checks section", () => {
      const result = createTestVerificationResult({
        automatedChecks: [
          { type: "test", success: true, duration: 1000 },
          { type: "typecheck", success: true, duration: 500 },
          { type: "build", success: false, duration: 300, output: "Build failed" },
        ],
      });
      const report = generateVerificationReport(result);

      expect(report).toContain("## Automated Checks");
      expect(report).toContain("Tests");
      expect(report).toContain("Type Check");
      expect(report).toContain("Build");
      expect(report).toContain("✅ Pass");
      expect(report).toContain("❌ Fail");
    });

    it("should include criteria with reasoning", () => {
      const result = createTestVerificationResult({
        criteriaResults: [
          {
            criterion: "Test criterion",
            index: 0,
            satisfied: true,
            reasoning: "This is the reasoning",
            evidence: ["src/file.ts:10-20"],
            confidence: 0.85,
          },
        ],
      });
      const report = generateVerificationReport(result);

      expect(report).toContain("## Acceptance Criteria");
      expect(report).toContain("Test criterion");
      expect(report).toContain("This is the reasoning");
      expect(report).toContain("85%");
      expect(report).toContain("`src/file.ts:10-20`");
    });

    it("should include suggestions when present", () => {
      const result = createTestVerificationResult({
        suggestions: ["Suggestion 1", "Suggestion 2"],
      });
      const report = generateVerificationReport(result);

      expect(report).toContain("## Suggestions");
      expect(report).toContain("Suggestion 1");
      expect(report).toContain("Suggestion 2");
    });

    it("should handle missing optional fields gracefully", () => {
      const result: VerificationResult = {
        featureId: "minimal.feature",
        timestamp: new Date().toISOString(),
        changedFiles: [],
        diffSummary: "",
        automatedChecks: [],
        criteriaResults: [],
        verdict: "pass",
        verifiedBy: "test",
        overallReasoning: "",
      };

      // Should not throw
      const report = generateVerificationReport(result);

      expect(report).toContain("# Verification Report: minimal.feature");
      expect(report).not.toContain("## Suggestions");
      expect(report).not.toContain("## Code Quality Notes");
    });

    it("should include code quality notes when present", () => {
      const result = createTestVerificationResult({
        codeQualityNotes: ["Consider adding more tests", "Variable naming could be improved"],
      });
      const report = generateVerificationReport(result);

      expect(report).toContain("## Code Quality Notes");
      expect(report).toContain("Consider adding more tests");
      expect(report).toContain("Variable naming could be improved");
    });

    it("should include related files analyzed when present", () => {
      const result = createTestVerificationResult({
        relatedFilesAnalyzed: ["src/utils/helper.ts", "src/types/index.ts"],
      });
      const report = generateVerificationReport(result);

      expect(report).toContain("## Related Files Analyzed");
      expect(report).toContain("`src/utils/helper.ts`");
      expect(report).toContain("`src/types/index.ts`");
    });

    it("should include all optional sections when present", () => {
      const result = createTestVerificationResult({
        suggestions: ["Add more tests"],
        codeQualityNotes: ["Good code structure"],
        relatedFilesAnalyzed: ["src/related.ts"],
      });
      const report = generateVerificationReport(result);

      expect(report).toContain("## Suggestions");
      expect(report).toContain("## Code Quality Notes");
      expect(report).toContain("## Related Files Analyzed");
    });
  });

  describe("generateVerificationSummary", () => {
    it("should generate summary line", () => {
      const result = createTestVerificationResult({
        criteriaResults: [
          { criterion: "A", index: 0, satisfied: true, reasoning: "", confidence: 1 },
          { criterion: "B", index: 1, satisfied: true, reasoning: "", confidence: 1 },
          { criterion: "C", index: 2, satisfied: false, reasoning: "", confidence: 1 },
        ],
      });
      const summary = generateVerificationSummary(result);

      expect(summary).toBe("2/3 criteria satisfied");
    });
  });
});

// ============================================================================
// Migration Tests
// ============================================================================

describe("Verification Store Migration", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "verification-migration-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("needsMigration", () => {
    it("should return false when no store exists", async () => {
      const needs = await needsMigration(tempDir);
      expect(needs).toBe(false);
    });

    it("should return true when results.json exists but index.json doesn't", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      const storeData = {
        results: { "test.feature": createTestVerificationResult() },
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(storeData)
      );

      const needs = await needsMigration(tempDir);
      expect(needs).toBe(true);
    });

    it("should return false when both files exist", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      await fs.writeFile(path.join(storeDir, "results.json"), "{}");
      await fs.writeFile(path.join(storeDir, "index.json"), "{}");

      const needs = await needsMigration(tempDir);
      expect(needs).toBe(false);
    });
  });

  describe("migrateResultsJson", () => {
    it("should return -1 when migration not needed", async () => {
      const count = await migrateResultsJson(tempDir);
      expect(count).toBe(-1);
    });

    it("should migrate results to per-feature structure", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      const storeData = {
        results: {
          "feature.one": createTestVerificationResult({ featureId: "feature.one", verdict: "pass" }),
          "feature.two": createTestVerificationResult({ featureId: "feature.two", verdict: "fail" }),
        },
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(storeData)
      );

      const count = await migrateResultsJson(tempDir);

      expect(count).toBe(2);

      // Check subdirectories created
      const dir1 = path.join(storeDir, "feature.one");
      const dir2 = path.join(storeDir, "feature.two");
      expect((await fs.stat(dir1)).isDirectory()).toBe(true);
      expect((await fs.stat(dir2)).isDirectory()).toBe(true);

      // Check JSON files created
      expect((await fs.stat(path.join(dir1, "001.json"))).isFile()).toBe(true);
      expect((await fs.stat(path.join(dir2, "001.json"))).isFile()).toBe(true);

      // Check MD files created
      expect((await fs.stat(path.join(dir1, "001.md"))).isFile()).toBe(true);
      expect((await fs.stat(path.join(dir2, "001.md"))).isFile()).toBe(true);

      // Check index.json created
      const index = await loadVerificationIndex(tempDir);
      expect(index?.features["feature.one"]).toBeDefined();
      expect(index?.features["feature.two"]).toBeDefined();
    });

    it("should create backup of results.json", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      const storeData = {
        results: { "test.feature": createTestVerificationResult() },
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(storeData)
      );

      await migrateResultsJson(tempDir);

      const backupPath = path.join(storeDir, "results.json.bak");
      expect((await fs.stat(backupPath)).isFile()).toBe(true);
    });
  });

  describe("Auto-migration on first access", () => {
    it("should auto-migrate when loading index with legacy store", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      const storeData = {
        results: { "auto.migrate": createTestVerificationResult({ featureId: "auto.migrate" }) },
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(storeData)
      );

      // Load index should trigger migration
      const index = await loadVerificationIndex(tempDir);

      expect(index).not.toBeNull();
      expect(index?.features["auto.migrate"]).toBeDefined();

      // Verify files were created
      const featureDir = path.join(storeDir, "auto.migrate");
      expect((await fs.stat(featureDir)).isDirectory()).toBe(true);
    });
  });

  describe("autoMigrateIfNeeded", () => {
    it("should do nothing when no migration needed", async () => {
      // No files exist - should not throw
      await autoMigrateIfNeeded(tempDir);

      // Verify no files were created
      const storeDir = path.join(tempDir, "ai", "verification");
      await expect(fs.stat(storeDir)).rejects.toThrow();
    });

    it("should migrate when old format exists", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      const storeData = {
        results: { "migrate.test": createTestVerificationResult({ featureId: "migrate.test" }) },
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(storeData)
      );

      await autoMigrateIfNeeded(tempDir);

      // Verify index was created
      const indexPath = path.join(storeDir, "index.json");
      const stat = await fs.stat(indexPath);
      expect(stat.isFile()).toBe(true);
    });

    it("should handle migration errors gracefully", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      // Create invalid results.json
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        "{ invalid json"
      );

      // Should not throw even with invalid data
      await autoMigrateIfNeeded(tempDir);
    });

    it("should skip when index already exists", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      // Create both results.json and index.json
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify({ results: {}, updatedAt: "", version: STORE_VERSION })
      );
      await fs.writeFile(
        path.join(storeDir, "index.json"),
        JSON.stringify({ features: {}, updatedAt: "", version: INDEX_VERSION })
      );

      // Should not modify anything
      await autoMigrateIfNeeded(tempDir);

      // Index should still be empty (not updated from results)
      const index = await loadVerificationIndex(tempDir);
      expect(Object.keys(index?.features || {}).length).toBe(0);
    });
  });

  describe("migrateResultsJson error handling", () => {
    it("should handle feature migration error gracefully", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      // Create a results.json with valid structure but make directory unwritable
      const storeData = {
        results: { "error.feature": createTestVerificationResult({ featureId: "error.feature" }) },
        updatedAt: new Date().toISOString(),
        version: STORE_VERSION,
      };
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify(storeData)
      );

      // Create a file where we expect a directory (to cause write error)
      await fs.writeFile(path.join(storeDir, "error.feature"), "not a directory");

      // Migration should still complete (with warning logged)
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const count = await migrateResultsJson(tempDir);

      // Count should be 0 since feature migration failed
      expect(count).toBe(0);
      expect(warnSpy).toHaveBeenCalled();

      warnSpy.mockRestore();
    });

    it("should return 0 when results.json is empty", async () => {
      const storeDir = path.join(tempDir, "ai", "verification");
      await fs.mkdir(storeDir, { recursive: true });

      // Create empty results.json
      await fs.writeFile(
        path.join(storeDir, "results.json"),
        JSON.stringify({ results: {}, updatedAt: "", version: STORE_VERSION })
      );

      const count = await migrateResultsJson(tempDir);
      expect(count).toBe(0);
    });
  });
});
