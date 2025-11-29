/**
 * Tests for the extensible capability detection system
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  loadCachedCapabilities,
  saveCapabilities,
  invalidateCache,
  isStale,
  CACHE_VERSION,
} from "../src/capability-cache.js";

import {
  detectWithPresets,
  formatExtendedCapabilities,
  detectCapabilities,
  formatCapabilities,
  detectVerificationCapabilities,
} from "../src/capability-detector.js";

import {
  collectProjectContext,
  buildCapabilityDiscoveryPrompt,
  parseCapabilityResponse,
  discoverCapabilitiesWithAI,
} from "../src/ai-capability-discovery.js";

import * as agents from "../src/agents.js";

import type { ExtendedCapabilities, CapabilityCache } from "../src/verification-types.js";

// ============================================================================
// Test Helpers
// ============================================================================

/**
 * Create a minimal ExtendedCapabilities object for testing
 */
function createTestCapabilities(
  overrides: Partial<ExtendedCapabilities> = {}
): ExtendedCapabilities {
  return {
    hasTests: true,
    testCommand: "npm test",
    testFramework: "vitest",
    hasTypeCheck: true,
    typeCheckCommand: "npx tsc --noEmit",
    hasLint: false,
    hasBuild: true,
    buildCommand: "npm run build",
    hasGit: true,
    source: "preset",
    confidence: 0.95,
    languages: ["typescript", "nodejs"],
    detectedAt: new Date().toISOString(),
    testInfo: { available: true, command: "npm test", framework: "vitest", confidence: 0.95 },
    typeCheckInfo: { available: true, command: "npx tsc --noEmit", confidence: 0.9 },
    lintInfo: { available: false, confidence: 0 },
    buildInfo: { available: true, command: "npm run build", confidence: 0.9 },
    ...overrides,
  };
}

// ============================================================================
// Cache Tests
// ============================================================================

describe("Capability Cache", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cap-cache-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadCachedCapabilities", () => {
    it("should return null for non-existent cache", async () => {
      const result = await loadCachedCapabilities(tempDir);
      expect(result).toBeNull();
    });

    it("should load valid cached capabilities", async () => {
      const capabilities = createTestCapabilities();
      const cache: CapabilityCache = {
        version: CACHE_VERSION,
        capabilities,
      };

      // Create cache file
      const cacheDir = path.join(tempDir, "ai");
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "capabilities.json"),
        JSON.stringify(cache)
      );

      const result = await loadCachedCapabilities(tempDir);

      expect(result).not.toBeNull();
      expect(result?.source).toBe("cached");
      expect(result?.languages).toContain("typescript");
    });

    it("should return null for corrupted cache", async () => {
      const cacheDir = path.join(tempDir, "ai");
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "capabilities.json"),
        "{ invalid json"
      );

      const result = await loadCachedCapabilities(tempDir);
      expect(result).toBeNull();
    });

    it("should return null for outdated cache version", async () => {
      const cache: CapabilityCache = {
        version: "0.0.1", // Old version
        capabilities: createTestCapabilities(),
      };

      const cacheDir = path.join(tempDir, "ai");
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "capabilities.json"),
        JSON.stringify(cache)
      );

      const result = await loadCachedCapabilities(tempDir);
      expect(result).toBeNull();
    });
  });

  describe("saveCapabilities", () => {
    it("should create cache file and directory", async () => {
      const capabilities = createTestCapabilities();

      await saveCapabilities(tempDir, capabilities);

      const cachePath = path.join(tempDir, "ai", "capabilities.json");
      const exists = await fs.access(cachePath).then(() => true).catch(() => false);
      expect(exists).toBe(true);
    });

    it("should save with current version", async () => {
      const capabilities = createTestCapabilities();

      await saveCapabilities(tempDir, capabilities);

      const cachePath = path.join(tempDir, "ai", "capabilities.json");
      const content = await fs.readFile(cachePath, "utf-8");
      const cache = JSON.parse(content) as CapabilityCache;

      expect(cache.version).toBe(CACHE_VERSION);
    });

    it("should update detectedAt timestamp", async () => {
      const capabilities = createTestCapabilities({
        detectedAt: "2020-01-01T00:00:00.000Z",
      });

      await saveCapabilities(tempDir, capabilities);

      const cachePath = path.join(tempDir, "ai", "capabilities.json");
      const content = await fs.readFile(cachePath, "utf-8");
      const cache = JSON.parse(content) as CapabilityCache;

      // Should have updated timestamp (not 2020)
      expect(cache.capabilities.detectedAt).not.toBe("2020-01-01T00:00:00.000Z");
    });
  });

  describe("invalidateCache", () => {
    it("should remove cache file", async () => {
      // Create cache first
      const cacheDir = path.join(tempDir, "ai");
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "capabilities.json"),
        "{}"
      );

      await invalidateCache(tempDir);

      const exists = await fs.access(path.join(cacheDir, "capabilities.json"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("should not throw for non-existent cache", async () => {
      await expect(invalidateCache(tempDir)).resolves.not.toThrow();
    });
  });

  describe("isStale", () => {
    it("should return true for non-existent cache", async () => {
      const result = await isStale(tempDir);
      expect(result).toBe(true);
    });

    it("should return true for cache without commit hash", async () => {
      const cache: CapabilityCache = {
        version: CACHE_VERSION,
        capabilities: createTestCapabilities(),
        // No commitHash
      };

      const cacheDir = path.join(tempDir, "ai");
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(
        path.join(cacheDir, "capabilities.json"),
        JSON.stringify(cache)
      );

      const result = await isStale(tempDir);
      expect(result).toBe(true);
    });
  });
});

