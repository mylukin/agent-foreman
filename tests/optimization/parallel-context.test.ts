/**
 * Tests for parallel context gathering optimization
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readRelatedFiles } from "../../src/verifier.js";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";

describe("Parallel Context Gathering", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `parallel-context-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, "src"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("readRelatedFiles", () => {
    it("reads multiple files in parallel", async () => {
      // Create test files
      await fs.writeFile(path.join(testDir, "src/file1.ts"), "const a = 1;");
      await fs.writeFile(path.join(testDir, "src/file2.ts"), "const b = 2;");
      await fs.writeFile(path.join(testDir, "src/file3.ts"), "const c = 3;");

      const changedFiles = ["src/file1.ts", "src/file2.ts", "src/file3.ts"];

      const result = await readRelatedFiles(testDir, changedFiles);

      expect(result.size).toBe(3);
      expect(result.get("src/file1.ts")).toBe("const a = 1;");
      expect(result.get("src/file2.ts")).toBe("const b = 2;");
      expect(result.get("src/file3.ts")).toBe("const c = 3;");
    });

    it("filters files by source extension", async () => {
      // Create files with different extensions
      await fs.writeFile(path.join(testDir, "src/code.ts"), "typescript");
      await fs.writeFile(path.join(testDir, "src/code.tsx"), "react");
      await fs.writeFile(path.join(testDir, "src/code.js"), "javascript");
      await fs.writeFile(path.join(testDir, "src/code.jsx"), "react-js");
      await fs.writeFile(path.join(testDir, "src/code.py"), "python");
      await fs.writeFile(path.join(testDir, "src/code.go"), "golang");
      await fs.writeFile(path.join(testDir, "src/code.rs"), "rust");
      await fs.writeFile(path.join(testDir, "src/readme.md"), "markdown");
      await fs.writeFile(path.join(testDir, "src/config.json"), "{}");

      const changedFiles = [
        "src/code.ts",
        "src/code.tsx",
        "src/code.js",
        "src/code.jsx",
        "src/code.py",
        "src/code.go",
        "src/code.rs",
        "src/readme.md",
        "src/config.json",
      ];

      const result = await readRelatedFiles(testDir, changedFiles);

      // Should only include source code files
      expect(result.size).toBe(7);
      expect(result.has("src/code.ts")).toBe(true);
      expect(result.has("src/code.tsx")).toBe(true);
      expect(result.has("src/code.js")).toBe(true);
      expect(result.has("src/code.jsx")).toBe(true);
      expect(result.has("src/code.py")).toBe(true);
      expect(result.has("src/code.go")).toBe(true);
      expect(result.has("src/code.rs")).toBe(true);

      // Should NOT include non-source files
      expect(result.has("src/readme.md")).toBe(false);
      expect(result.has("src/config.json")).toBe(false);
    });

    it("handles partial failures gracefully", async () => {
      // Create only some files
      await fs.writeFile(path.join(testDir, "src/exists.ts"), "exists");
      // Don't create nonexistent.ts

      const changedFiles = ["src/exists.ts", "src/nonexistent.ts"];

      const result = await readRelatedFiles(testDir, changedFiles);

      // Should include the existing file
      expect(result.size).toBe(1);
      expect(result.get("src/exists.ts")).toBe("exists");
      // Should not include the missing file
      expect(result.has("src/nonexistent.ts")).toBe(false);
    });

    it("validates paths to prevent path traversal", async () => {
      await fs.writeFile(path.join(testDir, "src/safe.ts"), "safe");

      const changedFiles = [
        "src/safe.ts",
        "../../../etc/passwd", // Path traversal attempt
        "src/../../../outside.ts", // Another traversal attempt
      ];

      const result = await readRelatedFiles(testDir, changedFiles);

      // Should only include the safe file
      expect(result.size).toBe(1);
      expect(result.has("src/safe.ts")).toBe(true);
    });

    it("returns empty Map when no valid files", async () => {
      const changedFiles = ["readme.md", "config.json", "package.json"];

      const result = await readRelatedFiles(testDir, changedFiles);

      expect(result.size).toBe(0);
    });

    it("returns Map type with correct structure", async () => {
      await fs.writeFile(path.join(testDir, "src/test.ts"), "content");

      const result = await readRelatedFiles(testDir, ["src/test.ts"]);

      expect(result).toBeInstanceOf(Map);
      expect(typeof result.get("src/test.ts")).toBe("string");
    });
  });
});
