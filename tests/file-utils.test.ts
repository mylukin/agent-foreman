/**
 * Unit tests for file-utils.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  isPathWithinRoot,
  safeJoinPath,
  fileExists,
  safeReadFile,
  findFiles,
  readFileOrNull,
  isDirectory,
} from "../src/file-utils.js";

describe("file-utils", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "file-utils-test-"));

    // Create test files
    await fs.writeFile(path.join(tempDir, "test.txt"), "test content");
    await fs.mkdir(path.join(tempDir, "subdir"));
    await fs.writeFile(
      path.join(tempDir, "subdir", "nested.txt"),
      "nested content"
    );
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("isPathWithinRoot", () => {
    it("should return true for paths within the root", () => {
      expect(isPathWithinRoot("/project", "/project/src/file.ts")).toBe(true);
      expect(isPathWithinRoot("/project", "/project/file.ts")).toBe(true);
      expect(isPathWithinRoot("/project", "/project")).toBe(true);
    });

    it("should return true for relative paths within the root", () => {
      expect(isPathWithinRoot(tempDir, "test.txt")).toBe(true);
      expect(isPathWithinRoot(tempDir, "subdir/nested.txt")).toBe(true);
      expect(isPathWithinRoot(tempDir, "./test.txt")).toBe(true);
    });

    it("should return false for paths that escape the root", () => {
      expect(isPathWithinRoot("/project", "/project/../etc/passwd")).toBe(
        false
      );
      expect(isPathWithinRoot("/project", "../etc/passwd")).toBe(false);
      expect(isPathWithinRoot("/project", "/etc/passwd")).toBe(false);
    });

    it("should handle path traversal attempts", () => {
      expect(isPathWithinRoot("/project", "/project/src/../../etc/passwd")).toBe(
        false
      );
      expect(isPathWithinRoot("/project", "src/../../../etc/passwd")).toBe(
        false
      );
    });

    it("should prevent /project matching /project2", () => {
      expect(isPathWithinRoot("/project", "/project2/file.ts")).toBe(false);
      expect(isPathWithinRoot("/project", "/projectx")).toBe(false);
    });

    it("should handle edge cases", () => {
      // Empty relative path
      expect(isPathWithinRoot("/project", "")).toBe(true);

      // Dots in filenames (not traversal)
      expect(isPathWithinRoot("/project", "/project/.hidden")).toBe(true);
      expect(isPathWithinRoot("/project", "/project/file.test.ts")).toBe(true);
    });

    it("should normalize paths correctly", () => {
      expect(isPathWithinRoot("/project/", "/project/src/../file.ts")).toBe(
        true
      );
      expect(isPathWithinRoot("/project", "/project/./src/./file.ts")).toBe(
        true
      );
    });
  });

  describe("safeJoinPath", () => {
    it("should return joined path for safe paths", () => {
      const result = safeJoinPath("/project", "src/file.ts");
      expect(result).toBe(path.join("/project", "src/file.ts"));
    });

    it("should return null for path traversal attempts", () => {
      expect(safeJoinPath("/project", "../etc/passwd")).toBe(null);
      expect(safeJoinPath("/project", "src/../../etc/passwd")).toBe(null);
    });

    it("should handle nested paths", () => {
      const result = safeJoinPath("/project", "src/components/Button.tsx");
      expect(result).toBe(path.join("/project", "src/components/Button.tsx"));
    });
  });

  describe("fileExists", () => {
    it("should return true for existing files", async () => {
      expect(await fileExists(path.join(tempDir, "test.txt"))).toBe(true);
    });

    it("should return false for non-existing files", async () => {
      expect(await fileExists(path.join(tempDir, "nonexistent.txt"))).toBe(
        false
      );
    });

    it("should return true for directories", async () => {
      expect(await fileExists(path.join(tempDir, "subdir"))).toBe(true);
    });
  });

  describe("safeReadFile", () => {
    it("should read files within root", async () => {
      const content = await safeReadFile(tempDir, "test.txt");
      expect(content).toBe("test content");
    });

    it("should read nested files within root", async () => {
      const content = await safeReadFile(tempDir, "subdir/nested.txt");
      expect(content).toBe("nested content");
    });

    it("should return null for path traversal attempts", async () => {
      const content = await safeReadFile(tempDir, "../etc/passwd");
      expect(content).toBe(null);
    });

    it("should return null for non-existing files", async () => {
      const content = await safeReadFile(tempDir, "nonexistent.txt");
      expect(content).toBe(null);
    });
  });

  describe("findFiles", () => {
    it("should find existing files", async () => {
      const found = await findFiles(tempDir, ["test.txt", "nonexistent.txt"]);
      expect(found).toEqual(["test.txt"]);
    });

    it("should find nested files", async () => {
      const found = await findFiles(tempDir, [
        "test.txt",
        "subdir/nested.txt",
        "missing.txt",
      ]);
      expect(found).toContain("test.txt");
      expect(found).toContain("subdir/nested.txt");
      expect(found).not.toContain("missing.txt");
    });

    it("should return empty array when no files match", async () => {
      const found = await findFiles(tempDir, ["missing1.txt", "missing2.txt"]);
      expect(found).toEqual([]);
    });
  });

  describe("readFileOrNull", () => {
    it("should read existing files", async () => {
      const content = await readFileOrNull(path.join(tempDir, "test.txt"));
      expect(content).toBe("test content");
    });

    it("should return null for non-existing files", async () => {
      const content = await readFileOrNull(
        path.join(tempDir, "nonexistent.txt")
      );
      expect(content).toBe(null);
    });
  });

  describe("isDirectory", () => {
    it("should return true for directories", async () => {
      expect(await isDirectory(tempDir)).toBe(true);
      expect(await isDirectory(path.join(tempDir, "subdir"))).toBe(true);
    });

    it("should return false for files", async () => {
      expect(await isDirectory(path.join(tempDir, "test.txt"))).toBe(false);
    });

    it("should return false for non-existing paths", async () => {
      expect(await isDirectory(path.join(tempDir, "nonexistent"))).toBe(false);
    });
  });
});
