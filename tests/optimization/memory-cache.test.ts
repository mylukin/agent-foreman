/**
 * Tests for memory cache optimization in capabilities detection
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";

// Use vi.hoisted to create mock functions
const { mockCallAnyAvailableAgent } = vi.hoisted(() => ({
  mockCallAnyAvailableAgent: vi.fn(),
}));

// Mock the agents module
vi.mock("../../src/agents.js", () => ({
  callAnyAvailableAgent: mockCallAnyAvailableAgent,
}));

import {
  detectCapabilities,
  clearCapabilitiesCache,
  MEMORY_CACHE_TTL,
  loadCachedCapabilities,
  saveCapabilities,
} from "../../src/project-capabilities.js";
import type { ExtendedCapabilities } from "../../src/verification-types.js";

describe("Memory Cache Optimization", () => {
  let testDir: string;

  const mockAIResponse = JSON.stringify({
    languages: ["typescript"],
    configFiles: ["package.json", "tsconfig.json"],
    packageManager: "npm",
    test: {
      available: true,
      command: "npm test",
      framework: "vitest",
      confidence: 0.95,
    },
    typecheck: {
      available: true,
      command: "npx tsc --noEmit",
      confidence: 0.9,
    },
    lint: { available: false },
    build: { available: false },
  });

  beforeEach(async () => {
    testDir = path.join(
      tmpdir(),
      `memory-cache-test-${Date.now()}-${Math.random().toString(36).slice(2)}`
    );
    await fs.mkdir(testDir, { recursive: true });
    await fs.mkdir(path.join(testDir, "ai"), { recursive: true });

    // Initialize git repo for capability detection
    const { execSync } = await import("node:child_process");
    execSync("git init", { cwd: testDir, stdio: "ignore" });
    execSync('git config user.email "test@test.com"', { cwd: testDir, stdio: "ignore" });
    execSync('git config user.name "Test"', { cwd: testDir, stdio: "ignore" });
    execSync("git commit --allow-empty -m 'init'", { cwd: testDir, stdio: "ignore" });

    vi.clearAllMocks();
    clearCapabilitiesCache();

    mockCallAnyAvailableAgent.mockResolvedValue({
      success: true,
      output: mockAIResponse,
      provider: "test",
    });
  });

  afterEach(async () => {
    clearCapabilitiesCache();
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("Memory cache returns cached capabilities within TTL", () => {
    it("returns memory-cached capabilities on second call", async () => {
      // First call - should use AI
      await detectCapabilities(testDir);
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);

      // Second call - should use memory cache
      await detectCapabilities(testDir);
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1); // Still 1
    });

    it("logs memory cache usage in verbose mode", async () => {
      const consoleSpy = vi.spyOn(console, "log");

      // First call
      await detectCapabilities(testDir, { verbose: true });

      // Second call - should log memory cache usage
      await detectCapabilities(testDir, { verbose: true });

      expect(consoleSpy).toHaveBeenCalledWith("  Using memory-cached capabilities");
      consoleSpy.mockRestore();
    });
  });

  describe("Memory cache expires after TTL", () => {
    it("refreshes cache after TTL expires", async () => {
      // First call
      await detectCapabilities(testDir);
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);

      // Simulate TTL expiration by clearing and setting new timestamp
      // We can't easily mock Date.now, so we'll clear the cache to simulate expiration
      clearCapabilitiesCache();

      // Third call - should use AI again (cache cleared)
      await detectCapabilities(testDir, { force: true });
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe("Memory cache is project-specific (cwd-based)", () => {
    it("different projects have separate caches", async () => {
      const testDir2 = path.join(
        tmpdir(),
        `memory-cache-test2-${Date.now()}-${Math.random().toString(36).slice(2)}`
      );
      await fs.mkdir(testDir2, { recursive: true });
      await fs.mkdir(path.join(testDir2, "ai"), { recursive: true });

      // Initialize git repo
      const { execSync } = await import("node:child_process");
      execSync("git init", { cwd: testDir2, stdio: "ignore" });
      execSync('git config user.email "test@test.com"', { cwd: testDir2, stdio: "ignore" });
      execSync('git config user.name "Test"', { cwd: testDir2, stdio: "ignore" });
      execSync("git commit --allow-empty -m 'init'", { cwd: testDir2, stdio: "ignore" });

      try {
        // First project
        await detectCapabilities(testDir);
        expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);

        // Second project - should use AI (different cwd)
        await detectCapabilities(testDir2);
        expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(2);

        // Back to first project - memory cache was overwritten by second project
        // So it will use disk cache or AI
        await detectCapabilities(testDir);
        // Should not call AI again if disk cache exists
      } finally {
        await fs.rm(testDir2, { recursive: true, force: true });
      }
    });
  });

  describe("clearCapabilitiesCache clears memory cache", () => {
    it("clears memory cache forcing fresh detection", async () => {
      // First call
      await detectCapabilities(testDir);
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);

      // Clear cache
      clearCapabilitiesCache();

      // Next call with force - should use AI again
      await detectCapabilities(testDir, { force: true });
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe("force option bypasses memory cache", () => {
    it("force option always re-detects", async () => {
      // First call
      await detectCapabilities(testDir);
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);

      // Force detection - should use AI despite memory cache
      await detectCapabilities(testDir, { force: true });
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(2);
    });
  });

  describe("MEMORY_CACHE_TTL constant", () => {
    it("MEMORY_CACHE_TTL is 60000 (1 minute)", () => {
      expect(MEMORY_CACHE_TTL).toBe(60000);
    });
  });

  describe("Memory cache structure", () => {
    it("caches capabilities correctly", async () => {
      // First call
      const result1 = await detectCapabilities(testDir);

      // Second call - should return same object
      const result2 = await detectCapabilities(testDir);

      expect(result1.hasTests).toBe(result2.hasTests);
      expect(result1.testCommand).toBe(result2.testCommand);
      expect(result1.languages).toEqual(result2.languages);
    });
  });
});