// ============================================================================
// Preset Detection Tests
// ============================================================================

describe("Preset Detection", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "preset-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("detectWithPresets", () => {
    it("should return low confidence for empty directory", async () => {
      const result = await detectWithPresets(tempDir);

      expect(result.source).toBe("preset");
      expect(result.confidence).toBe(0);
      expect(result.languages).toHaveLength(0);
    });

    it("should detect Node.js project from package.json", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          name: "test-project",
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^1.0.0" },
        })
      );

      const result = await detectWithPresets(tempDir);

      expect(result.source).toBe("preset");
      expect(result.languages).toContain("nodejs");
      expect(result.confidence).toBeGreaterThan(0.7);
      expect(result.hasTests).toBe(true);
      expect(result.testFramework).toBe("vitest");
    });

    it("should detect TypeScript project", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test" })
      );
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );

      const result = await detectWithPresets(tempDir);

      expect(result.languages).toContain("typescript");
      expect(result.hasTypeCheck).toBe(true);
    });

    it("should detect Python project from pyproject.toml", async () => {
      await fs.writeFile(
        path.join(tempDir, "pyproject.toml"),
        `[tool.pytest]
testpaths = ["tests"]`
      );

      const result = await detectWithPresets(tempDir);

      expect(result.languages).toContain("python");
      expect(result.hasTests).toBe(true);
      expect(result.testFramework).toBe("pytest");
    });

    it("should detect Go project", async () => {
      await fs.writeFile(
        path.join(tempDir, "go.mod"),
        "module example.com/test\n\ngo 1.21"
      );

      const result = await detectWithPresets(tempDir);

      expect(result.languages).toContain("go");
      expect(result.hasTests).toBe(true);
      expect(result.testCommand).toBe("go test ./...");
    });

    it("should detect Rust project", async () => {
      await fs.writeFile(
        path.join(tempDir, "Cargo.toml"),
        `[package]
name = "test"
version = "0.1.0"`
      );

      const result = await detectWithPresets(tempDir);

      expect(result.languages).toContain("rust");
      expect(result.hasTests).toBe(true);
      expect(result.testCommand).toBe("cargo test");
      expect(result.hasLint).toBe(true);
      expect(result.lintCommand).toBe("cargo clippy");
    });

    it("should calculate high confidence for complete project setup", async () => {
      // Create a fully configured Node.js/TypeScript project
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "vitest", build: "tsc" },
          devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0" },
        })
      );
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );

      // Initialize git
      const { execSync } = await import("node:child_process");
      try {
        execSync("git init", { cwd: tempDir, stdio: "pipe" });
      } catch {
        // Git might not be available in all test environments
      }

      const result = await detectWithPresets(tempDir);

      // Should have high confidence with all capabilities
      expect(result.confidence).toBeGreaterThanOrEqual(0.9);
    });
  });
});

