/**
 * Project directory structure scanner
 * Provides basic directory structure scanning for AI analysis
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import type { DirectoryStructure } from "./types.js";
import { debugScanner } from "./debug.js";

/**
 * Scan directory structure of a project
 */
export async function scanDirectoryStructure(basePath: string): Promise<DirectoryStructure> {
  const structure: DirectoryStructure = {
    entryPoints: [],
    srcDirs: [],
    testDirs: [],
    configFiles: [],
  };

  // Common entry points
  const entryPatterns = [
    "src/index.{ts,tsx,js,jsx}",
    "src/main.{ts,tsx,js,jsx}",
    "src/app.{ts,tsx,js,jsx}",
    "main.{go,ts,js,py}",
    "app.{py,ts,js}",
    "cmd/*/main.go",
    "server.{ts,js,py}",
    "index.{ts,js}",
  ];

  for (const pattern of entryPatterns) {
    const matches = await glob(pattern, { cwd: basePath });
    structure.entryPoints.push(...matches);
  }

  // Source directories
  const srcPatterns = ["src", "lib", "pkg", "internal", "app", "api", "core"];
  for (const dir of srcPatterns) {
    try {
      const stat = await fs.stat(path.join(basePath, dir));
      if (stat.isDirectory()) structure.srcDirs.push(dir);
    } catch (error) {
      debugScanner("Source dir check failed for %s: %s", dir, (error as Error).message);
    }
  }

  // Test directories
  const testPatterns = ["tests", "test", "__tests__", "spec", "e2e"];
  for (const dir of testPatterns) {
    try {
      const stat = await fs.stat(path.join(basePath, dir));
      if (stat.isDirectory()) structure.testDirs.push(dir);
    } catch (error) {
      debugScanner("Test dir check failed for %s: %s", dir, (error as Error).message);
    }
  }

  // Config files
  const configPatterns = [
    "*.config.{ts,js,json,mjs,cjs}",
    "tsconfig*.json",
    ".eslintrc*",
    ".prettierrc*",
    "vite.config.*",
    "next.config.*",
    "nuxt.config.*",
    "astro.config.*",
  ];

  for (const pattern of configPatterns) {
    const matches = await glob(pattern, { cwd: basePath });
    structure.configFiles.push(...matches);
  }

  return structure;
}

/**
 * Check if project directory is empty (no source files)
 * Used to determine whether to scan existing code or generate features from goal
 */
export async function isProjectEmpty(cwd: string): Promise<boolean> {
  const sourcePatterns = [
    "**/*.{ts,tsx,js,jsx,mjs,cjs}",
    "**/*.{py,go,rs,java,kt,rb,php,cs,swift,scala}",
    "**/*.{c,cpp,h,hpp}",
    "**/src/**/*",
    "**/lib/**/*",
    "**/app/**/*",
  ];

  const ignorePatterns = [
    "node_modules/**",
    "dist/**",
    "build/**",
    ".git/**",
    "vendor/**",
    "__pycache__/**",
  ];

  for (const pattern of sourcePatterns) {
    const matches = await glob(pattern, { cwd, ignore: ignorePatterns, nodir: true });
    if (matches.length > 0) {
      return false; // Has source files
    }
  }
  return true; // No source files found
}
