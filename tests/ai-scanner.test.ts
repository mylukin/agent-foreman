/**
 * Tests for src/ai-scanner.ts - AI-powered project analysis
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  aiResultToSurvey,
  generateAISurveyMarkdown,
  generateFeaturesFromSurvey,
  generateFeaturesFromGoal,
  aiScanProject,
  type AIAnalysisResult,
} from "../src/ai-scanner.js";
import type { DirectoryStructure, ProjectSurvey } from "../src/types.js";

// Mock the agents module
vi.mock("../src/agents.js", () => ({
  callAnyAvailableAgent: vi.fn(),
  checkAvailableAgents: vi.fn(() => [{ name: "gemini", available: true }]),
}));

import { callAnyAvailableAgent, checkAvailableAgents } from "../src/agents.js";

describe("AI Scanner", () => {
  describe("aiResultToSurvey", () => {
    const mockStructure: DirectoryStructure = {
      entryPoints: ["src/index.ts"],
      srcDirs: ["src"],
      testDirs: ["tests"],
      configFiles: ["tsconfig.json"],
    };

    it("should convert successful AI result to survey", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
        techStack: {
          language: "typescript",
          framework: "express",
          buildTool: "tsc",
          testFramework: "vitest",
          packageManager: "npm",
        },
        modules: [
          { name: "auth", path: "src/auth", description: "Authentication", files: [], status: "partial" },
        ],
        features: [
          { id: "auth.login", description: "Login endpoint", module: "auth", source: "route", confidence: 0.9 },
        ],
        completion: { overall: 50, byModule: { auth: 50 }, notes: ["In progress"] },
        commands: { install: "npm install", dev: "npm run dev", build: "npm run build", test: "npm test" },
        summary: "Test project",
        recommendations: ["Add tests"],
        agentUsed: "gemini",
      };

      const survey = aiResultToSurvey(aiResult, mockStructure);

      expect(survey.techStack.language).toBe("typescript");
      expect(survey.techStack.framework).toBe("express");
      expect(survey.structure).toBe(mockStructure);
      expect(survey.modules).toHaveLength(1);
      expect(survey.features).toHaveLength(1);
      expect(survey.completion.overall).toBe(50);
    });

    it("should provide defaults for missing AI result data", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
      };

      const survey = aiResultToSurvey(aiResult, mockStructure);

      expect(survey.techStack.language).toBe("unknown");
      expect(survey.techStack.framework).toBe("unknown");
      expect(survey.modules).toHaveLength(0);
      expect(survey.features).toHaveLength(0);
      expect(survey.completion.overall).toBe(0);
    });

    it("should preserve structure from scan", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
        techStack: {
          language: "python",
          framework: "fastapi",
          buildTool: "pip",
          testFramework: "pytest",
          packageManager: "pip",
        },
      };

      const customStructure: DirectoryStructure = {
        entryPoints: ["main.py"],
        srcDirs: ["app"],
        testDirs: ["tests"],
        configFiles: ["pyproject.toml"],
      };

      const survey = aiResultToSurvey(aiResult, customStructure);

      expect(survey.structure.entryPoints).toContain("main.py");
      expect(survey.structure.srcDirs).toContain("app");
    });
  });

  describe("generateAISurveyMarkdown", () => {
    const mockSurvey: ProjectSurvey = {
      techStack: {
        language: "typescript",
        framework: "express",
        buildTool: "tsc",
        testFramework: "vitest",
        packageManager: "npm",
      },
      structure: {
        entryPoints: ["src/index.ts"],
        srcDirs: ["src"],
        testDirs: ["tests"],
        configFiles: ["tsconfig.json"],
      },
      modules: [
        { name: "api", path: "src/api", description: "REST API", files: ["routes.ts"], status: "partial" },
      ],
      features: [
        { id: "api.users", description: "Users API", module: "api", source: "route", confidence: 0.8 },
      ],
      completion: { overall: 60, byModule: { api: 60 }, notes: ["Needs testing"] },
      commands: { install: "npm install", dev: "npm run dev", build: "npm run build", test: "npm test" },
    };

    it("should generate markdown with AI-Enhanced header", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
        summary: "A TypeScript Express API",
        recommendations: ["Add tests", "Add documentation"],
        agentUsed: "gemini",
      };

      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("# Project Survey (AI-Enhanced)");
      expect(markdown).toContain("Analyzed by: gemini");
    });

    it("should include summary when provided", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
        summary: "This is a comprehensive Express API project",
        agentUsed: "claude",
      };

      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("## Summary");
      expect(markdown).toContain("This is a comprehensive Express API project");
    });

    it("should include recommendations when provided", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
        recommendations: ["Add unit tests", "Improve error handling", "Add CI/CD"],
        agentUsed: "codex",
      };

      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("## Recommendations");
      expect(markdown).toContain("Add unit tests");
      expect(markdown).toContain("Improve error handling");
      expect(markdown).toContain("Add CI/CD");
    });

    it("should include tech stack table", () => {
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("## Tech Stack");
      expect(markdown).toContain("typescript");
      expect(markdown).toContain("express");
      expect(markdown).toContain("vitest");
    });

    it("should include modules with descriptions", () => {
      const surveyWithModules: ProjectSurvey = {
        ...mockSurvey,
        modules: [
          { name: "auth", path: "src/auth", description: "Authentication module", files: [], status: "complete" },
          { name: "users", path: "src/users", description: "User management", files: [], status: "partial" },
        ],
      };
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };

      const markdown = generateAISurveyMarkdown(surveyWithModules, aiResult);

      expect(markdown).toContain("## Modules");
      expect(markdown).toContain("### auth");
      expect(markdown).toContain("Authentication module");
      expect(markdown).toContain("### users");
      expect(markdown).toContain("User management");
    });

    it("should include discovered features table", () => {
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("## Discovered Features");
      expect(markdown).toContain("| ID | Description | Module | Source | Confidence |");
      expect(markdown).toContain("api.users");
    });

    it("should include completion assessment", () => {
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("## Completion Assessment");
      expect(markdown).toContain("**Overall: 60%**");
    });

    it("should include commands section", () => {
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("## Commands");
      expect(markdown).toContain("npm install");
      expect(markdown).toContain("npm run dev");
    });

    it("should handle empty recommendations gracefully", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
        recommendations: [],
        agentUsed: "gemini",
      };

      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      // Should not crash, and should not include empty recommendations section
      expect(markdown).not.toContain("## Recommendations\n\n##");
    });

    it("should limit features to 100 for readability", () => {
      const manyFeatures = [];
      for (let i = 0; i < 150; i++) {
        manyFeatures.push({
          id: `feature.${i}`,
          description: `Feature ${i}`,
          module: "test",
          source: "route" as const,
          confidence: 0.8,
        });
      }

      const surveyWithManyFeatures: ProjectSurvey = {
        ...mockSurvey,
        features: manyFeatures,
      };

      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(surveyWithManyFeatures, aiResult);

      expect(markdown).toContain("and 50 more features");
    });

    it("should generate Chinese version when language is zh-CN", () => {
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult, { language: "zh-CN" });

      expect(markdown).toContain("# 项目调查报告 (AI 增强版)");
      expect(markdown).toContain("## 技术栈");
      expect(markdown).toContain("| 语言 |");
      expect(markdown).toContain("## 目录结构");
      expect(markdown).toContain("## 模块");
      expect(markdown).toContain("## 完成度评估");
      expect(markdown).toContain("**总体完成度: 60%**");
      expect(markdown).toContain("由 agent-foreman 和 AI 分析生成");
    });

    it("should generate English version by default", () => {
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult);

      expect(markdown).toContain("# Project Survey (AI-Enhanced)");
      expect(markdown).toContain("## Tech Stack");
      expect(markdown).toContain("| Language |");
      expect(markdown).toContain("## Directory Structure");
      expect(markdown).toContain("## Modules");
    });

    it("should strip Chinese translations from module descriptions by default", () => {
      const surveyWithChineseDesc: ProjectSurvey = {
        ...mockSurvey,
        modules: [
          {
            name: "users",
            path: "src/users",
            description: "User management\n> 用户管理模块",
            status: "complete",
            files: [],
          },
        ],
      };

      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(surveyWithChineseDesc, aiResult);

      expect(markdown).toContain("User management");
      expect(markdown).not.toContain("用户管理模块");
    });

    it("should keep Chinese translations when bilingual option is true", () => {
      const surveyWithChineseDesc: ProjectSurvey = {
        ...mockSurvey,
        modules: [
          {
            name: "users",
            path: "src/users",
            description: "User management\n> 用户管理模块",
            status: "complete",
            files: [],
          },
        ],
      };

      const aiResult: AIAnalysisResult = { success: true, agentUsed: "gemini" };
      const markdown = generateAISurveyMarkdown(surveyWithChineseDesc, aiResult, { bilingual: true });

      expect(markdown).toContain("User management");
      expect(markdown).toContain("用户管理模块");
    });

    it("should translate section headers in Chinese version", () => {
      const aiResult: AIAnalysisResult = {
        success: true,
        agentUsed: "gemini",
        recommendations: ["Add tests"],
      };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult, { language: "zh-CN" });

      expect(markdown).toContain("## 建议");
      expect(markdown).toContain("## 命令");
      expect(markdown).toContain("# 安装依赖");
    });

    it("should translate agent info in Chinese version", () => {
      const aiResult: AIAnalysisResult = { success: true, agentUsed: "claude" };
      const markdown = generateAISurveyMarkdown(mockSurvey, aiResult, { language: "zh-CN" });

      expect(markdown).toContain("由 claude 分析生成");
    });
  });

  describe("generateFeaturesFromSurvey", () => {
    beforeEach(() => {
      vi.mocked(callAnyAvailableAgent).mockReset();
    });

    it("should generate features from survey content", async () => {
      const mockResponse = JSON.stringify({
        techStack: {
          language: "typescript",
          framework: "express",
          buildTool: "tsc",
          testFramework: "vitest",
          packageManager: "npm",
        },
        modules: [{ name: "api", path: "src/api", description: "REST API", status: "partial" }],
        features: [
          { id: "api.users", description: "Users endpoint", module: "api", source: "survey", confidence: 0.9 },
        ],
        completion: { overall: 50, notes: ["In progress"] },
        commands: { install: "npm install", dev: "npm run dev", build: "npm run build", test: "npm test" },
        summary: "TypeScript API",
        recommendations: ["Add tests"],
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: mockResponse,
        agentUsed: "gemini",
      });

      const result = await generateFeaturesFromSurvey("# Survey content", "Build API");

      expect(result.success).toBe(true);
      expect(result.features).toHaveLength(1);
      expect(result.features![0].id).toBe("api.users");
      expect(result.agentUsed).toBe("gemini");
    });

    it("should return error when agent call fails", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: false,
        error: "No agents available",
      });

      const result = await generateFeaturesFromSurvey("# Survey", "Goal");

      expect(result.success).toBe(false);
      expect(result.error).toBe("No agents available");
    });

    it("should handle malformed JSON response", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: "not valid json",
        agentUsed: "gemini",
      });

      const result = await generateFeaturesFromSurvey("# Survey", "Goal");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse");
    });

    it("should extract JSON from markdown code blocks", async () => {
      const wrappedResponse = "```json\n" + JSON.stringify({
        techStack: { language: "python", framework: "fastapi", buildTool: "pip", testFramework: "pytest", packageManager: "pip" },
        modules: [],
        features: [{ id: "api.health", description: "Health check", module: "api", source: "survey", confidence: 0.8 }],
        completion: { overall: 30, notes: [] },
        commands: {},
        summary: "Python API",
        recommendations: [],
      }) + "\n```";

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: wrappedResponse,
        agentUsed: "codex",
      });

      const result = await generateFeaturesFromSurvey("# Survey", "Goal");

      expect(result.success).toBe(true);
      expect(result.features).toHaveLength(1);
      expect(result.techStack?.language).toBe("python");
    });
  });

  describe("generateFeaturesFromGoal", () => {
    beforeEach(() => {
      vi.mocked(callAnyAvailableAgent).mockReset();
    });

    it("should generate features from goal description", async () => {
      const mockResponse = JSON.stringify({
        techStack: {
          language: "typescript",
          framework: "express",
          buildTool: "tsc",
          testFramework: "vitest",
          packageManager: "npm",
        },
        modules: [
          { name: "auth", path: "src/auth", description: "Authentication", status: "stub" },
          { name: "api", path: "src/api", description: "REST API", status: "stub" },
        ],
        features: [
          { id: "auth.login", description: "User login", module: "auth", source: "goal", confidence: 0.8 },
          { id: "auth.register", description: "User registration", module: "auth", source: "goal", confidence: 0.8 },
          { id: "api.users.list", description: "List users", module: "api", source: "goal", confidence: 0.8 },
        ],
        completion: { overall: 0, notes: ["Project not yet started"] },
        commands: { install: "npm install", dev: "npm run dev", build: "npm run build", test: "npm test" },
        summary: "REST API for user management",
        recommendations: ["Start with auth module"],
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: mockResponse,
        agentUsed: "gemini",
      });

      const result = await generateFeaturesFromGoal("Build a REST API for user management");

      expect(result.success).toBe(true);
      expect(result.features).toHaveLength(3);
      expect(result.modules).toHaveLength(2);
      expect(result.completion?.overall).toBe(0);
      expect(result.agentUsed).toBe("gemini");
    });

    it("should return error when agent call fails", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: false,
        error: "API rate limit exceeded",
      });

      const result = await generateFeaturesFromGoal("Build something");

      expect(result.success).toBe(false);
      expect(result.error).toBe("API rate limit exceeded");
    });

    it("should handle empty features in response", async () => {
      const mockResponse = JSON.stringify({
        techStack: { language: "go", framework: "gin", buildTool: "go build", testFramework: "go test", packageManager: "go mod" },
        modules: [],
        features: [],
        completion: { overall: 0, notes: [] },
        commands: {},
        summary: "Go project",
        recommendations: [],
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: mockResponse,
        agentUsed: "claude",
      });

      const result = await generateFeaturesFromGoal("Build a CLI tool");

      expect(result.success).toBe(true);
      expect(result.features).toHaveLength(0);
      expect(result.techStack?.language).toBe("go");
    });

    it("should pass correct preferred order to agent", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: JSON.stringify({ features: [], modules: [], completion: { overall: 0, notes: [] }, commands: {} }),
        agentUsed: "gemini",
      });

      await generateFeaturesFromGoal("Goal");

      expect(callAnyAvailableAgent).toHaveBeenCalledWith(
        expect.stringContaining("Project Goal"),
        expect.objectContaining({
          preferredOrder: ["codex", "gemini", "claude"],
        })
      );
    });
  });

  describe("aiScanProject", () => {
    beforeEach(() => {
      vi.mocked(callAnyAvailableAgent).mockReset();
      // Ensure at least one agent is available by default
      vi.mocked(checkAvailableAgents).mockReturnValue([
        { name: "gemini", available: true },
        { name: "claude", available: false },
        { name: "codex", available: false },
      ]);
    });

    it("should call agent with project path in prompt", async () => {
      const mockResponse = JSON.stringify({
        techStack: {
          language: "typescript",
          framework: "express",
          buildTool: "tsc",
          testFramework: "vitest",
          packageManager: "npm",
        },
        modules: [{ name: "core", path: "src", description: "Core module", status: "complete" }],
        features: [{ id: "core.init", description: "Initialize", module: "core", source: "code", confidence: 0.9 }],
        completion: { overall: 80, notes: ["Well structured"] },
        commands: { install: "npm install", dev: "npm run dev", build: "npm run build", test: "npm test" },
        summary: "A TypeScript project",
        recommendations: ["Add more tests"],
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: mockResponse,
        agentUsed: "gemini",
      });

      const result = await aiScanProject("/test/project/path");

      expect(result.success).toBe(true);
      expect(callAnyAvailableAgent).toHaveBeenCalledWith(
        expect.stringContaining("/test/project/path"),
        expect.objectContaining({
          cwd: "/test/project/path",
        })
      );
    });

    it("should pass cwd option to agent for autonomous exploration", async () => {
      const mockResponse = JSON.stringify({
        techStack: { language: "python", framework: "fastapi", buildTool: "pip", testFramework: "pytest", packageManager: "pip" },
        modules: [],
        features: [],
        completion: { overall: 0, notes: [] },
        commands: {},
        summary: "Python project",
        recommendations: [],
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: mockResponse,
        agentUsed: "claude",
      });

      await aiScanProject("/my/python/project");

      expect(callAnyAvailableAgent).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          cwd: "/my/python/project",
          preferredOrder: ["codex", "gemini", "claude"],
        })
      );
    });

    it("should return error when no agents available", async () => {
      // Override the mock to return no available agents
      vi.mocked(checkAvailableAgents).mockReturnValue([
        { name: "claude", available: false },
        { name: "gemini", available: false },
        { name: "codex", available: false },
      ]);

      const result = await aiScanProject("/test/path");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No AI agents available");
    });

    it("should return parsed AI analysis result on success", async () => {
      const mockResponse = JSON.stringify({
        techStack: {
          language: "go",
          framework: "gin",
          buildTool: "go build",
          testFramework: "go test",
          packageManager: "go mod",
        },
        modules: [
          { name: "api", path: "internal/api", description: "REST API handlers", status: "partial" },
          { name: "db", path: "internal/db", description: "Database layer", status: "complete" },
        ],
        features: [
          { id: "api.users.list", description: "List users", module: "api", source: "route", confidence: 0.95 },
          { id: "api.users.create", description: "Create user", module: "api", source: "route", confidence: 0.95 },
        ],
        completion: { overall: 70, notes: ["Missing tests for API handlers"] },
        commands: { install: "go mod download", dev: "go run .", build: "go build", test: "go test ./..." },
        summary: "A Go REST API with Gin framework",
        recommendations: ["Add integration tests", "Implement authentication"],
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: mockResponse,
        agentUsed: "codex",
      });

      const result = await aiScanProject("/go/project");

      expect(result.success).toBe(true);
      expect(result.techStack?.language).toBe("go");
      expect(result.techStack?.framework).toBe("gin");
      expect(result.modules).toHaveLength(2);
      expect(result.features).toHaveLength(2);
      expect(result.completion?.overall).toBe(70);
      expect(result.agentUsed).toBe("codex");
    });

    it("should return error when agent call fails", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: false,
        output: "",
        error: "Agent timeout",
      });

      const result = await aiScanProject("/test/path");

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agent timeout");
    });

    it("should handle malformed JSON from agent", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: "This is not valid JSON at all",
        agentUsed: "gemini",
      });

      const result = await aiScanProject("/test/path");

      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse");
    });

    it("should extract JSON from markdown code blocks", async () => {
      const wrappedResponse = "Here is my analysis:\n\n```json\n" + JSON.stringify({
        techStack: { language: "rust", framework: "actix", buildTool: "cargo", testFramework: "cargo test", packageManager: "cargo" },
        modules: [{ name: "main", path: "src", description: "Main module", status: "complete" }],
        features: [],
        completion: { overall: 50, notes: [] },
        commands: { install: "cargo build", dev: "cargo run", build: "cargo build --release", test: "cargo test" },
        summary: "Rust project",
        recommendations: [],
      }) + "\n```\n\nHope this helps!";

      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: wrappedResponse,
        agentUsed: "claude",
      });

      const result = await aiScanProject("/rust/project");

      expect(result.success).toBe(true);
      expect(result.techStack?.language).toBe("rust");
      expect(result.agentUsed).toBe("claude");
    });

    it("should include autonomous exploration instructions in prompt", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValue({
        success: true,
        output: JSON.stringify({ features: [], modules: [], completion: { overall: 0, notes: [] }, commands: {} }),
        agentUsed: "gemini",
      });

      await aiScanProject("/test/path");

      const callArgs = vi.mocked(callAnyAvailableAgent).mock.calls[0];
      const prompt = callArgs[0];

      // Check that prompt contains key autonomous exploration elements
      expect(prompt).toContain("Explore");
      expect(prompt).toContain("/test/path");
      expect(prompt).toContain("JSON");
    });
  });
});
