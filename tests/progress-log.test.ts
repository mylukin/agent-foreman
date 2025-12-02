/**
 * Tests for src/progress-log.ts - Progress log operations
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  formatLogEntry,
  parseLogEntry,
  appendProgressLog,
  readProgressLog,
  progressLogExists,
  getRecentEntries,
  createInitEntry,
  createStepEntry,
  createChangeEntry,
  createReplanEntry,
  formatEntriesForDisplay,
} from "../src/progress-log.js";
import type { ProgressLogEntry } from "../src/types.js";

describe("Progress Log Operations", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agent-foreman-test-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("formatLogEntry", () => {
    it("should format INIT entry correctly", () => {
      const entry: ProgressLogEntry = {
        type: "INIT",
        timestamp: "2024-01-15T10:00:00Z",
        goal: "Build auth system",
        note: "Initial setup",
        summary: "Created harness",
      };
      const formatted = formatLogEntry(entry);

      expect(formatted).toContain("INIT");
      expect(formatted).toContain("2024-01-15T10:00:00Z");
      expect(formatted).toContain('goal="Build auth system"');
      expect(formatted).toContain('note="Initial setup"');
      expect(formatted).toContain('summary="Created harness"');
    });

    it("should format STEP entry correctly", () => {
      const entry: ProgressLogEntry = {
        type: "STEP",
        timestamp: "2024-01-15T11:00:00Z",
        feature: "auth.login",
        status: "passing",
        tests: "npm test",
        summary: "Implemented login",
      };
      const formatted = formatLogEntry(entry);

      expect(formatted).toContain("STEP");
      expect(formatted).toContain("feature=auth.login");
      expect(formatted).toContain("status=passing");
      expect(formatted).toContain('tests="npm test"');
    });

    it("should format CHANGE entry correctly", () => {
      const entry: ProgressLogEntry = {
        type: "CHANGE",
        timestamp: "2024-01-15T12:00:00Z",
        feature: "auth.login",
        action: "mark_needs_review",
        reason: "Related feature changed",
        summary: "Status updated",
      };
      const formatted = formatLogEntry(entry);

      expect(formatted).toContain("CHANGE");
      expect(formatted).toContain("action=mark_needs_review");
      expect(formatted).toContain('reason="Related feature changed"');
    });

    it("should escape quotes in values", () => {
      const entry: ProgressLogEntry = {
        type: "INIT",
        timestamp: "2024-01-15T10:00:00Z",
        goal: 'Build "awesome" system',
        summary: "Test",
      };
      const formatted = formatLogEntry(entry);

      expect(formatted).toContain('goal="Build \\"awesome\\" system"');
    });

    it("should omit undefined fields", () => {
      const entry: ProgressLogEntry = {
        type: "STEP",
        timestamp: "2024-01-15T10:00:00Z",
        feature: "test",
        summary: "Test",
        // status, tests, etc. are undefined
      };
      const formatted = formatLogEntry(entry);

      expect(formatted).not.toContain("status=");
      expect(formatted).not.toContain("tests=");
    });
  });

  describe("parseLogEntry", () => {
    it("should parse INIT entry correctly", () => {
      const line =
        '2024-01-15T10:00:00Z INIT goal="Build auth" note="setup" summary="Created"';
      const parsed = parseLogEntry(line);

      expect(parsed).not.toBeNull();
      expect(parsed?.type).toBe("INIT");
      expect(parsed?.timestamp).toBe("2024-01-15T10:00:00Z");
      expect(parsed?.goal).toBe("Build auth");
      expect(parsed?.note).toBe("setup");
      expect(parsed?.summary).toBe("Created");
    });

    it("should parse STEP entry correctly", () => {
      const line =
        '2024-01-15T11:00:00Z STEP feature=auth.login status=passing tests="npm test" summary="Done"';
      const parsed = parseLogEntry(line);

      expect(parsed?.type).toBe("STEP");
      expect(parsed?.feature).toBe("auth.login");
      expect(parsed?.status).toBe("passing");
      expect(parsed?.tests).toBe("npm test");
    });

    it("should parse CHANGE entry correctly", () => {
      const line =
        '2024-01-15T12:00:00Z CHANGE feature=auth.login action=mark_needs_review reason="Impact" summary="Updated"';
      const parsed = parseLogEntry(line);

      expect(parsed?.type).toBe("CHANGE");
      expect(parsed?.action).toBe("mark_needs_review");
      expect(parsed?.reason).toBe("Impact");
    });

    it("should parse REPLAN entry correctly", () => {
      const line = '2024-01-15T13:00:00Z REPLAN note="Major change" summary="Replanned"';
      const parsed = parseLogEntry(line);

      expect(parsed?.type).toBe("REPLAN");
      expect(parsed?.note).toBe("Major change");
    });

    it("should return null for empty line", () => {
      expect(parseLogEntry("")).toBeNull();
      expect(parseLogEntry("   ")).toBeNull();
    });

    it("should return null for invalid format", () => {
      expect(parseLogEntry("INVALID 2024-01-15")).toBeNull();
      expect(parseLogEntry("random text")).toBeNull();
    });

    it("should handle escaped quotes", () => {
      const line = '2024-01-15T10:00:00Z INIT goal="Build \\"awesome\\" app" summary="Test"';
      const parsed = parseLogEntry(line);

      expect(parsed?.goal).toBe('Build "awesome" app');
    });
  });

  describe("appendProgressLog / readProgressLog", () => {
    it("should append and read entries", async () => {
      const entry = createInitEntry("Test goal", "Initial");
      await appendProgressLog(tempDir, entry);

      const entries = await readProgressLog(tempDir);
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe("INIT");
      expect(entries[0].goal).toBe("Test goal");
    });

    it("should append multiple entries", async () => {
      await appendProgressLog(tempDir, createInitEntry("Goal", "Note"));
      await appendProgressLog(tempDir, createStepEntry("f1", "passing", "test", "Done"));
      await appendProgressLog(tempDir, createChangeEntry("f1", "update", "reason"));

      const entries = await readProgressLog(tempDir);
      expect(entries).toHaveLength(3);
      expect(entries[0].type).toBe("INIT");
      expect(entries[1].type).toBe("STEP");
      expect(entries[2].type).toBe("CHANGE");
    });

    it("should return empty array for non-existent file", async () => {
      const entries = await readProgressLog(tempDir);
      expect(entries).toHaveLength(0);
    });

    it("should create ai directory if not exists", async () => {
      await appendProgressLog(tempDir, createInitEntry("Goal", "Note"));

      const aiDir = path.join(tempDir, "ai");
      const stat = await fs.stat(aiDir);
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("progressLogExists", () => {
    it("should return false for non-existent file", async () => {
      const exists = await progressLogExists(tempDir);
      expect(exists).toBe(false);
    });

    it("should return true for existing file", async () => {
      await appendProgressLog(tempDir, createInitEntry("Goal", "Note"));

      const exists = await progressLogExists(tempDir);
      expect(exists).toBe(true);
    });
  });

  describe("getRecentEntries", () => {
    it("should return last N entries", async () => {
      for (let i = 0; i < 10; i++) {
        await appendProgressLog(tempDir, createStepEntry(`f${i}`, "passing", "test", `Step ${i}`));
      }

      const recent = await getRecentEntries(tempDir, 3);
      expect(recent).toHaveLength(3);
      expect(recent[0].summary).toBe("Step 7");
      expect(recent[2].summary).toBe("Step 9");
    });

    it("should return all entries if less than N", async () => {
      await appendProgressLog(tempDir, createInitEntry("Goal", "Note"));
      await appendProgressLog(tempDir, createStepEntry("f1", "passing", "test", "Done"));

      const recent = await getRecentEntries(tempDir, 5);
      expect(recent).toHaveLength(2);
    });

    it("should return empty array for non-existent file", async () => {
      const recent = await getRecentEntries(tempDir, 5);
      expect(recent).toHaveLength(0);
    });
  });

  describe("Entry Creators", () => {
    describe("createInitEntry", () => {
      it("should create valid INIT entry", () => {
        const entry = createInitEntry("Build API", "Initial setup");

        expect(entry.type).toBe("INIT");
        expect(entry.goal).toBe("Build API");
        expect(entry.note).toBe("Initial setup");
        expect(entry.summary).toBe("Created long-task harness");
        expect(entry.timestamp).toBeDefined();
      });
    });

    describe("createStepEntry", () => {
      it("should create valid STEP entry", () => {
        const entry = createStepEntry("auth.login", "passing", "npm test", "Login done");

        expect(entry.type).toBe("STEP");
        expect(entry.feature).toBe("auth.login");
        expect(entry.status).toBe("passing");
        expect(entry.tests).toBe("npm test");
        expect(entry.summary).toBe("Login done");
      });
    });

    describe("createChangeEntry", () => {
      it("should create valid CHANGE entry", () => {
        const entry = createChangeEntry("auth.login", "mark_needs_review", "Impact from logout");

        expect(entry.type).toBe("CHANGE");
        expect(entry.feature).toBe("auth.login");
        expect(entry.action).toBe("mark_needs_review");
        expect(entry.reason).toBe("Impact from logout");
        expect(entry.summary).toContain("auth.login");
      });
    });

    describe("createReplanEntry", () => {
      it("should create valid REPLAN entry", () => {
        const entry = createReplanEntry("Major direction change", "Pivoting to B2B");

        expect(entry.type).toBe("REPLAN");
        expect(entry.summary).toBe("Major direction change");
        expect(entry.note).toBe("Pivoting to B2B");
      });
    });
  });

  describe("formatEntriesForDisplay", () => {
    it("should format entries for human reading", () => {
      const entries: ProgressLogEntry[] = [
        {
          type: "INIT",
          timestamp: "2024-01-15T10:00:00Z",
          goal: "Test",
          summary: "Created harness",
        },
        {
          type: "STEP",
          timestamp: "2024-01-15T11:00:00Z",
          feature: "auth.login",
          status: "passing",
          summary: "Login done",
        },
      ];

      const formatted = formatEntriesForDisplay(entries);

      expect(formatted).toContain("[INIT]");
      expect(formatted).toContain("[STEP]");
      expect(formatted).toContain("2024-01-15T10:00:00Z");
      expect(formatted).toContain("Feature: auth.login");
      expect(formatted).toContain("Status: passing");
    });

    it("should handle empty array", () => {
      const formatted = formatEntriesForDisplay([]);
      expect(formatted).toBe("");
    });
  });
});
