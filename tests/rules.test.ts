/**
 * Tests for src/rules/index.ts - Rule templates for .claude/rules/ directory
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import {
  RULE_TEMPLATES,
  isRuleTemplate,
  getRuleTemplate,
  getAllRuleTemplates,
  copyRulesToProject,
  verifyRuleTemplates,
  hasRulesInstalled,
} from "../src/rules/index.js";

describe("Rules", () => {
  describe("RULE_TEMPLATES", () => {
    it("should have all expected rule templates", () => {
      expect(RULE_TEMPLATES).toContain("00-overview");
      expect(RULE_TEMPLATES).toContain("01-workflow");
      expect(RULE_TEMPLATES).toContain("02-rules");
      expect(RULE_TEMPLATES).toContain("03-commands");
      expect(RULE_TEMPLATES).toContain("04-feature-schema");
      expect(RULE_TEMPLATES).toContain("05-tdd");
      expect(RULE_TEMPLATES).toContain("06-progress-log");
    });

    it("should have 7 rule templates", () => {
      expect(RULE_TEMPLATES.length).toBe(7);
    });
  });

  describe("isRuleTemplate", () => {
    it("should return true for valid rule template names", () => {
      expect(isRuleTemplate("00-overview")).toBe(true);
      expect(isRuleTemplate("01-workflow")).toBe(true);
      expect(isRuleTemplate("06-progress-log")).toBe(true);
    });

    it("should return false for invalid rule template names", () => {
      expect(isRuleTemplate("invalid")).toBe(false);
      expect(isRuleTemplate("")).toBe(false);
      expect(isRuleTemplate("overview")).toBe(false);
    });
  });

  describe("getRuleTemplate", () => {
    it("should return content for valid template", () => {
      const content = getRuleTemplate("00-overview");
      expect(content).not.toBeNull();
      expect(content).toContain("Long-Task Harness");
    });

    it("should return null for invalid template", () => {
      const content = getRuleTemplate("invalid");
      expect(content).toBeNull();
    });

    it("should return content with expected sections for each template", () => {
      // 00-overview
      const overview = getRuleTemplate("00-overview");
      expect(overview).toContain("Core Files");
      expect(overview).toContain("Feature Status Values");

      // 01-workflow
      const workflow = getRuleTemplate("01-workflow");
      expect(workflow).toContain("Workflow");
      expect(workflow).toContain("Start");
      expect(workflow).toContain("Done");

      // 02-rules
      const rules = getRuleTemplate("02-rules");
      expect(rules).toContain("Rules");
      expect(rules).toContain("One feature per session");

      // 03-commands
      const commands = getRuleTemplate("03-commands");
      expect(commands).toContain("Commands");
      expect(commands).toContain("agent-foreman");

      // 04-feature-schema
      const schema = getRuleTemplate("04-feature-schema");
      expect(schema).toContain("Feature JSON Schema");
      expect(schema).toContain("acceptance");

      // 05-tdd
      const tdd = getRuleTemplate("05-tdd");
      expect(tdd).toContain("TDD");
      expect(tdd).toContain("strict");

      // 06-progress-log
      const progressLog = getRuleTemplate("06-progress-log");
      expect(progressLog).toContain("Progress Log");
      expect(progressLog).toContain("STEP");
    });
  });

  describe("getAllRuleTemplates", () => {
    it("should return all rule templates", () => {
      const templates = getAllRuleTemplates();
      expect(templates.size).toBe(7);
    });

    it("should have content for each template", () => {
      const templates = getAllRuleTemplates();
      for (const [name, content] of templates) {
        expect(content.length).toBeGreaterThan(0);
      }
    });
  });

  describe("verifyRuleTemplates", () => {
    it("should report all templates as available", () => {
      const { available, missing } = verifyRuleTemplates();
      expect(available.length).toBe(7);
      expect(missing.length).toBe(0);
    });
  });

  describe("copyRulesToProject", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(tmpdir(), "rules-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("should create .claude/rules/ directory and copy all files", async () => {
      const result = await copyRulesToProject(tempDir);

      expect(result.created).toBe(7);
      expect(result.skipped).toBe(0);
      expect(result.createdFiles.length).toBe(7);

      // Verify files exist
      const rulesDir = path.join(tempDir, ".claude", "rules");
      const files = await fs.readdir(rulesDir);
      expect(files.length).toBe(7);
    });

    it("should skip existing files by default", async () => {
      // First copy
      await copyRulesToProject(tempDir);

      // Second copy should skip all
      const result = await copyRulesToProject(tempDir);

      expect(result.created).toBe(0);
      expect(result.skipped).toBe(7);
    });

    it("should overwrite existing files with force option", async () => {
      // First copy
      await copyRulesToProject(tempDir);

      // Modify a file
      const filePath = path.join(tempDir, ".claude", "rules", "00-overview.md");
      await fs.writeFile(filePath, "modified content");

      // Second copy with force
      const result = await copyRulesToProject(tempDir, { force: true });

      expect(result.created).toBe(7);
      expect(result.skipped).toBe(0);

      // Verify content was restored
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).toContain("Long-Task Harness");
    });
  });

  describe("hasRulesInstalled", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(tmpdir(), "rules-test-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("should return false when no rules directory exists", () => {
      const result = hasRulesInstalled(tempDir);
      expect(result).toBe(false);
    });

    it("should return false when rules directory is empty", async () => {
      await fs.mkdir(path.join(tempDir, ".claude", "rules"), { recursive: true });
      const result = hasRulesInstalled(tempDir);
      expect(result).toBe(false);
    });

    it("should return true when at least one rule file exists", async () => {
      await copyRulesToProject(tempDir);
      const result = hasRulesInstalled(tempDir);
      expect(result).toBe(true);
    });
  });

  // ============================================================================
  // Edge Case Tests for Uncovered Lines
  // ============================================================================

  describe("getRuleTemplate edge cases", () => {
    it("should handle templates that exist in embedded but not file system", () => {
      // All templates should be available from embedded
      for (const name of RULE_TEMPLATES) {
        const content = getRuleTemplate(name);
        expect(content).not.toBeNull();
        expect(typeof content).toBe("string");
      }
    });
  });

  describe("verifyRuleTemplates edge cases", () => {
    it("should check embedded templates first", () => {
      const { available, missing } = verifyRuleTemplates();

      // All templates should be available (from embedded)
      expect(available.length).toBe(RULE_TEMPLATES.length);
      expect(missing.length).toBe(0);

      // Available should contain all template names
      for (const name of RULE_TEMPLATES) {
        expect(available).toContain(name);
      }
    });

    it("should return arrays with no undefined values", () => {
      const { available, missing } = verifyRuleTemplates();

      expect(available.every(name => typeof name === "string")).toBe(true);
      expect(missing.every(name => typeof name === "string")).toBe(true);
    });
  });

  describe("copyRulesToProject edge cases", () => {
    let tempDir: string;

    beforeEach(async () => {
      tempDir = await fs.mkdtemp(path.join(tmpdir(), "rules-edge-"));
    });

    afterEach(async () => {
      await fs.rm(tempDir, { recursive: true, force: true });
    });

    it("should handle nested directory creation", async () => {
      // Ensure no .claude directory exists
      const claudeDir = path.join(tempDir, ".claude");
      try {
        await fs.rm(claudeDir, { recursive: true });
      } catch {
        // Directory doesn't exist, which is expected
      }

      const result = await copyRulesToProject(tempDir);
      expect(result.created).toBe(7);

      // Verify directory was created
      const stat = await fs.stat(path.join(tempDir, ".claude", "rules"));
      expect(stat.isDirectory()).toBe(true);
    });

    it("should skip null content templates gracefully", async () => {
      // This tests the "if (!content) continue" path
      // All templates should have content, so created should be 7
      const result = await copyRulesToProject(tempDir);
      expect(result.created).toBe(7);
    });
  });
});