// ============================================================================
// AI Discovery Tests
// ============================================================================

describe("AI Capability Discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-discovery-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("collectProjectContext", () => {
    it("should collect config files", async () => {
      await fs.writeFile(path.join(tempDir, "pom.xml"), "<project></project>");
      await fs.writeFile(path.join(tempDir, "build.gradle"), "plugins {}");

      const context = await collectProjectContext(tempDir);

      expect(context.configFiles).toContain("pom.xml");
      expect(context.buildFiles).toContain("build.gradle");
    });

    it("should get directory structure", async () => {
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "tests"), { recursive: true });

      const context = await collectProjectContext(tempDir);

      expect(context.directoryStructure).toBeTruthy();
      expect(context.directoryStructure.length).toBeGreaterThan(0);
    });

    it("should sample source files", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir, { recursive: true });
      await fs.writeFile(
        path.join(srcDir, "Main.java"),
        "public class Main { public static void main(String[] args) {} }"
      );

      const context = await collectProjectContext(tempDir);

      expect(context.sampleFiles.length).toBeGreaterThan(0);
      expect(context.sampleFiles[0].path).toContain("Main.java");
      expect(context.sampleFiles[0].content).toContain("public class Main");
    });

    it("should handle deeply nested source files", async () => {
      const deepDir = path.join(tempDir, "src", "main", "java");
      await fs.mkdir(deepDir, { recursive: true });
      await fs.writeFile(
        path.join(deepDir, "App.java"),
        "package main; public class App {}"
      );

      const context = await collectProjectContext(tempDir);

      // Should find files up to maxDepth (2)
      expect(context.directoryStructure).toContain("src");
    });

    it("should ignore node_modules and hidden directories", async () => {
      await fs.mkdir(path.join(tempDir, "node_modules", "test"), { recursive: true });
      await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "src"), { recursive: true });

      const context = await collectProjectContext(tempDir);

      expect(context.directoryStructure).not.toContain("node_modules");
      expect(context.directoryStructure).not.toContain(".git");
      expect(context.directoryStructure).toContain("src");
    });

    it("should handle empty directory", async () => {
      const context = await collectProjectContext(tempDir);

      expect(context.configFiles).toHaveLength(0);
      expect(context.buildFiles).toHaveLength(0);
      expect(context.sampleFiles).toHaveLength(0);
      expect(context.directoryStructure).toBeTruthy();
    });

    it("should limit sample file content", async () => {
      const srcDir = path.join(tempDir, "src");
      await fs.mkdir(srcDir, { recursive: true });
      // Create a file with content longer than MAX_CONTENT_PER_FILE (1000)
      const longContent = "x".repeat(2000);
      await fs.writeFile(path.join(srcDir, "Large.java"), longContent);

      const context = await collectProjectContext(tempDir);

      if (context.sampleFiles.length > 0) {
        expect(context.sampleFiles[0].content.length).toBeLessThanOrEqual(1000);
      }
    });

    it("should find source files in lib directory", async () => {
      const libDir = path.join(tempDir, "lib");
      await fs.mkdir(libDir, { recursive: true });
      await fs.writeFile(
        path.join(libDir, "helper.rb"),
        "module Helper; end"
      );

      const context = await collectProjectContext(tempDir);

      expect(context.sampleFiles.some(f => f.path.includes("helper.rb"))).toBe(true);
    });

    it("should find source files in app directory", async () => {
      const appDir = path.join(tempDir, "app");
      await fs.mkdir(appDir, { recursive: true });
      await fs.writeFile(
        path.join(appDir, "main.swift"),
        "import Foundation"
      );

      const context = await collectProjectContext(tempDir);

      expect(context.sampleFiles.some(f => f.path.includes("main.swift"))).toBe(true);
    });

    it("should skip hidden and ignored directories when finding source files", async () => {
      const vendorDir = path.join(tempDir, "src", "vendor");
      await fs.mkdir(vendorDir, { recursive: true });
      await fs.writeFile(
        path.join(vendorDir, "external.java"),
        "// Vendor code"
      );

      const context = await collectProjectContext(tempDir);

      // vendor directory should be skipped
      expect(context.sampleFiles.every(f => !f.path.includes("vendor"))).toBe(true);
    });

    it("should skip __pycache__ directories", async () => {
      const pycacheDir = path.join(tempDir, "src", "__pycache__");
      await fs.mkdir(pycacheDir, { recursive: true });
      await fs.writeFile(
        path.join(pycacheDir, "module.cpython-311.pyc"),
        "compiled"
      );

      const context = await collectProjectContext(tempDir);

      expect(context.directoryStructure).not.toContain("__pycache__");
    });
  });

  describe("buildCapabilityDiscoveryPrompt", () => {
    it("should include config files in prompt", () => {
      const context = {
        configFiles: ["pom.xml", "build.gradle"],
        buildFiles: ["pom.xml"],
        directoryStructure: "src/\n  Main.java",
        sampleFiles: [],
      };

      const prompt = buildCapabilityDiscoveryPrompt(context);

      expect(prompt).toContain("pom.xml");
      expect(prompt).toContain("build.gradle");
    });

    it("should include sample file content", () => {
      const context = {
        configFiles: [],
        buildFiles: [],
        directoryStructure: "",
        sampleFiles: [
          { path: "src/Main.java", content: "public class Main {}" },
        ],
      };

      const prompt = buildCapabilityDiscoveryPrompt(context);

      expect(prompt).toContain("src/Main.java");
      expect(prompt).toContain("public class Main");
    });

    it("should request JSON output", () => {
      const context = {
        configFiles: [],
        buildFiles: [],
        directoryStructure: "",
        sampleFiles: [],
      };

      const prompt = buildCapabilityDiscoveryPrompt(context);

      expect(prompt).toContain("Return ONLY valid JSON");
      expect(prompt).toContain('"languages"');
      expect(prompt).toContain('"test"');
      expect(prompt).toContain('"confidence"');
    });

    it("should handle context with no config files", () => {
      const context = {
        configFiles: [],
        buildFiles: ["Makefile"],
        directoryStructure: "src/",
        sampleFiles: [],
      };

      const prompt = buildCapabilityDiscoveryPrompt(context);

      expect(prompt).toContain("None detected");
      expect(prompt).toContain("Makefile");
    });

    it("should handle context with no build files", () => {
      const context = {
        configFiles: ["tsconfig.json"],
        buildFiles: [],
        directoryStructure: "src/",
        sampleFiles: [],
      };

      const prompt = buildCapabilityDiscoveryPrompt(context);

      expect(prompt).toContain("tsconfig.json");
      expect(prompt).toMatch(/Build Files Found\s*\n\s*None detected/);
    });

    it("should handle context with no source files", () => {
      const context = {
        configFiles: [],
        buildFiles: [],
        directoryStructure: "docs/",
        sampleFiles: [],
      };

      const prompt = buildCapabilityDiscoveryPrompt(context);

      expect(prompt).toContain("No source files found");
    });
  });

  describe("parseCapabilityResponse", () => {
    it("should parse valid JSON response", () => {
      const response = JSON.stringify({
        languages: ["java"],
        test: {
          available: true,
          command: "./gradlew test",
          framework: "junit",
          confidence: 0.95,
        },
        typecheck: {
          available: true,
          command: "./gradlew compileJava",
          confidence: 0.9,
        },
        lint: { available: false },
        build: {
          available: true,
          command: "./gradlew build",
          confidence: 0.95,
        },
      });

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.languages).toContain("java");
        expect(result.data.test?.command).toBe("./gradlew test");
        expect(result.data.test?.confidence).toBe(0.95);
      }
    });

    it("should extract JSON from markdown code block", () => {
      const response = `Here is my analysis:

\`\`\`json
{
  "languages": ["ruby"],
  "test": { "available": true, "command": "bundle exec rspec" }
}
\`\`\`

That's my recommendation.`;

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.languages).toContain("ruby");
      }
    });

    it("should return error for invalid JSON", () => {
      const response = "This is not valid JSON at all";

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("Failed to parse");
      }
    });

    it("should return error for missing languages field", () => {
      const response = JSON.stringify({
        test: { available: true },
      });

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("languages");
      }
    });

    it("should handle custom rules", () => {
      const response = JSON.stringify({
        languages: ["java"],
        customRules: [
          {
            id: "integration-test",
            description: "Run integration tests",
            command: "./gradlew integrationTest",
            type: "test",
          },
        ],
      });

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customRules).toHaveLength(1);
        expect(result.data.customRules![0].id).toBe("integration-test");
      }
    });

    it("should handle custom rules with unknown type", () => {
      const response = JSON.stringify({
        languages: ["java"],
        customRules: [
          {
            id: "deploy",
            description: "Deploy to production",
            command: "./deploy.sh",
            type: "unknown-type",
          },
        ],
      });

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.customRules![0].type).toBe("unknown-type");
      }
    });
  });

  describe("discoverCapabilitiesWithAI", () => {
    let consoleSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it("should return minimal capabilities when AI agent fails", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: false,
        error: "No agent available",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.source).toBe("ai-discovered");
      expect(result.confidence).toBe(0);
      expect(result.languages).toHaveLength(0);
      expect(result.hasTests).toBe(false);
    });

    it("should return minimal capabilities when AI response parsing fails", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: "This is not valid JSON",
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.source).toBe("ai-discovered");
      expect(result.confidence).toBe(0);
      expect(result.languages).toHaveLength(0);
    });

    it("should parse valid AI response and return capabilities", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["java"],
          test: {
            available: true,
            command: "./gradlew test",
            framework: "junit",
            confidence: 0.95,
          },
          typecheck: {
            available: true,
            command: "./gradlew compileJava",
            confidence: 0.9,
          },
          lint: {
            available: false,
          },
          build: {
            available: true,
            command: "./gradlew build",
            confidence: 0.92,
          },
        }),
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.source).toBe("ai-discovered");
      expect(result.languages).toContain("java");
      expect(result.hasTests).toBe(true);
      expect(result.testCommand).toBe("./gradlew test");
      expect(result.testFramework).toBe("junit");
      expect(result.hasTypeCheck).toBe(true);
      expect(result.hasBuild).toBe(true);
      expect(result.hasLint).toBe(false);
      // Average of 0.95, 0.9, 0.92 = ~0.923
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("should handle AI response with no confidence values", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["python"],
          test: {
            available: true,
            command: "pytest",
          },
        }),
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.languages).toContain("python");
      // With no confidence values, should use default 0.5
      expect(result.confidence).toBe(0.5);
      expect(result.testInfo?.confidence).toBe(0.8); // Default when available=true
    });

    it("should handle AI response with custom rules", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["java"],
          customRules: [
            {
              id: "integration-test",
              description: "Run integration tests",
              command: "./gradlew integrationTest",
              type: "test",
            },
            {
              id: "e2e-test",
              description: "Run E2E tests",
              command: "./gradlew e2eTest",
              type: "custom",
            },
          ],
        }),
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.customRules).toHaveLength(2);
      expect(result.customRules![0].id).toBe("integration-test");
      expect(result.customRules![0].type).toBe("test");
      expect(result.customRules![1].type).toBe("custom");
    });

    it("should handle AI response with empty custom rules", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["go"],
          customRules: [],
        }),
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.customRules).toBeUndefined();
    });

    it("should detect git availability in project directory", async () => {
      // Create a git repo in temp dir
      const { execSync } = await import("node:child_process");
      try {
        execSync("git init", { cwd: tempDir, stdio: "pipe" });
      } catch {
        // Git might not be available
      }

      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript"],
        }),
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      // hasGit should be true if git init succeeded
      // (may be false if git not installed)
      expect(typeof result.hasGit).toBe("boolean");
    });

    it("should handle capability info without optional fields", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["ruby"],
          test: {
            available: false,
          },
          lint: {
            available: true,
            command: "rubocop",
            // No confidence provided
          },
        }),
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.testInfo?.available).toBe(false);
      expect(result.testInfo?.confidence).toBe(0);
      expect(result.lintInfo?.available).toBe(true);
      expect(result.lintInfo?.confidence).toBe(0.8); // Default for available=true
    });

    it("should handle undefined capability info", async () => {
      vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["c"],
          // No test, typecheck, lint, build info
        }),
        model: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.testInfo?.available).toBe(false);
      expect(result.testInfo?.confidence).toBe(0);
      expect(result.typeCheckInfo?.available).toBe(false);
      expect(result.lintInfo?.available).toBe(false);
      expect(result.buildInfo?.available).toBe(false);
    });
  });
});

