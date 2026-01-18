/**
 * Tests for log-collector.ts
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { tmpdir } from "node:os";

import {
  collectLogs,
  getDefaultLogPath,
  hasLogsAvailable,
} from "../../src/strategies/behavior-strategy/log-collector.js";

describe("log-collector", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), "log-collector-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("collectLogs", () => {
    describe("file source", () => {
      it("should return error when path is not provided", async () => {
        const result = await collectLogs({
          source: "file",
          path: undefined,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("File path is required");
        expect(result.source).toBe("file");
      });

      it("should return error when file does not exist", async () => {
        const nonExistentPath = path.join(testDir, "non-existent.log");
        const result = await collectLogs({
          source: "file",
          path: nonExistentPath,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Log file not found");
        expect(result.path).toBe(nonExistentPath);
      });

      it("should read file content successfully", async () => {
        const logPath = path.join(testDir, "test.log");
        const content = "Line 1\nLine 2\nLine 3";
        await fs.writeFile(logPath, content);

        const result = await collectLogs({
          source: "file",
          path: logPath,
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe(content);
        expect(result.lineCount).toBe(3);
        expect(result.path).toBe(logPath);
      });

      it("should apply maxLines limit", async () => {
        const logPath = path.join(testDir, "test.log");
        const content = "Line 1\nLine 2\nLine 3\nLine 4\nLine 5";
        await fs.writeFile(logPath, content);

        const result = await collectLogs({
          source: "file",
          path: logPath,
          maxLines: 3,
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe("Line 1\nLine 2\nLine 3");
        expect(result.lineCount).toBe(3);
      });

      it("should handle file with custom encoding", async () => {
        const logPath = path.join(testDir, "test.log");
        const content = "Test content";
        await fs.writeFile(logPath, content, "utf-8");

        const result = await collectLogs({
          source: "file",
          path: logPath,
          encoding: "utf-8",
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe(content);
      });

      it("should handle read error gracefully", async () => {
        const logPath = path.join(testDir, "unreadable");
        // Create a directory instead of a file to cause a read error
        await fs.mkdir(logPath);

        const result = await collectLogs({
          source: "file",
          path: logPath,
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Failed to read log file");
      });
    });

    describe("session source", () => {
      it("should return empty content for session source", async () => {
        const result = await collectLogs({
          source: "session",
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe("");
        expect(result.source).toBe("session");
        expect(result.lineCount).toBe(0);
      });
    });

    describe("stdin source", () => {
      it("should return empty content for stdin source", async () => {
        const result = await collectLogs({
          source: "stdin",
        });

        expect(result.success).toBe(true);
        expect(result.content).toBe("");
        expect(result.source).toBe("stdin");
        expect(result.lineCount).toBe(0);
      });
    });

    describe("unknown source", () => {
      it("should return error for unknown source", async () => {
        const result = await collectLogs({
          source: "unknown" as "file",
        });

        expect(result.success).toBe(false);
        expect(result.error).toContain("Unknown log source");
      });
    });
  });

  describe("getDefaultLogPath", () => {
    it("should return correct default log path", () => {
      const cwd = "/project/root";
      const logPath = getDefaultLogPath(cwd);

      expect(logPath).toBe("/project/root/ai/progress.log");
    });

    it("should handle cwd with trailing slash", () => {
      const cwd = "/project/root/";
      const logPath = getDefaultLogPath(cwd);

      expect(logPath).toBe("/project/root//ai/progress.log");
    });
  });

  describe("hasLogsAvailable", () => {
    it("should return true when file exists", async () => {
      const logPath = path.join(testDir, "existing.log");
      await fs.writeFile(logPath, "content");

      const result = hasLogsAvailable("file", logPath);

      expect(result).toBe(true);
    });

    it("should return false when file does not exist", () => {
      const nonExistentPath = path.join(testDir, "non-existent.log");

      const result = hasLogsAvailable("file", nonExistentPath);

      expect(result).toBe(false);
    });

    it("should return false when file path is not provided", () => {
      const result = hasLogsAvailable("file", undefined);

      expect(result).toBe(false);
    });

    it("should return true for session source", () => {
      const result = hasLogsAvailable("session");

      expect(result).toBe(true);
    });

    it("should return true for stdin source", () => {
      const result = hasLogsAvailable("stdin");

      expect(result).toBe(true);
    });

    it("should return false for unknown source", () => {
      const result = hasLogsAvailable("unknown" as "file");

      expect(result).toBe(false);
    });
  });
});
