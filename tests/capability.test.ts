/**
 * Tests for project capabilities detection (Cache → AI)
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
  loadFullCache,
  formatExtendedCapabilities,
  detectCapabilities,
  formatCapabilities,
  detectVerificationCapabilities,
  buildAutonomousDiscoveryPrompt,
  parseCapabilityResponse,
  discoverCapabilitiesWithAI,
  clearCapabilitiesCache,
} from "../src/project-capabilities.js";

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
    source: "ai-discovered",
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
// Capability Cache Tests
// ============================================================================

describe("Capability Cache", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "cap-cache-test-"));
    // Ensure ai/ directory exists
    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("loadCachedCapabilities", () => {
    it("should return null when cache file does not exist", async () => {
      const result = await loadCachedCapabilities(tempDir);
      expect(result).toBeNull();
    });

    it("should return capabilities when cache file exists and is valid", async () => {
      const capabilities = createTestCapabilities();
      const cache: CapabilityCache = {
        version: CACHE_VERSION,
        capabilities,
        commitHash: "abc123",
        trackedFiles: ["package.json"],
      };
      await fs.writeFile(
        path.join(tempDir, "ai/capabilities.json"),
        JSON.stringify(cache)
      );

      const result = await loadCachedCapabilities(tempDir);

      expect(result).not.toBeNull();
      expect(result?.source).toBe("cached");
      expect(result?.hasTests).toBe(true);
    });

    it("should return null when cache version does not match", async () => {
      const capabilities = createTestCapabilities();
      const cache = {
        version: "0.0.0",
        capabilities,
        commitHash: "abc123",
        trackedFiles: ["package.json"],
      };
      await fs.writeFile(
        path.join(tempDir, "ai/capabilities.json"),
        JSON.stringify(cache)
      );

      const result = await loadCachedCapabilities(tempDir);

      expect(result).toBeNull();
    });

    it("should return null when cache file is corrupted", async () => {
      await fs.writeFile(
        path.join(tempDir, "ai/capabilities.json"),
        "not valid json"
      );

      const result = await loadCachedCapabilities(tempDir);

      expect(result).toBeNull();
    });
  });

  describe("saveCapabilities", () => {
    it("should create cache file with correct structure", async () => {
      const capabilities = createTestCapabilities();

      await saveCapabilities(tempDir, capabilities);

      const content = await fs.readFile(
        path.join(tempDir, "ai/capabilities.json"),
        "utf-8"
      );
      const cache = JSON.parse(content);

      expect(cache.version).toBe(CACHE_VERSION);
      expect(cache.capabilities.hasTests).toBe(true);
      expect(cache.trackedFiles).toBeInstanceOf(Array);
    });

    it("should create ai/ directory if it does not exist", async () => {
      await fs.rm(path.join(tempDir, "ai"), { recursive: true, force: true });
      const capabilities = createTestCapabilities();

      await saveCapabilities(tempDir, capabilities);

      const exists = await fs
        .access(path.join(tempDir, "ai/capabilities.json"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(true);
    });
  });

  describe("invalidateCache", () => {
    it("should remove cache file when it exists", async () => {
      const capabilities = createTestCapabilities();
      await saveCapabilities(tempDir, capabilities);

      await invalidateCache(tempDir);

      const exists = await fs
        .access(path.join(tempDir, "ai/capabilities.json"))
        .then(() => true)
        .catch(() => false);
      expect(exists).toBe(false);
    });

    it("should not throw when cache file does not exist", async () => {
      await expect(invalidateCache(tempDir)).resolves.not.toThrow();
    });
  });

  describe("isStale", () => {
    it("should return true when cache file does not exist", async () => {
      const result = await isStale(tempDir);
      expect(result).toBe(true);
    });

    it("should return true when no commit hash is stored", async () => {
      const cache = {
        version: CACHE_VERSION,
        capabilities: createTestCapabilities(),
        trackedFiles: ["package.json"],
      };
      await fs.writeFile(
        path.join(tempDir, "ai/capabilities.json"),
        JSON.stringify(cache)
      );

      const result = await isStale(tempDir);

      expect(result).toBe(true);
    });
  });

  describe("loadFullCache", () => {
    it("should return full cache object including metadata", async () => {
      const capabilities = createTestCapabilities();
      const cache: CapabilityCache = {
        version: CACHE_VERSION,
        capabilities,
        commitHash: "abc123",
        trackedFiles: ["package.json", "tsconfig.json"],
      };
      await fs.writeFile(
        path.join(tempDir, "ai/capabilities.json"),
        JSON.stringify(cache)
      );

      const result = await loadFullCache(tempDir);

      expect(result).not.toBeNull();
      expect(result?.commitHash).toBe("abc123");
      expect(result?.trackedFiles).toEqual(["package.json", "tsconfig.json"]);
    });

    it("should return null when cache is corrupted", async () => {
      await fs.writeFile(
        path.join(tempDir, "ai/capabilities.json"),
        "invalid json"
      );

      const result = await loadFullCache(tempDir);

      expect(result).toBeNull();
    });
  });
});

// ============================================================================
// AI Capability Discovery Tests
// ============================================================================

describe("AI Capability Discovery", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-discovery-test-"));
    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("buildAutonomousDiscoveryPrompt", () => {
    it("should include working directory in prompt", () => {
      const prompt = buildAutonomousDiscoveryPrompt("/test/project");

      expect(prompt).toContain("/test/project");
      expect(prompt).toContain("Working Directory");
    });

    it("should include exploration instructions", () => {
      const prompt = buildAutonomousDiscoveryPrompt("/test");

      expect(prompt).toContain("Explore");
      expect(prompt).toContain("configuration files");
      expect(prompt).toContain("List the root directory");
    });

    it("should include critical requirements for test commands", () => {
      const prompt = buildAutonomousDiscoveryPrompt("/test");

      expect(prompt).toContain("run once and exit");
      expect(prompt).toContain("No watch mode");
    });

    it("should include JSON output format", () => {
      const prompt = buildAutonomousDiscoveryPrompt("/test");

      expect(prompt).toContain("languages");
      expect(prompt).toContain("test");
      expect(prompt).toContain("typecheck");
      expect(prompt).toContain("lint");
      expect(prompt).toContain("build");
    });
  });

  describe("parseCapabilityResponse", () => {
    it("should parse valid JSON response", () => {
      const response = JSON.stringify({
        languages: ["typescript", "nodejs"],
        test: { available: true, command: "npm test", framework: "vitest" },
        build: { available: true, command: "npm run build" },
      });

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.languages).toEqual(["typescript", "nodejs"]);
        expect(result.data.test?.available).toBe(true);
        expect(result.data.test?.command).toBe("npm test");
      }
    });

    it("should extract JSON from markdown code block", () => {
      const response = `Here is the analysis:
\`\`\`json
{
  "languages": ["python"],
  "test": { "available": true, "command": "pytest" }
}
\`\`\`
`;

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.languages).toEqual(["python"]);
      }
    });

    it("should handle missing languages field", () => {
      const response = JSON.stringify({
        test: { available: true, command: "npm test" },
      });

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain("languages");
      }
    });

    it("should handle invalid JSON", () => {
      const response = "not valid json at all";

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(false);
    });

    it("should extract JSON object from mixed content", () => {
      const response = `Based on my analysis of the project:
{
  "languages": ["rust"],
  "test": { "available": true, "command": "cargo test" },
  "build": { "available": true, "command": "cargo build" }
}
The project appears to be well configured.`;

      const result = parseCapabilityResponse(response);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.languages).toEqual(["rust"]);
      }
    });
  });

  describe("discoverCapabilitiesWithAI", () => {
    it("should return capabilities from AI response", async () => {
      const aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript", "nodejs"],
          configFiles: ["package.json", "tsconfig.json"],
          test: { available: true, command: "vitest run", framework: "vitest", confidence: 0.95 },
          typecheck: { available: true, command: "npx tsc --noEmit", confidence: 0.9 },
          build: { available: true, command: "npm run build", confidence: 0.9 },
        }),
        agentUsed: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.capabilities.source).toBe("ai-discovered");
      expect(result.capabilities.languages).toEqual(["typescript", "nodejs"]);
      expect(result.capabilities.hasTests).toBe(true);
      expect(result.capabilities.testCommand).toBe("vitest run");
      expect(result.capabilities.hasTypeCheck).toBe(true);
      expect(result.configFiles).toEqual(["package.json", "tsconfig.json"]);
    });

    it("should return minimal capabilities when AI fails", async () => {
      const aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
      aiSpy.mockResolvedValue({
        success: false,
        output: "",
        error: "AI unavailable",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.capabilities.source).toBe("ai-discovered");
      expect(result.capabilities.confidence).toBe(0);
      expect(result.capabilities.hasTests).toBe(false);
      expect(result.configFiles).toEqual([]);
    });

    it("should return minimal capabilities when AI response is invalid", async () => {
      const aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
      aiSpy.mockResolvedValue({
        success: true,
        output: "not valid json",
        agentUsed: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.capabilities.source).toBe("ai-discovered");
      expect(result.capabilities.confidence).toBe(0);
    });

    it("should include custom rules when provided by AI", async () => {
      const aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript"],
          configFiles: ["package.json"],
          test: { available: true, command: "npm test" },
          customRules: [
            {
              id: "e2e-test",
              description: "Run E2E tests",
              command: "npm run test:e2e",
              type: "test",
            },
          ],
        }),
        agentUsed: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.capabilities.customRules).toBeDefined();
      expect(result.capabilities.customRules).toHaveLength(1);
      expect(result.capabilities.customRules?.[0].id).toBe("e2e-test");
    });

    it("should detect E2E capabilities when Playwright is present", async () => {
      const aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript"],
          configFiles: ["package.json", "playwright.config.ts"],
          test: { available: true, command: "npm test", framework: "vitest" },
          e2e: {
            available: true,
            command: "npx playwright test",
            framework: "playwright",
            confidence: 0.95,
            configFile: "playwright.config.ts",
            grepTemplate: "npx playwright test --grep {tags}",
            fileTemplate: "npx playwright test {files}",
          },
        }),
        agentUsed: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.capabilities.e2eInfo).toBeDefined();
      expect(result.capabilities.e2eInfo?.available).toBe(true);
      expect(result.capabilities.e2eInfo?.command).toBe("npx playwright test");
      expect(result.capabilities.e2eInfo?.framework).toBe("playwright");
      expect(result.capabilities.e2eInfo?.confidence).toBe(0.95);
      expect(result.capabilities.e2eInfo?.configFile).toBe("playwright.config.ts");
      expect(result.capabilities.e2eInfo?.grepTemplate).toBe("npx playwright test --grep {tags}");
      expect(result.capabilities.e2eInfo?.fileTemplate).toBe("npx playwright test {files}");
    });

    it("should set e2eInfo.available to false when E2E not present", async () => {
      const aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript"],
          configFiles: ["package.json"],
          test: { available: true, command: "npm test" },
          // No e2e field
        }),
        agentUsed: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      expect(result.capabilities.e2eInfo).toBeDefined();
      expect(result.capabilities.e2eInfo?.available).toBe(false);
      expect(result.capabilities.e2eInfo?.confidence).toBe(0);
    });

    it("should include E2E confidence in average confidence calculation", async () => {
      const aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript"],
          configFiles: ["package.json"],
          test: { available: true, command: "npm test", confidence: 0.9 },
          e2e: { available: true, command: "npx playwright test", confidence: 0.8 },
        }),
        agentUsed: "test",
      });

      const result = await discoverCapabilitiesWithAI(tempDir);

      // Average of 0.9 (test) and 0.8 (e2e) = 0.85
      expect(result.capabilities.confidence).toBeCloseTo(0.85, 10);
    });
  });
});

// ============================================================================
// Two-Tier Detection Tests
// ============================================================================

describe("Two-Tier Detection System", () => {
  let tempDir: string;
  let aiSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(async () => {
    clearCapabilitiesCache();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "detection-test-"));
    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    aiSpy = vi.spyOn(agents, "callAnyAvailableAgent");
  });

  afterEach(async () => {
    clearCapabilitiesCache();
    await fs.rm(tempDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  describe("detectCapabilities", () => {
    it("should use cache when available and not stale", async () => {
      // First call - will use AI
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript"],
          configFiles: ["package.json"],
          test: { available: true, command: "npm test" },
        }),
        agentUsed: "test",
      });

      // Initialize git repo properly for cache tracking
      const { execSync } = await import("node:child_process");
      try {
        execSync("git init", { cwd: tempDir, stdio: "pipe" });
        // Create an initial commit so git rev-parse HEAD works
        await fs.writeFile(path.join(tempDir, ".gitignore"), "");
        execSync("git add .gitignore && git commit -m 'init'", { cwd: tempDir, stdio: "pipe" });
      } catch {
        // Skip if git not available
      }

      const result1 = await detectCapabilities(tempDir, { force: true });
      expect(result1.source).toBe("ai-discovered");

      // Clear memory cache to test disk cache specifically
      clearCapabilitiesCache();

      // Second call - should use disk cache (since no config files changed)
      const result2 = await detectCapabilities(tempDir);
      expect(result2.source).toBe("cached");
    });

    it("should skip cache when force is true", async () => {
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["typescript"],
          configFiles: ["package.json"],
          test: { available: true, command: "npm test" },
        }),
        agentUsed: "test",
      });

      // Initialize git
      await fs.mkdir(path.join(tempDir, ".git"), { recursive: true });

      // First call to create cache
      await detectCapabilities(tempDir, { force: true });

      // Force should skip cache and re-detect with AI
      const result = await detectCapabilities(tempDir, { force: true });

      expect(result.source).toBe("ai-discovered");
    });

    it("should use AI when no cache exists", async () => {
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["go"],
          configFiles: ["go.mod"],
          test: { available: true, command: "go test ./..." },
          build: { available: true, command: "go build ./..." },
        }),
        agentUsed: "test",
      });

      const result = await detectCapabilities(tempDir);

      expect(result.source).toBe("ai-discovered");
      expect(result.languages).toContain("go");
    });
  });

  describe("detectVerificationCapabilities (legacy)", () => {
    it("should return legacy format from AI detection", async () => {
      aiSpy.mockResolvedValue({
        success: true,
        output: JSON.stringify({
          languages: ["rust"],
          configFiles: ["Cargo.toml"],
          test: { available: true, command: "cargo test", framework: "cargo" },
          lint: { available: true, command: "cargo clippy" },
          build: { available: true, command: "cargo build" },
        }),
        agentUsed: "test",
      });

      const result = await detectVerificationCapabilities(tempDir);

      expect(result.hasTests).toBe(true);
      expect(result.testCommand).toBe("cargo test");
      expect(result.hasLint).toBe(true);
      expect(result.hasBuild).toBe(true);
      // Legacy format doesn't have source field
      expect((result as ExtendedCapabilities).source).toBeUndefined();
    });
  });
});

// ============================================================================
// Capability Formatting Tests
// ============================================================================

describe("Capability Formatting", () => {
  describe("formatExtendedCapabilities", () => {
    it("should format all capabilities when available", () => {
      const caps = createTestCapabilities();

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Source: ai-discovered");
      expect(output).toContain("Confidence: 95%");
      expect(output).toContain("Languages: typescript, nodejs");
      expect(output).toContain("Tests: vitest");
      expect(output).toContain("Type Check:");
      expect(output).toContain("Build:");
    });

    it("should show 'Not detected' for unavailable capabilities", () => {
      const caps = createTestCapabilities({
        hasLint: false,
        lintInfo: { available: false, confidence: 0 },
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Lint: Not detected");
    });

    it("should show 'Unknown' when no languages detected", () => {
      const caps = createTestCapabilities({ languages: [] });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Languages: Unknown");
    });
  });

  describe("formatCapabilities", () => {
    it("should format legacy capabilities", () => {
      const caps = {
        hasTests: true,
        testCommand: "npm test",
        testFramework: "jest",
        hasTypeCheck: true,
        typeCheckCommand: "tsc --noEmit",
        hasLint: false,
        hasBuild: true,
        buildCommand: "npm run build",
        hasGit: true,
      };

      const output = formatCapabilities(caps);

      expect(output).toContain("Tests: jest (npm test)");
      expect(output).toContain("Type Check: tsc --noEmit");
      expect(output).toContain("Lint: Not detected");
      expect(output).toContain("Build: npm run build");
      expect(output).toContain("Git: Available");
    });

    it("should show not detected for capabilities when not available", () => {
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
      expect(output).toContain("Git: Not available");
    });

    it("should show lint when available", () => {
      const caps = {
        hasTests: false,
        hasTypeCheck: false,
        hasLint: true,
        lintCommand: "eslint .",
        hasBuild: false,
        hasGit: true,
      };

      const output = formatCapabilities(caps);

      expect(output).toContain("Lint: eslint .");
    });
  });

  describe("formatExtendedCapabilities - additional cases", () => {
    it("should show not detected for unavailable testInfo", () => {
      const caps = createTestCapabilities({
        testInfo: undefined,
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Tests:");
    });

    it("should show not detected for unavailable typeCheckInfo", () => {
      const caps = createTestCapabilities({
        typeCheckInfo: undefined,
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Type Check: Not detected");
    });

    it("should show not detected for unavailable lintInfo", () => {
      const caps = createTestCapabilities({
        lintInfo: undefined,
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Lint: Not detected");
    });

    it("should show not detected for unavailable buildInfo", () => {
      const caps = createTestCapabilities({
        buildInfo: undefined,
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Build: Not detected");
    });

    it("should show git not available when hasGit is false", () => {
      const caps = createTestCapabilities({
        hasGit: false,
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Git: Not available");
    });

    it("should handle custom framework display in testInfo", () => {
      const caps = createTestCapabilities({
        testInfo: { available: true, command: "test cmd", confidence: 0.9 },
      });

      const output = formatExtendedCapabilities(caps);

      expect(output).toContain("Tests: custom (test cmd)");
    });
  });
});
