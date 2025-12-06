/**
 * Integration tests for combined AI merge optimization
 * Tests the combined merge flow with real file operations
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

describe("Combined AI Merge Integration", () => {
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

  describe("Combined merge mode", () => {
    it("should use combined AI call when both files exist in merge mode", async () => {
      // Create existing files
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fs.writeFile(path.join(testDir, "ai/init.sh"), `#!/usr/bin/env bash
bootstrap() {
  pnpm install
}`);
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# My Project
Custom content here.`);

      // Mock combined merge response
      const combinedResponse = JSON.stringify({
        initScript: `#!/usr/bin/env bash
bootstrap() {
  pnpm install
}
check() {
  npm test
}`,
        claudeMd: `# My Project
Custom content here.

## Long-Task Harness
Harness section added.`,
      });

      mockCallAnyAvailableAgent.mockResolvedValueOnce({ success: true, output: combinedResponse });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Verify combined call was made (single call for both)
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);
      const callArg = mockCallAnyAvailableAgent.mock.calls[0][0];
      expect(callArg).toContain("Task 1: Merge ai/init.sh");
      expect(callArg).toContain("Task 2: Merge CLAUDE.md");

      // Verify both files were written
      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("pnpm install");
      expect(initScript).toContain("check()");

      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("Custom content");
      expect(claudeMd).toContain("Long-Task Harness");
    });

    it("should fallback to individual merges when combined merge returns invalid JSON", async () => {
      // Create existing files
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fs.writeFile(path.join(testDir, "ai/init.sh"), `#!/usr/bin/env bash
bootstrap() {
  yarn install
}`);
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# Existing Project`);

      // First call (combined) returns invalid JSON, subsequent calls succeed individually
      let callCount = 0;
      mockCallAnyAvailableAgent.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // Combined call fails with invalid JSON
          return Promise.resolve({ success: true, output: "This is not valid JSON" });
        } else if (callCount === 2) {
          // Individual init.sh merge
          return Promise.resolve({
            success: true,
            output: `#!/usr/bin/env bash
bootstrap() {
  yarn install
}
check() {
  yarn test
}`,
          });
        } else {
          // Individual CLAUDE.md merge
          return Promise.resolve({
            success: true,
            output: `# Existing Project

## Long-Task Harness
Added via fallback.`,
          });
        }
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Should have made 3 calls: 1 combined (failed) + 2 individual
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(3);

      // Verify files were still written via fallback
      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("yarn install");

      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("Existing Project");
      expect(claudeMd).toContain("Long-Task Harness");
    });

    it("should fallback when combined merge returns partial results (missing initScript)", async () => {
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fs.writeFile(path.join(testDir, "ai/init.sh"), `#!/usr/bin/env bash
bootstrap() { npm install; }`);
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# Project`);

      // Combined call returns only claudeMd (missing valid initScript)
      let callCount = 0;
      mockCallAnyAvailableAgent.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            success: true,
            output: JSON.stringify({
              initScript: "echo not a valid script", // Invalid - no shebang
              claudeMd: "# Merged content",
            }),
          });
        }
        // Fallback calls
        return Promise.resolve({ success: true, output: `#!/usr/bin/env bash
bootstrap() { npm install; }` });
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Should fallback to individual merges
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(3);
    });

    it("should not use combined merge when only init.sh exists", async () => {
      // Only create init.sh, not CLAUDE.md
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fs.writeFile(path.join(testDir, "ai/init.sh"), `#!/usr/bin/env bash
bootstrap() { npm install; }`);

      mockCallAnyAvailableAgent.mockResolvedValue({
        success: true,
        output: `#!/usr/bin/env bash
bootstrap() { npm install; }
check() { npm test; }`,
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Should use individual merge for init.sh only, then create new CLAUDE.md
      // First call is for init.sh merge, no call for CLAUDE.md (new file created directly)
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);
      const callArg = mockCallAnyAvailableAgent.mock.calls[0][0];
      expect(callArg).not.toContain("Task 1:");
      expect(callArg).not.toContain("Task 2:");
    });

    it("should not use combined merge when only CLAUDE.md exists", async () => {
      // Only create CLAUDE.md, not init.sh
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# My Project`);

      mockCallAnyAvailableAgent.mockResolvedValue({
        success: true,
        output: `# My Project

## Long-Task Harness
Content here.`,
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Should use individual merge for CLAUDE.md only
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);
      const callArg = mockCallAnyAvailableAgent.mock.calls[0][0];
      expect(callArg).not.toContain("Task 1:");
      expect(callArg).not.toContain("Task 2:");
    });

    it("should not use combined merge in new mode", async () => {
      // Create both files
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      await fs.writeFile(path.join(testDir, "ai/init.sh"), `#!/usr/bin/env bash
bootstrap() { npm install; }`);
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), `# My Project`);

      // In new mode, init.sh is overwritten directly (no AI merge)
      // But CLAUDE.md still gets AI merge for existing content
      mockCallAnyAvailableAgent.mockResolvedValue({
        success: true,
        output: `# My Project

## Long-Task Harness
Merged content.`,
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      // In new mode, only CLAUDE.md merge is called (init.sh is overwritten directly)
      expect(mockCallAnyAvailableAgent).toHaveBeenCalledTimes(1);
      const callArg = mockCallAnyAvailableAgent.mock.calls[0][0];
      // Should NOT be a combined merge prompt
      expect(callArg).not.toContain("Task 1:");
      expect(callArg).not.toContain("Task 2:");
      // Should be CLAUDE.md merge prompt
      expect(callArg).toContain("CLAUDE.md");

      // New init.sh should be written (not merged)
      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("#!/usr/bin/env bash");
      expect(initScript).toContain("npm install"); // Template command, not user's
    });
  });
});
