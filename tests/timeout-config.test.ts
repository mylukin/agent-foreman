/**
 * Tests for timeout configuration module
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  DEFAULT_TIMEOUTS,
  TIMEOUT_ENV_VARS,
  getTimeout,
  getAllTimeouts,
  formatTimeout,
} from "../src/timeout-config.js";

describe("Timeout Configuration", () => {
  // Store original env values
  const originalEnv: Record<string, string | undefined> = {};

  beforeEach(() => {
    // Save original values
    for (const key of Object.values(TIMEOUT_ENV_VARS)) {
      originalEnv[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    // Restore original values
    for (const key of Object.values(TIMEOUT_ENV_VARS)) {
      if (originalEnv[key] !== undefined) {
        process.env[key] = originalEnv[key];
      } else {
        delete process.env[key];
      }
    }
  });

  describe("DEFAULT_TIMEOUTS", () => {
    it("should have all required timeout keys", () => {
      expect(DEFAULT_TIMEOUTS.AI_SCAN_PROJECT).toBeDefined();
      expect(DEFAULT_TIMEOUTS.AI_GENERATE_FROM_SURVEY).toBeDefined();
      expect(DEFAULT_TIMEOUTS.AI_GENERATE_FROM_GOAL).toBeDefined();
      expect(DEFAULT_TIMEOUTS.AI_MERGE_INIT_SCRIPT).toBeDefined();
      expect(DEFAULT_TIMEOUTS.AI_MERGE_CLAUDE_MD).toBeDefined();
      expect(DEFAULT_TIMEOUTS.AI_VERIFICATION).toBeDefined();
      expect(DEFAULT_TIMEOUTS.AI_CAPABILITY_DISCOVERY).toBeDefined();
      expect(DEFAULT_TIMEOUTS.AI_DEFAULT).toBeDefined();
    });

    it("should have reasonable default values", () => {
      // AI scan is the longest operation (10 minutes) - for large monorepos
      expect(DEFAULT_TIMEOUTS.AI_SCAN_PROJECT).toBe(600000);

      // Feature generation (3 minutes) - text-to-JSON, typically fast
      expect(DEFAULT_TIMEOUTS.AI_GENERATE_FROM_SURVEY).toBe(180000);
      expect(DEFAULT_TIMEOUTS.AI_GENERATE_FROM_GOAL).toBe(180000);

      // Verification (5 minutes) - includes tests/builds + AI analysis
      expect(DEFAULT_TIMEOUTS.AI_VERIFICATION).toBe(300000);

      // Merge operations (2 minutes) - simple text merges
      expect(DEFAULT_TIMEOUTS.AI_MERGE_INIT_SCRIPT).toBe(120000);
      expect(DEFAULT_TIMEOUTS.AI_MERGE_CLAUDE_MD).toBe(120000);
      expect(DEFAULT_TIMEOUTS.AI_CAPABILITY_DISCOVERY).toBe(120000);

      // Default (5 minutes)
      expect(DEFAULT_TIMEOUTS.AI_DEFAULT).toBe(300000);
    });
  });

  describe("getTimeout", () => {
    it("should return default value when no env var is set", () => {
      expect(getTimeout("AI_SCAN_PROJECT")).toBe(DEFAULT_TIMEOUTS.AI_SCAN_PROJECT);
      expect(getTimeout("AI_VERIFICATION")).toBe(DEFAULT_TIMEOUTS.AI_VERIFICATION);
    });

    it("should return env var value when set", () => {
      process.env.AGENT_FOREMAN_TIMEOUT_SCAN = "900000";
      expect(getTimeout("AI_SCAN_PROJECT")).toBe(900000);
    });

    it("should ignore invalid env var values", () => {
      process.env.AGENT_FOREMAN_TIMEOUT_SCAN = "invalid";
      expect(getTimeout("AI_SCAN_PROJECT")).toBe(DEFAULT_TIMEOUTS.AI_SCAN_PROJECT);
    });

    it("should ignore negative env var values", () => {
      process.env.AGENT_FOREMAN_TIMEOUT_SCAN = "-1000";
      expect(getTimeout("AI_SCAN_PROJECT")).toBe(DEFAULT_TIMEOUTS.AI_SCAN_PROJECT);
    });

    it("should ignore zero env var values", () => {
      process.env.AGENT_FOREMAN_TIMEOUT_SCAN = "0";
      expect(getTimeout("AI_SCAN_PROJECT")).toBe(DEFAULT_TIMEOUTS.AI_SCAN_PROJECT);
    });

    it("should use global default when specific timeout not set", () => {
      process.env.AGENT_FOREMAN_TIMEOUT_DEFAULT = "180000";
      expect(getTimeout("AI_SCAN_PROJECT")).toBe(180000);
    });

    it("should prefer specific timeout over global default", () => {
      process.env.AGENT_FOREMAN_TIMEOUT_DEFAULT = "180000";
      process.env.AGENT_FOREMAN_TIMEOUT_SCAN = "600000";
      expect(getTimeout("AI_SCAN_PROJECT")).toBe(600000);
    });
  });

  describe("getAllTimeouts", () => {
    it("should return all timeouts with their sources", () => {
      const timeouts = getAllTimeouts();

      expect(timeouts.AI_SCAN_PROJECT).toEqual({
        value: DEFAULT_TIMEOUTS.AI_SCAN_PROJECT,
        source: "default",
      });
    });

    it("should indicate when value comes from env", () => {
      process.env.AGENT_FOREMAN_TIMEOUT_SCAN = "900000";
      const timeouts = getAllTimeouts();

      expect(timeouts.AI_SCAN_PROJECT).toEqual({
        value: 900000,
        source: "env",
      });
    });
  });

  describe("formatTimeout", () => {
    it("should format seconds only", () => {
      expect(formatTimeout(30000)).toBe("30s");
      expect(formatTimeout(1000)).toBe("1s");
    });

    it("should format minutes only", () => {
      expect(formatTimeout(60000)).toBe("1m");
      expect(formatTimeout(300000)).toBe("5m");
      expect(formatTimeout(600000)).toBe("10m");
    });

    it("should format minutes and seconds", () => {
      expect(formatTimeout(90000)).toBe("1m 30s");
      expect(formatTimeout(150000)).toBe("2m 30s");
    });
  });
});
