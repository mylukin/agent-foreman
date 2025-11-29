/**
 * Tests for debug.ts
 * Debug logging utility with DEBUG environment variable support
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  createDebug,
  debugScanner,
  debugDetector,
  debugCache,
  debugDiscovery,
  debugVerifier,
  debugAgents,
  debugGit,
  debugProgress,
  debugFeature,
  debugInit,
} from "../src/debug.js";

describe("Debug Logging", () => {
  let originalDebug: string | undefined;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    originalDebug = process.env.DEBUG;
    consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalDebug !== undefined) {
      process.env.DEBUG = originalDebug;
    } else {
      delete process.env.DEBUG;
    }
    consoleErrorSpy.mockRestore();
  });

  describe("createDebug", () => {
    it("should return a function", () => {
      const debug = createDebug("scanner");
      expect(typeof debug).toBe("function");
    });

    it("should have error method", () => {
      const debug = createDebug("scanner");
      expect(typeof debug.error).toBe("function");
    });

    it("should have warn method", () => {
      const debug = createDebug("scanner");
      expect(typeof debug.warn).toBe("function");
    });
  });

  describe("debug logging when enabled", () => {
    it("should log when DEBUG matches specific namespace", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");

      debug("test message");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:cache]");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("test message");
    });

    it("should log when DEBUG matches wildcard pattern", () => {
      process.env.DEBUG = "agent-foreman:*";
      const debug = createDebug("scanner");

      debug("test message");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:scanner]");
    });

    it("should log when DEBUG is global wildcard", () => {
      process.env.DEBUG = "*";
      const debug = createDebug("detector");

      debug("global wildcard test");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("should log when DEBUG contains multiple namespaces", () => {
      process.env.DEBUG = "agent-foreman:cache,agent-foreman:git";
      const debugCacheTest = createDebug("cache");
      const debugGitTest = createDebug("git");
      const debugScannerTest = createDebug("scanner");

      debugCacheTest("cache message");
      debugGitTest("git message");
      debugScannerTest("scanner message");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it("should include timestamp in log output", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");

      debug("test message");

      expect(consoleErrorSpy.mock.calls[0][0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it("should pass additional arguments to console.error", () => {
      process.env.DEBUG = "agent-foreman:scanner";
      const debug = createDebug("scanner");

      debug("test with args %s %d", "str", 42);

      expect(consoleErrorSpy.mock.calls[0]).toHaveLength(3);
      expect(consoleErrorSpy.mock.calls[0][1]).toBe("str");
      expect(consoleErrorSpy.mock.calls[0][2]).toBe(42);
    });
  });

  describe("debug logging when disabled", () => {
    it("should not log when DEBUG is not set", () => {
      delete process.env.DEBUG;
      const debug = createDebug("cache");

      debug("should not appear");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should not log when DEBUG is empty string", () => {
      process.env.DEBUG = "";
      const debug = createDebug("cache");

      debug("should not appear");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should not log when DEBUG doesn't match namespace", () => {
      process.env.DEBUG = "agent-foreman:other";
      const debug = createDebug("cache");

      debug("should not appear");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });

    it("should not log when DEBUG is for different tool", () => {
      process.env.DEBUG = "other-tool:*";
      const debug = createDebug("cache");

      debug("should not appear");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("debug.error", () => {
    it("should log error message when enabled", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");

      debug.error("error occurred");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("ERROR:");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("error occurred");
    });

    it("should log Error object with message and stack", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");
      const error = new Error("test error");
      error.stack = "Error: test error\n    at test.ts:10";

      debug.error("caught error", error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("ERROR:");
      expect(consoleErrorSpy.mock.calls[1][0]).toContain("test error");
      expect(consoleErrorSpy.mock.calls[2][0]).toContain("Error: test error");
    });

    it("should log Error object without stack", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");
      const error = new Error("test error");
      delete error.stack;

      debug.error("caught error", error);

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
    });

    it("should log non-Error objects", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");

      debug.error("caught error", { code: 500, message: "server error" });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy.mock.calls[1][0]).toContain("[object Object]");
    });

    it("should log string error", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");

      debug.error("caught error", "string error message");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
      expect(consoleErrorSpy.mock.calls[1][0]).toContain("string error message");
    });

    it("should not log when disabled", () => {
      delete process.env.DEBUG;
      const debug = createDebug("cache");

      debug.error("error occurred", new Error("test"));

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("debug.warn", () => {
    it("should log warning message when enabled", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");

      debug.warn("warning message");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("WARN:");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("warning message");
    });

    it("should pass additional arguments", () => {
      process.env.DEBUG = "agent-foreman:cache";
      const debug = createDebug("cache");

      debug.warn("warning: %s", "details");

      expect(consoleErrorSpy.mock.calls[0]).toHaveLength(2);
      expect(consoleErrorSpy.mock.calls[0][1]).toBe("details");
    });

    it("should not log when disabled", () => {
      delete process.env.DEBUG;
      const debug = createDebug("cache");

      debug.warn("warning message");

      expect(consoleErrorSpy).not.toHaveBeenCalled();
    });
  });

  describe("namespace matching", () => {
    it("should handle whitespace in DEBUG patterns", () => {
      process.env.DEBUG = "  agent-foreman:cache , agent-foreman:git  ";
      const debug = createDebug("cache");

      debug("test");

      expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
    });

    it("should match all namespaces with wildcard", () => {
      process.env.DEBUG = "agent-foreman:*";

      const namespaces = [
        "scanner",
        "detector",
        "cache",
        "discovery",
        "verifier",
        "agents",
        "git",
        "progress",
        "feature",
        "init",
      ] as const;

      namespaces.forEach((ns) => {
        const debug = createDebug(ns);
        debug("test");
      });

      expect(consoleErrorSpy).toHaveBeenCalledTimes(10);
    });
  });

  describe("pre-created loggers", () => {
    beforeEach(() => {
      process.env.DEBUG = "agent-foreman:*";
    });

    it("debugScanner should work", () => {
      debugScanner("scanner test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:scanner]");
    });

    it("debugDetector should work", () => {
      debugDetector("detector test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:detector]");
    });

    it("debugCache should work", () => {
      debugCache("cache test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:cache]");
    });

    it("debugDiscovery should work", () => {
      debugDiscovery("discovery test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:discovery]");
    });

    it("debugVerifier should work", () => {
      debugVerifier("verifier test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:verifier]");
    });

    it("debugAgents should work", () => {
      debugAgents("agents test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:agents]");
    });

    it("debugGit should work", () => {
      debugGit("git test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:git]");
    });

    it("debugProgress should work", () => {
      debugProgress("progress test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:progress]");
    });

    it("debugFeature should work", () => {
      debugFeature("feature test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:feature]");
    });

    it("debugInit should work", () => {
      debugInit("init test");
      expect(consoleErrorSpy.mock.calls[0][0]).toContain("[agent-foreman:init]");
    });
  });
});
