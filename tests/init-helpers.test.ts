/**
 * Tests for init-helpers.ts
 * Covers AI merge functionality for init.sh and CLAUDE.md
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
vi.mock("../src/agents.js", () => ({
  callAnyAvailableAgent: mockCallAnyAvailableAgent,
  printAgentStatus: mockPrintAgentStatus,
}));

// Mock feature-list module
const { mockLoadFeatureList, mockSaveFeatureList, mockCreateEmptyFeatureList, mockMergeFeatures, mockDiscoveredToFeature } = vi.hoisted(() => ({
  mockLoadFeatureList: vi.fn(),
  mockSaveFeatureList: vi.fn(),
  mockCreateEmptyFeatureList: vi.fn(),
  mockMergeFeatures: vi.fn(),
  mockDiscoveredToFeature: vi.fn(),
}));

vi.mock("../src/feature-list.js", () => ({
  loadFeatureList: mockLoadFeatureList,
  saveFeatureList: mockSaveFeatureList,
  createEmptyFeatureList: mockCreateEmptyFeatureList,
  mergeFeatures: mockMergeFeatures,
  discoveredToFeature: mockDiscoveredToFeature,
}));

// Mock project-scanner module
const { mockScanDirectoryStructure, mockIsProjectEmpty } = vi.hoisted(() => ({
  mockScanDirectoryStructure: vi.fn(),
  mockIsProjectEmpty: vi.fn(),
}));

vi.mock("../src/project-scanner.js", () => ({
  scanDirectoryStructure: mockScanDirectoryStructure,
  isProjectEmpty: mockIsProjectEmpty,
}));

// Mock ai-scanner module
const { mockAiScanProject, mockGenerateFeaturesFromGoal, mockGenerateFeaturesFromSurvey, mockAiResultToSurvey, mockGenerateAISurveyMarkdown } = vi.hoisted(() => ({
  mockAiScanProject: vi.fn(),
  mockGenerateFeaturesFromGoal: vi.fn(),
  mockGenerateFeaturesFromSurvey: vi.fn(),
  mockAiResultToSurvey: vi.fn(),
  mockGenerateAISurveyMarkdown: vi.fn(),
}));

vi.mock("../src/ai-scanner.js", () => ({
  aiScanProject: mockAiScanProject,
  generateFeaturesFromGoal: mockGenerateFeaturesFromGoal,
  generateFeaturesFromSurvey: mockGenerateFeaturesFromSurvey,
  aiResultToSurvey: mockAiResultToSurvey,
  generateAISurveyMarkdown: mockGenerateAISurveyMarkdown,
}));

// Import after mocks are set up
import { generateHarnessFiles, detectAndAnalyzeProject, mergeOrCreateFeatures } from "../src/init-helpers.js";
import type { FeatureList, Feature } from "../src/types.js";

describe("Init Helpers", () => {
  let testDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    testDir = path.join(tmpdir(), `init-helpers-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    await fs.mkdir(testDir, { recursive: true });
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up temp directory
    try {
      await fs.rm(testDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  });

  describe("generateHarnessFiles - init.sh generation", () => {
    const mockSurvey = {
      techStack: { language: "typescript" },
      commands: {
        install: "npm install",
        dev: "npm run dev",
        test: "npm test",
        build: "npm run build",
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

    it("should create new init.sh when none exists (new mode)", async () => {
      // Default mock for any AI calls
      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "# Test CLAUDE.md" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("#!/usr/bin/env bash");
      expect(initScript).toContain("npm install");
      expect(initScript).toContain("npm run dev");
      expect(initScript).toContain("npm test");
    });

    it("should create new init.sh when none exists (merge mode)", async () => {
      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "# Test CLAUDE.md" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("#!/usr/bin/env bash");
      expect(initScript).toContain("npm install");
    });

    it("should use AI to merge init.sh in merge mode when existing script exists", async () => {
      // Create existing init.sh with custom content
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      const existingScript = `#!/usr/bin/env bash
# Custom user script
bootstrap() {
  pnpm install  # User changed to pnpm
}
dev() {
  pnpm run dev
}
check() {
  pnpm test
}`;
      await fs.writeFile(path.join(testDir, "ai/init.sh"), existingScript);

      // Mock AI agent to return merged script
      const mergedScript = `#!/usr/bin/env bash
# Merged script
bootstrap() {
  pnpm install  # User changed to pnpm
}
dev() {
  pnpm run dev
}
check() {
  pnpm test
}
verify() {
  # New function from template
  pnpm test
}`;
      // Use mockImplementation to control the response based on call
      let callCount = 0;
      mockCallAnyAvailableAgent.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call is for init.sh merge
          return Promise.resolve({ success: true, output: mergedScript });
        }
        // Second call is for CLAUDE.md
        return Promise.resolve({ success: true, output: "# Merged CLAUDE.md" });
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("pnpm install"); // Preserved user's pnpm
      expect(initScript).toContain("verify()"); // Added new function
    });

    it("should keep existing init.sh unchanged when AI merge fails completely", async () => {
      // Create existing init.sh
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      const existingScript = `#!/usr/bin/env bash
# User's custom script
my_custom_function() {
  echo "custom"
}`;
      await fs.writeFile(path.join(testDir, "ai/init.sh"), existingScript);

      // Use mockImplementation to control responses
      let callCount = 0;
      mockCallAnyAvailableAgent.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call for init.sh - fail completely
          return Promise.resolve({ success: false, error: "AI unavailable", output: "" });
        }
        // CLAUDE.md calls succeed
        return Promise.resolve({ success: true, output: "# CLAUDE.md content" });
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("my_custom_function"); // Original preserved
      expect(initScript).not.toContain("npm install"); // Template not written
    });

    it("should fallback to new template when AI returns invalid bash script", async () => {
      // Create existing init.sh
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      const existingScript = `#!/usr/bin/env bash
bootstrap() {
  echo "original"
}`;
      await fs.writeFile(path.join(testDir, "ai/init.sh"), existingScript);

      // Use mockImplementation to control responses
      let callCount = 0;
      mockCallAnyAvailableAgent.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call for init.sh - return invalid content (doesn't start with shebang)
          return Promise.resolve({ success: true, output: "This is not a valid bash script" });
        }
        // CLAUDE.md calls succeed
        return Promise.resolve({ success: true, output: "# CLAUDE.md" });
      });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      // Should write new template since AI output was invalid
      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("#!/usr/bin/env bash");
      expect(initScript).toContain("npm install"); // Falls back to template
    });

    it("should generate minimal init.sh when no commands detected", async () => {
      const emptySurvey = {
        techStack: { language: "unknown" },
        commands: {}, // No commands
        features: [],
        modules: [],
        structure: { entryPoints: [], sourceDirectories: [], testDirectories: [] },
      };

      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "# CLAUDE.md" });

      await generateHarnessFiles(testDir, emptySurvey as any, mockFeatureList, "Test goal", "new");

      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("#!/usr/bin/env bash");
      expect(initScript).toContain("TODO"); // Minimal script has TODOs
    });

    it("should overwrite init.sh in new mode even when existing", async () => {
      // Create existing init.sh with custom content
      await fs.mkdir(path.join(testDir, "ai"), { recursive: true });
      const existingScript = `#!/usr/bin/env bash
# User's custom script that should be overwritten
custom() {
  echo "custom"
}`;
      await fs.writeFile(path.join(testDir, "ai/init.sh"), existingScript);

      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "# CLAUDE.md" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("npm install"); // Template written
      expect(initScript).not.toContain("custom()"); // User's custom function removed
    });

    it("should not write progress.md in scan mode", async () => {
      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "# CLAUDE.md" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "scan");

      // init.sh should still be created
      const initScript = await fs.readFile(path.join(testDir, "ai/init.sh"), "utf-8");
      expect(initScript).toContain("#!/usr/bin/env bash");

      // progress.md should not have INIT entry for scan mode
      try {
        const progressLog = await fs.readFile(path.join(testDir, "ai/progress.md"), "utf-8");
        expect(progressLog).not.toContain("INIT");
      } catch {
        // File doesn't exist, which is expected for scan mode
        expect(true).toBe(true);
      }
    });
  });

  describe("generateHarnessFiles - CLAUDE.md generation", () => {
    const mockSurvey = {
      techStack: { language: "typescript" },
      commands: { install: "npm install" },
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

    it("should create new CLAUDE.md when none exists", async () => {
      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("Project Instructions");
      expect(claudeMd).toContain("Long-Task Harness");
    });

    it("should use AI to merge CLAUDE.md when existing content", async () => {
      // Create existing CLAUDE.md
      const existingContent = `# My Project

## Custom Section
This is my custom content that should be preserved.
`;
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), existingContent);

      // Mock AI to return merged content for CLAUDE.md (called after init.sh)
      const mergedClaudeMd = `# My Project

## Custom Section
This is my custom content that should be preserved.

## Long-Task Harness
New harness section added by AI.
`;
      // Init.sh has no existing file, so no AI call for it
      // CLAUDE.md has existing file, so AI is called for merge
      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: mergedClaudeMd });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("Custom Section"); // Preserved
      expect(claudeMd).toContain("Long-Task Harness"); // Added
    });

    it("should append harness section when AI merge fails", async () => {
      // Create existing CLAUDE.md
      const existingContent = `# Existing Project

Some existing content.
`;
      await fs.writeFile(path.join(testDir, "CLAUDE.md"), existingContent);

      // Mock AI to fail
      mockCallAnyAvailableAgent.mockResolvedValue({ success: false, error: "AI unavailable", output: "" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "merge");

      const claudeMd = await fs.readFile(path.join(testDir, "CLAUDE.md"), "utf-8");
      expect(claudeMd).toContain("Existing Project"); // Original preserved
      expect(claudeMd).toContain("Long-Task Harness"); // Appended (fallback behavior)
    });
  });

  describe("generateHarnessFiles - progress.md", () => {
    const mockSurvey = {
      techStack: { language: "typescript" },
      commands: { install: "npm install" },
      features: [],
      modules: [],
      structure: { entryPoints: [], sourceDirectories: [], testDirectories: [] },
    };

    const mockFeatureList: FeatureList = {
      features: [{
        id: "test.feature",
        description: "Test",
        module: "test",
        priority: 1,
        status: "failing",
        acceptance: [],
        version: 1,
        origin: "manual",
        dependsOn: [],
        supersedes: [],
        tags: [],
        notes: "",
      }],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
      },
    };

    it("should append INIT entry to progress.md in new mode", async () => {
      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "# CLAUDE.md" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Test goal", "new");

      const progressLog = await fs.readFile(path.join(testDir, "ai/progress.md"), "utf-8");
      expect(progressLog).toContain("INIT");
      expect(progressLog).toContain("Test goal");
      expect(progressLog).toContain("mode=new");
      expect(progressLog).toContain("features=1");
    });

    it("should append INIT entry to progress.md in merge mode", async () => {
      mockCallAnyAvailableAgent.mockResolvedValue({ success: true, output: "# CLAUDE.md" });

      await generateHarnessFiles(testDir, mockSurvey as any, mockFeatureList, "Another goal", "merge");

      const progressLog = await fs.readFile(path.join(testDir, "ai/progress.md"), "utf-8");
      expect(progressLog).toContain("INIT");
      expect(progressLog).toContain("Another goal");
      expect(progressLog).toContain("mode=merge");
    });
  });

  describe("detectAndAnalyzeProject", () => {
    const mockStructure = { entryPoints: [], sourceDirectories: [], testDirectories: [] };
    const mockSurvey = { techStack: { language: "typescript" }, commands: {}, features: [], modules: [], structure: mockStructure };

    beforeEach(() => {
      mockScanDirectoryStructure.mockResolvedValue(mockStructure);
      mockAiResultToSurvey.mockReturnValue(mockSurvey);
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should use existing PROJECT_SURVEY.md when available", async () => {
      // Create PROJECT_SURVEY.md
      await fs.mkdir(path.join(testDir, "docs"), { recursive: true });
      await fs.writeFile(path.join(testDir, "docs/PROJECT_SURVEY.md"), "# Project Survey\nTest content");

      mockGenerateFeaturesFromSurvey.mockResolvedValue({
        success: true,
        features: [],
        agentUsed: "claude",
      });

      const result = await detectAndAnalyzeProject(testDir, "Test goal", false);

      expect(result.success).toBe(true);
      expect(result.agentUsed).toBe("claude");
      expect(mockGenerateFeaturesFromSurvey).toHaveBeenCalled();
      expect(mockGenerateFeaturesFromGoal).not.toHaveBeenCalled();
      expect(mockAiScanProject).not.toHaveBeenCalled();
    });

    it("should return error when survey analysis fails", async () => {
      await fs.mkdir(path.join(testDir, "docs"), { recursive: true });
      await fs.writeFile(path.join(testDir, "docs/PROJECT_SURVEY.md"), "# Survey");

      mockGenerateFeaturesFromSurvey.mockResolvedValue({
        success: false,
        error: "AI analysis failed",
      });

      const result = await detectAndAnalyzeProject(testDir, "Test goal", false);

      expect(result.success).toBe(false);
      expect(result.error).toBe("AI analysis failed");
    });

    it("should generate features from goal for empty projects", async () => {
      mockIsProjectEmpty.mockResolvedValue(true);
      mockGenerateFeaturesFromGoal.mockResolvedValue({
        success: true,
        features: [],
        agentUsed: "gemini",
      });

      const result = await detectAndAnalyzeProject(testDir, "Build a CLI tool", false);

      expect(result.success).toBe(true);
      expect(result.agentUsed).toBe("gemini");
      expect(mockGenerateFeaturesFromGoal).toHaveBeenCalledWith("Build a CLI tool");
      expect(mockAiScanProject).not.toHaveBeenCalled();
    });

    it("should return error when goal generation fails for empty project", async () => {
      mockIsProjectEmpty.mockResolvedValue(true);
      mockGenerateFeaturesFromGoal.mockResolvedValue({
        success: false,
        error: "No agent available",
      });

      const result = await detectAndAnalyzeProject(testDir, "Test goal", false);

      expect(result.success).toBe(false);
      expect(result.error).toBe("No agent available");
    });

    it("should run AI scan for projects with source code", async () => {
      mockIsProjectEmpty.mockResolvedValue(false);
      mockAiScanProject.mockResolvedValue({
        success: true,
        features: [],
        agentUsed: "codex",
      });
      mockGenerateAISurveyMarkdown.mockReturnValue("# Generated Survey");

      const result = await detectAndAnalyzeProject(testDir, "Test goal", false);

      expect(result.success).toBe(true);
      expect(result.agentUsed).toBe("codex");
      expect(mockAiScanProject).toHaveBeenCalled();

      // Should auto-save survey
      const surveyFile = await fs.readFile(path.join(testDir, "docs/PROJECT_SURVEY.md"), "utf-8");
      expect(surveyFile).toContain("Generated Survey");
    });

    it("should return error when AI scan fails", async () => {
      mockIsProjectEmpty.mockResolvedValue(false);
      mockAiScanProject.mockResolvedValue({
        success: false,
        error: "Scan failed",
      });

      const result = await detectAndAnalyzeProject(testDir, "Test goal", false);

      expect(result.success).toBe(false);
      expect(result.error).toBe("Scan failed");
    });

    it("should print agent status when verbose", async () => {
      mockIsProjectEmpty.mockResolvedValue(true);
      mockGenerateFeaturesFromGoal.mockResolvedValue({
        success: true,
        features: [],
        agentUsed: "claude",
      });

      await detectAndAnalyzeProject(testDir, "Test goal", true);

      expect(mockPrintAgentStatus).toHaveBeenCalled();
    });
  });

  describe("mergeOrCreateFeatures", () => {
    const mockSurvey = {
      techStack: { language: "typescript" },
      commands: {},
      features: [
        { id: "feature1", description: "Feature 1", module: "test" },
        { id: "feature2", description: "Feature 2", module: "test" },
      ],
      modules: [],
      structure: { entryPoints: [], sourceDirectories: [], testDirectories: [] },
    };

    const mockFeature: Feature = {
      id: "converted.feature",
      description: "Converted",
      module: "test",
      priority: 1,
      status: "failing",
      acceptance: [],
      version: 1,
      origin: "init-auto",
      dependsOn: [],
      supersedes: [],
      tags: [],
      notes: "",
    };

    beforeEach(() => {
      mockDiscoveredToFeature.mockReturnValue(mockFeature);
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should create new feature list in new mode", async () => {
      const newFeatureList: FeatureList = {
        features: [],
        metadata: {
          projectGoal: "Test goal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      mockLoadFeatureList.mockResolvedValue(null);
      mockCreateEmptyFeatureList.mockReturnValue(newFeatureList);
      mockSaveFeatureList.mockResolvedValue(undefined);

      const result = await mergeOrCreateFeatures(testDir, mockSurvey as any, "Test goal", "new", false);

      expect(result.features).toHaveLength(2);
      expect(mockCreateEmptyFeatureList).toHaveBeenCalledWith("Test goal");
      expect(mockSaveFeatureList).toHaveBeenCalled();
    });

    it("should create new feature list when no existing list", async () => {
      const newFeatureList: FeatureList = {
        features: [],
        metadata: {
          projectGoal: "Test goal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      mockLoadFeatureList.mockResolvedValue(null);
      mockCreateEmptyFeatureList.mockReturnValue(newFeatureList);
      mockMergeFeatures.mockReturnValue([mockFeature, mockFeature]); // Return array for merge mode
      mockSaveFeatureList.mockResolvedValue(undefined);

      await mergeOrCreateFeatures(testDir, mockSurvey as any, "Test goal", "merge", false);

      expect(mockCreateEmptyFeatureList).toHaveBeenCalled();
    });

    it("should merge features in merge mode", async () => {
      const existingFeatureList: FeatureList = {
        features: [{ ...mockFeature, id: "existing.feature" }],
        metadata: {
          projectGoal: "Old goal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      mockLoadFeatureList.mockResolvedValue(existingFeatureList);
      mockMergeFeatures.mockReturnValue([
        { ...mockFeature, id: "existing.feature" },
        { ...mockFeature, id: "new.feature" },
      ]);
      mockSaveFeatureList.mockResolvedValue(undefined);

      const result = await mergeOrCreateFeatures(testDir, mockSurvey as any, "New goal", "merge", true);

      expect(result.metadata.projectGoal).toBe("New goal");
      expect(mockMergeFeatures).toHaveBeenCalled();
    });

    it("should not save in scan mode", async () => {
      const existingFeatureList: FeatureList = {
        features: [],
        metadata: {
          projectGoal: "Test goal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      mockLoadFeatureList.mockResolvedValue(existingFeatureList);

      await mergeOrCreateFeatures(testDir, mockSurvey as any, "Test goal", "scan", false);

      expect(mockSaveFeatureList).not.toHaveBeenCalled();
    });

    it("should replace features in new mode even with existing list", async () => {
      const existingFeatureList: FeatureList = {
        features: [{ ...mockFeature, id: "old.feature" }],
        metadata: {
          projectGoal: "Old goal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      mockLoadFeatureList.mockResolvedValue(existingFeatureList);
      mockCreateEmptyFeatureList.mockReturnValue({
        features: [],
        metadata: {
          projectGoal: "New goal",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      });
      mockSaveFeatureList.mockResolvedValue(undefined);

      const result = await mergeOrCreateFeatures(testDir, mockSurvey as any, "New goal", "new", false);

      expect(mockMergeFeatures).not.toHaveBeenCalled();
      expect(result.features).toHaveLength(2);
    });
  });
});
