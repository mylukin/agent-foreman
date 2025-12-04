/**
 * Integration tests for parallel context gathering
 * Tests that verification produces same results with parallel context
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";

import { readRelatedFiles } from "../../src/verifier.js";

describe("Parallel Context Integration", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `parallel-context-int-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, "src"), { recursive: true });
    await fs.mkdir(path.join(testDir, "lib"), { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Verification with parallel context", () => {
    it("produces same results with parallel context gathering", async () => {
      // Create multiple source files
      const files = [
        { path: "src/auth.ts", content: "export function login() {}" },
        { path: "src/user.ts", content: "export interface User { id: string }" },
        { path: "src/api.ts", content: "export async function fetchData() {}" },
        { path: "lib/utils.js", content: "function helper() { return 1; }" },
      ];

      for (const file of files) {
        await fs.writeFile(path.join(testDir, file.path), file.content);
      }

      const changedFiles = files.map((f) => f.path);

      // Read files using parallel implementation
      const result = await readRelatedFiles(testDir, changedFiles);

      // All files should be read
      expect(result.size).toBe(4);

      // Content should match
      for (const file of files) {
        expect(result.get(file.path)).toBe(file.content);
      }
    });

    it("handles large number of files efficiently", async () => {
      // Create 20 test files
      const fileCount = 20;
      const files: Array<{ path: string; content: string }> = [];

      for (let i = 0; i < fileCount; i++) {
        files.push({
          path: `src/module${i}.ts`,
          content: `export const value${i} = ${i};`,
        });
      }

      for (const file of files) {
        await fs.writeFile(path.join(testDir, file.path), file.content);
      }

      const changedFiles = files.map((f) => f.path);

      const startTime = Date.now();
      const result = await readRelatedFiles(testDir, changedFiles);
      const elapsed = Date.now() - startTime;

      // All files should be read
      expect(result.size).toBe(fileCount);

      // Parallel read should be reasonably fast (less than 1 second for 20 small files)
      expect(elapsed).toBeLessThan(1000);
    });

    it("preserves content integrity across parallel reads", async () => {
      // Create files with specific content that must be preserved
      const specialContent = {
        "src/unicode.ts": "const emoji = '🎉'; const chinese = '中文';",
        "src/multiline.ts": "function test() {\n  return {\n    a: 1,\n    b: 2\n  };\n}",
        "src/special.ts": 'const str = "quotes\\"escaped"; const regex = /test/g;',
      };

      for (const [filePath, content] of Object.entries(specialContent)) {
        await fs.writeFile(path.join(testDir, filePath), content);
      }

      const changedFiles = Object.keys(specialContent);
      const result = await readRelatedFiles(testDir, changedFiles);

      // Content should be preserved exactly
      for (const [filePath, content] of Object.entries(specialContent)) {
        expect(result.get(filePath)).toBe(content);
      }
    });

    it("handles partial failures without affecting other reads", async () => {
      // Create some files, others don't exist
      await fs.writeFile(path.join(testDir, "src/exists1.ts"), "content1");
      await fs.writeFile(path.join(testDir, "src/exists2.ts"), "content2");
      // Don't create missing1.ts and missing2.ts

      const changedFiles = [
        "src/exists1.ts",
        "src/missing1.ts",
        "src/exists2.ts",
        "src/missing2.ts",
      ];

      const result = await readRelatedFiles(testDir, changedFiles);

      // Only existing files should be in result
      expect(result.size).toBe(2);
      expect(result.get("src/exists1.ts")).toBe("content1");
      expect(result.get("src/exists2.ts")).toBe("content2");
      expect(result.has("src/missing1.ts")).toBe(false);
      expect(result.has("src/missing2.ts")).toBe(false);
    });
  });

  describe("File type filtering", () => {
    it("only reads source code files", async () => {
      // Create various file types
      const files = {
        "src/code.ts": "typescript",
        "src/code.tsx": "react",
        "src/code.js": "javascript",
        "src/code.jsx": "react-js",
        "src/code.py": "python",
        "src/code.go": "golang",
        "src/code.rs": "rust",
        "src/readme.md": "markdown",
        "src/config.json": "{}",
        "src/styles.css": ".class {}",
        "src/data.yaml": "key: value",
      };

      for (const [filePath, content] of Object.entries(files)) {
        await fs.writeFile(path.join(testDir, filePath), content);
      }

      const changedFiles = Object.keys(files);
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

      // Non-source files should be excluded
      expect(result.has("src/readme.md")).toBe(false);
      expect(result.has("src/config.json")).toBe(false);
      expect(result.has("src/styles.css")).toBe(false);
      expect(result.has("src/data.yaml")).toBe(false);
    });
  });
});