// ============================================================================
// Format Tests
// ============================================================================

describe("Capability Formatting", () => {
  describe("formatExtendedCapabilities", () => {
    it("should include source and confidence", () => {
      const caps = createTestCapabilities({
        source: "ai-discovered",
        confidence: 0.85,
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("ai-discovered");
      expect(output).toContain("85%");
    });

    it("should list detected languages", () => {
      const caps = createTestCapabilities({
        languages: ["java", "kotlin"],
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("java");
      expect(output).toContain("kotlin");
    });

    it("should show available capabilities", () => {
      const caps = createTestCapabilities();

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("vitest");
      expect(output).toContain("npm test");
      expect(output).toContain("tsc --noEmit");
      expect(output).toContain("npm run build");
    });

    it("should show Not detected for unavailable capabilities", () => {
      const caps = createTestCapabilities({
        hasLint: false,
        lintInfo: { available: false, confidence: 0 },
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Lint: Not detected");
    });

    it("should show 'Unknown' when no languages detected", () => {
      const caps = createTestCapabilities({
        languages: [],
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Unknown");
    });

    it("should show custom test framework when framework is undefined", () => {
      const caps = createTestCapabilities({
        testInfo: { available: true, command: "./custom-test.sh", confidence: 0.9 },
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("custom");
    });
  });

  describe("formatCapabilities", () => {
    it("should format all detected capabilities", () => {
      const caps = {
        hasTests: true,
        testCommand: "npm test",
        testFramework: "vitest",
        hasTypeCheck: true,
        typeCheckCommand: "npx tsc --noEmit",
        hasLint: true,
        lintCommand: "npm run lint",
        hasBuild: true,
        buildCommand: "npm run build",
        hasGit: true,
      };

      const output = formatCapabilities(caps);

      expect(output).toContain("vitest");
      expect(output).toContain("npm test");
      expect(output).toContain("tsc --noEmit");
      expect(output).toContain("npm run lint");
      expect(output).toContain("npm run build");
      expect(output).toContain("Available");
    });

    it("should show Not detected for missing capabilities", () => {
      const caps = {
        hasTests: false,
        hasTypeCheck: false,
        hasLint: false,
        hasBuild: false,
        hasGit: false,
      };

      const output = formatCapabilities(caps);

      expect(output).toContain("Tests: Not detected");
      expect(output).toContain("Type Check: Not detected");
      expect(output).toContain("Lint: Not detected");
      expect(output).toContain("Build: Not detected");
      expect(output).toContain("Not available");
    });
  });

  describe("detectVerificationCapabilities", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "detect-verify-cap-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("should detect capabilities in Node.js project", async () => {
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "vitest run" },
          devDependencies: { vitest: "^1.0.0" },
        })
      );

      const caps = await detectVerificationCapabilities(tempDir);

      expect(caps.hasTests).toBe(true);
      expect(caps.testFramework).toBe("vitest");
    });
  });

  describe("detectCapabilities - three-tier detection", () => {
    let tempDir: string;
    let consoleSpy: ReturnType<typeof vi.spyOn>;
    let aiSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "detect-cap-test-"));
      consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      // Mock AI discovery by default to prevent real API calls
      aiSpy = vi.spyOn(agents, "callAnyAvailableAgent").mockResolvedValue({
        success: true,
        output: JSON.stringify({ languages: ["unknown"] }),
        agentUsed: "test",
      });
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
      consoleSpy.mockRestore();
      aiSpy.mockRestore();
      vi.restoreAllMocks();
    });

    it("should use cached capabilities when available and not stale", async () => {
      // Create a well-configured Node.js project with high confidence
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "vitest run", build: "tsc", lint: "eslint ." },
          devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0", eslint: "^8.0.0" },
        })
      );
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );

      // First detection creates cache
      const first = await detectCapabilities(tempDir);
      expect(first.hasTests).toBe(true);
      expect(first.source).toBe("preset");

      // Second detection should use cache
      const second = await detectCapabilities(tempDir, { verbose: true });
      expect(second.hasTests).toBe(true);
    });

    it("should force re-detection when force option is true", async () => {
      // Create a well-configured Node.js project with high enough confidence
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "vitest run", build: "tsc", lint: "eslint ." },
          devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0", eslint: "^8.0.0" },
        })
      );
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );

      // First detection
      const first = await detectCapabilities(tempDir);
      expect(first.hasTests).toBe(true);

      // Force re-detection - should still detect the same capabilities
      const result = await detectCapabilities(tempDir, { force: true });
      expect(result.hasTests).toBe(true);
      expect(result.source).toBe("preset");
    });

    it("should fall back to AI discovery for unknown project types", async () => {
      // Mock AI to return specific capabilities
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["elixir"],
          test: { available: true, command: "mix test" },
        }),
        agentUsed: "test",
      });

      const result = await detectCapabilities(tempDir, { forceAI: true, verbose: true });

      expect(result.source).toBe("ai-discovered");
    });

    it("should use preset detection when confidence is high enough", async () => {
      // Create a well-configured Node.js project
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "vitest run", build: "tsc", lint: "eslint ." },
          devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0", eslint: "^8.0.0" },
        })
      );
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );

      const result = await detectCapabilities(tempDir, { verbose: true });

      expect(result.source).toBe("preset");
      expect(result.confidence).toBeGreaterThanOrEqual(0.8);
    });

    it("should fall back to AI when preset confidence is too low", async () => {
      // Create a project with some but incomplete config
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test" })
      );

      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({ languages: ["javascript"] }),
        agentUsed: "test",
      });

      const result = await detectCapabilities(tempDir, { verbose: true });

      // With low confidence preset, it should fall back to AI
      expect(result.source).toBe("ai-discovered");
    });

    it("should skip cache check when forceAI is true", async () => {
      // Create a well-configured project for caching
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({
          scripts: { test: "vitest run", build: "tsc", lint: "eslint ." },
          devDependencies: { vitest: "^1.0.0", typescript: "^5.0.0", eslint: "^8.0.0" },
        })
      );
      await fs.writeFile(
        path.join(tempDir, "tsconfig.json"),
        JSON.stringify({ compilerOptions: {} })
      );
      await detectCapabilities(tempDir); // Create cache

      // Force AI should skip cache
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({ languages: ["typescript"] }),
        agentUsed: "test",
      });

      const result = await detectCapabilities(tempDir, { forceAI: true });

      expect(result.source).toBe("ai-discovered");
    });
  });
});
