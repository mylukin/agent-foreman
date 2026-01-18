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
  hasRulesInstalled,
  verifyRuleTemplates,
  type RuleTemplateName,
} from "../src/rules/index.js";

describe("Rules Module", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await fs.mkdtemp(path.join(tmpdir(), "rules-test-"));
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("RULE_TEMPLATES", () => {
    it("should contain 9 rule templates", () => {
      expect(RULE_TEMPLATES).toHaveLength(9);
    });

    it("should have templates in correct order", () => {
      expect(RULE_TEMPLATES[0]).toBe("00-overview");
      expect(RULE_TEMPLATES[1]).toBe("01-workflow");
      expect(RULE_TEMPLATES[2]).toBe("02-rules");
      expect(RULE_TEMPLATES[3]).toBe("03-commands");
      expect(RULE_TEMPLATES[4]).toBe("04-feature-schema");
      expect(RULE_TEMPLATES[5]).toBe("05-tdd");
      expect(RULE_TEMPLATES[6]).toBe("06-progress-log");
      expect(RULE_TEMPLATES[7]).toBe("07-strict-enforcement");
    });
  });

  describe("isRuleTemplate", () => {
    it("should return true for valid template names", () => {
      expect(isRuleTemplate("00-overview")).toBe(true);
      expect(isRuleTemplate("01-workflow")).toBe(true);
      expect(isRuleTemplate("06-progress-log")).toBe(true);
    });

    it("should return false for invalid template names", () => {
      expect(isRuleTemplate("invalid")).toBe(false);
      expect(isRuleTemplate("08-nonexistent")).toBe(false);
      expect(isRuleTemplate("")).toBe(false);
    });
  });

  describe("getRuleTemplate", () => {
    it("should return template content for valid names", () => {
      const content = getRuleTemplate("00-overview");
      expect(content).not.toBeNull();
      expect(content).toContain("Long-Task Harness");
    });

    it("should return null for invalid names", () => {
      expect(getRuleTemplate("invalid")).toBeNull();
    });
  });

  describe("getAllRuleTemplates", () => {
    it("should return all templates as a map", () => {
      const templates = getAllRuleTemplates();
      expect(templates.size).toBe(9);

      for (const name of RULE_TEMPLATES) {
        expect(templates.has(name)).toBe(true);
        expect(templates.get(name)).not.toBeNull();
      }
    });
  });

  describe("copyRulesToProject", () => {
    it("should copy all rule templates to project", async () => {
      const result = await copyRulesToProject(testDir);

      expect(result.created).toBe(9);
      expect(result.skipped).toBe(0);
      expect(result.createdFiles).toHaveLength(9);

      // Verify files exist
      const rulesDir = path.join(testDir, ".claude", "rules");
      for (const name of RULE_TEMPLATES) {
        const filePath = path.join(rulesDir, `${name}.md`);
        const exists = await fs
          .stat(filePath)
          .then(() => true)
          .catch(() => false);
        expect(exists).toBe(true);
      }
    });

    it("should skip existing files without force", async () => {
      // First copy
      await copyRulesToProject(testDir);

      // Second copy should skip
      const result = await copyRulesToProject(testDir);
      expect(result.created).toBe(0);
      expect(result.skipped).toBe(9);
    });

    it("should overwrite with force option", async () => {
      // First copy
      await copyRulesToProject(testDir);

      // Modify a file
      const rulesDir = path.join(testDir, ".claude", "rules");
      const filePath = path.join(rulesDir, "00-overview.md");
      await fs.writeFile(filePath, "MODIFIED");

      // Force copy should overwrite
      const result = await copyRulesToProject(testDir, { force: true });
      expect(result.created).toBe(9);
      expect(result.skipped).toBe(0);

      // Verify file was overwritten
      const content = await fs.readFile(filePath, "utf-8");
      expect(content).not.toBe("MODIFIED");
      expect(content).toContain("Long-Task Harness");
    });
  });

  describe("hasRulesInstalled", () => {
    it("should return false for empty directory", () => {
      expect(hasRulesInstalled(testDir)).toBe(false);
    });

    it("should return true after rules are copied", async () => {
      await copyRulesToProject(testDir);
      expect(hasRulesInstalled(testDir)).toBe(true);
    });

    it("should return true if at least one rule file exists", async () => {
      const rulesDir = path.join(testDir, ".claude", "rules");
      await fs.mkdir(rulesDir, { recursive: true });
      await fs.writeFile(path.join(rulesDir, "00-overview.md"), "test");

      expect(hasRulesInstalled(testDir)).toBe(true);
    });
  });

  describe("verifyRuleTemplates", () => {
    it("should report all templates as available", () => {
      const result = verifyRuleTemplates();
      expect(result.available).toHaveLength(9);
      expect(result.missing).toHaveLength(0);
    });
  });
});
