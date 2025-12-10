/**
 * Integration tests for init harness file generation
 * Tests the init flow with real file operations
 *
 * NOTE: The CLAUDE.md generation has been changed from AI merge to static rules file copy.
 * CLAUDE.md now only contains the project goal, while rules are stored in .claude/rules/
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";

// Use vi.hoisted to create mock functions that can be used in vi.mock
const { mockCallAnyAvailableAgent, mockPrintAgentStatus } = vi.hoisted(() => ({
  mockCallAnyAvailableAgent: vi.fn(),
  mockPrintAgentStatus: vi.fn(),
}));

// Mock the agents module
vi.mock("../../src/agents.js", () => ({
  callAnyAvailableAgent: mockCallAnyAvailableAgent,
  printAgentStatus: mockPrintAgentStatus,
}));

// Mock capabilities module (the one actually used by init-helpers.ts)
const { mockDetectCapabilities } = vi.hoisted(() => ({
  mockDetectCapabilities: vi.fn(),
}));

vi.mock("../../src/capabilities/index.js", () => ({
  detectCapabilities: mockDetectCapabilities,
}));

import { generateHarnessFiles } from "../../src/init-helpers.js";
import type { FeatureList } from "../../src/types.js";

describe("Init Harness Files Generation", () => {
  let testDir: string;

  const mockSurvey = {
    techStack: { language: "typescript" },
    commands: {
      install: "npm install",
      dev: "npm run dev",
      test: "npm test",
    },
    features: [],
    modules: [],
    structure: { entryPoints: [], sourceDirectories: [], testDirectories: [] },
  };

  const mockFeatureList: FeatureList = {
    features: [],
    metadata: {
      projectGoal: "Test project",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: "1.0.0",
    },
  };

  const defaultCapabilities = {
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
    source: "ai" as const,
    confidence: 0.9,
    languages: ["typescript"],
    detectedAt: new Date().toISOString(),
  };

  beforeEach(async () => {
    testDir = path.join(tmpdir(), `init-merge-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
    vi.clearAllMocks();
    mockDetectCapabilities.mockResolvedValue(defaultCapabilities);
  });

  afterEach(async () => {
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("AI merge for init.sh only", () => {
    it("should use AI merge for init.sh when it exists in merge mode", async () => {
      // Create existing init.sh
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fs.writeFile(path.join(testDir, "ai/init.sh"), `#!/usr/bin/env bash
bootstrap() {
  pnpm install
}`);

      // Mock AI merge response for init.sh
      mockCallAnyAvailableAgent.mockResolvedValueOnce({
        success: true,
        output: `#!/usr/bin/env bash
bootstrap() {
  pnpm install
}
check() {
  npm test
}`,
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Verify AI was called for init.sh merge
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);
      const callArg = mockCallAnyAvailableAgent.mock.calls[0][0];
      expect(callArg).toContain("ai/init.sh");

      // Verify init.sh was merged
      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("pnpm install");
      expect(initScript).toContain("check()");
    });

    it("should NOT use AI for CLAUDE.md - uses static rules instead", async () => {
      // Create existing CLAUDE.md
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# My Project
Custom content here.`);

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Verify AI was NOT called (no init.sh to merge, CLAUDE.md uses static rules)
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(0);

      // Verify CLAUDE.md was preserved (legacy content kept)
      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("Custom content here");

      // Verify rules were copied to .claude/rules/
      const rulesDir = path.join(testDir, ".claude", "rules");
      const ruleFiles = await fs.readdir(rulesDir);
      expect(ruleFiles.length).toBe(7);
    });
  });

  describe("Static rules file generation", () => {
    it("should create .claude/rules/ directory with all rule files", async () => {
      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      // Verify .claude/rules/ was created
      const rulesDir = path.join(testDir, ".claude", "rules");
      const stat = await fs.stat(rulesDir);
      expect(stat.isDirectory()).toBe(true);

      // Verify all 7 rule files exist
      const ruleFiles = await fs.readdir(rulesDir);
      expect(ruleFiles).toContain("00-overview.md");
      expect(ruleFiles).toContain("01-workflow.md");
      expect(ruleFiles).toContain("02-rules.md");
      expect(ruleFiles).toContain("03-commands.md");
      expect(ruleFiles).toContain("04-feature-schema.md");
      expect(ruleFiles).toContain("05-tdd.md");
      expect(ruleFiles).toContain("06-progress-log.md");
    });

    it("should create minimal CLAUDE.md with just project goal", async () => {
      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("# Project Instructions");
      expect(claudeMd).toContain("## Project Goal");
      expect(claudeMd).toContain("Test goal");
      expect(claudeMd).toContain(".claude/rules/");
    });

    it("should skip existing rule files in merge mode", async () => {
      // Create a custom rule file
      await fs.mkdir(path.join(testDir, ".claude", "rules"), { recursive: true });
      await fs.writeFile(
        path.join(testDir, ".claude", "rules", "00-overview.md"),
        "# Custom Overview\nMy custom content"
      );

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Verify custom content was preserved
      const overview = await fs.readFile(path.join(testDir, ".claude", "rules", "00-overview.md"), "utf-8");
      expect(overview).toContain("My custom content");
    });

    it("should overwrite rule files in new mode (force)", async () => {
      // Create a custom rule file
      await fs.mkdir(path.join(testDir, ".claude", "rules"), { recursive: true });
      await fs.writeFile(
        path.join(testDir, ".claude", "rules", "00-overview.md"),
        "# Custom Overview\nMy custom content"
      );

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      // Verify standard content replaced custom
      const overview = await fs.readFile(path.join(testDir, ".claude", "rules", "00-overview.md"), "utf-8");
      expect(overview).toContain("Long-Task Harness");
      expect(overview).not.toContain("My custom content");
    });
  });

  describe("Legacy CLAUDE.md handling", () => {
    it("should preserve existing CLAUDE.md with harness section (legacy)", async () => {
      // Create legacy CLAUDE.md with harness section
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# Project Instructions

## Long-Task Harness
Old harness content here.

Custom content below.`);

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Verify legacy content was preserved
      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("## Long-Task Harness");
      expect(claudeMd).toContain("Custom content below");

      // Verify rules were still created
      const rulesDir = path.join(testDir, ".claude", "rules");
      const ruleFiles = await fs.readdir(rulesDir);
      expect(ruleFiles.length).toBe(7);
    });

    it("should add project goal to CLAUDE.md if missing", async () => {
      // Create CLAUDE.md without project goal
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# My Project

Some custom content.`);

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Verify project goal was added
      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("Some custom content");
      expect(claudeMd).toContain("## Project Goal");
      expect(claudeMd).toContain("Test goal");
    });
  });
});
