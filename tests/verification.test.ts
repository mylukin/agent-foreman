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
