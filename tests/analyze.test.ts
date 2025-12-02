/**
 * Tests for src/analyze.ts - requirement analysis for `analyze` command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  analyzeRequirementsWithAI,
  buildRequirementNamePrompt,
  buildStepsPrompt,
  parseRequirementNameResponse,
  parseStepsResponse,
  extractJsonObject,
  sanitizeNameForPath,
  slugify,
  detectSpecLanguage,
  type StepDefinition,
} from "../src/analyze.js";

// Mock the agents module
vi.mock("../src/agents.js", () => ({
  callAnyAvailableAgent: vi.fn(),
  checkAvailableAgents: vi.fn(() => [{ name: "gemini", available: true }]),
}));

import { callAnyAvailableAgent, checkAvailableAgents } from "../src/agents.js";

describe("analyze.ts", () => {
  beforeEach(() => {
    vi.mocked(callAnyAvailableAgent).mockReset();
    vi.mocked(checkAvailableAgents).mockReturnValue([{ name: "gemini", available: true }]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe("extractJsonObject", () => {
    it("should extract JSON from code block", () => {
      const response = "Here is result:\n```json\n{\"foo\": 1}\n```\nThanks";
      const json = extractJsonObject(response);
      expect(json).toBe('{"foo": 1}');
    });

    it("should extract JSON from plain object", () => {
      const response = "prefix {\"bar\": 2} suffix";
      const json = extractJsonObject(response);
      expect(json).toBe('{"bar": 2}');
    });

    it("should return null when no JSON found", () => {
      const response = "no json here";
      const json = extractJsonObject(response);
      expect(json).toBeNull();
    });
  });

  describe("parseRequirementNameResponse", () => {
    it("should parse requirementName from JSON", () => {
      const name = parseRequirementNameResponse('{"requirementName":"用户登录"}');
      expect(name).toBe("用户登录");
    });

    it("should parse requirementName from wrapped response", () => {
      const response = "```json\n{\"requirementName\":\"订单管理\"}\n```";
      const name = parseRequirementNameResponse(response);
      expect(name).toBe("订单管理");
    });

    it("should throw when requirementName is missing", () => {
      expect(() => parseRequirementNameResponse('{"foo":"bar"}')).toThrow();
    });
  });

  describe("parseStepsResponse", () => {
    it("should parse steps from JSON", () => {
      const response = JSON.stringify({
        steps: [
          {
            slug: "setup-auth-api",
            description: "实现认证接口",
            verification: [
              { type: "unit", description: "为认证服务编写单元测试" },
              { type: "ui", description: "编写登录表单 UI 自动化测试" },
            ],
          },
        ],
      });

      const steps = parseStepsResponse(response);
      expect(steps).toHaveLength(1);
      expect(steps[0].slug).toBe("setup-auth-api");
      expect(steps[0].description).toContain("认证接口");
      expect(steps[0].verification).toHaveLength(2);
      expect(steps[0].completion).toBeUndefined();
    });

    it("should derive slug from description when missing", () => {
      const response = JSON.stringify({
        steps: [
          {
            description: "实现通知模块",
            verification: [],
          },
        ],
      });

      const steps = parseStepsResponse(response);
      expect(steps[0].slug).toContain("实现通知模块");
    });

    it("should parse completion field when present", () => {
      const response = JSON.stringify({
        steps: [
          {
            slug: "check-existing-auth",
            description: "检查现有认证实现是否满足需求",
            completion: "done",
            verification: [
              { type: "integration", description: "验证登录接口在现有代码中的行为" },
            ],
          },
        ],
      });

      const steps = parseStepsResponse(response);
      expect(steps).toHaveLength(1);
      expect(steps[0].completion).toBe("done");
    });

    it("should throw when no valid steps", () => {
      const response = JSON.stringify({ steps: [] });
      expect(() => parseStepsResponse(response)).toThrow();
    });
  });

  describe("sanitizeNameForPath", () => {
    it("should replace invalid path characters", () => {
      const name = '用户登录:基础/功能*测试?"<>|';
      const sanitized = sanitizeNameForPath(name);
      expect(sanitized).not.toContain(":");
      expect(sanitized).not.toContain("/");
      expect(sanitized).not.toContain("*");
      expect(sanitized).not.toContain("?");
      expect(sanitized).not.toContain("<");
      expect(sanitized).not.toContain(">");
      expect(sanitized).not.toContain("|");
    });

    it("should fall back for empty names", () => {
      expect(sanitizeNameForPath("   ")).toBe("未命名需求");
    });
  });

  describe("slugify", () => {
    it("should convert text to slug", () => {
      expect(slugify("Setup Auth API")).toBe("setup-auth-api");
      expect(slugify("用户 登录 功能")).toBe("用户-登录-功能");
    });

    it("should fall back when nothing left", () => {
      expect(slugify("!!!")).toBe("step");
    });
  });

  describe("detectSpecLanguage", () => {
    it("should detect Chinese for Chinese spec text", () => {
      const text = "这是一个中文需求文档，包含多句描述。";
      expect(detectSpecLanguage(text)).toBe("zh");
    });

    it("should detect English for English spec text", () => {
      const text =
        "This is an English requirement document with some description about the feature.";
      expect(detectSpecLanguage(text)).toBe("en");
    });

    it("should prefer English when mixed but mostly English", () => {
      const text = "This is an English spec, 只包含少量中文。";
      expect(detectSpecLanguage(text)).toBe("en");
    });
  });

  describe("analyzeRequirementsWithAI", () => {
    const specText = "这是一个关于用户登录的需求文档。";

    it("should return error when no agents available", async () => {
      vi.mocked(checkAvailableAgents).mockReturnValue([
        { name: "gemini", available: false },
        { name: "claude", available: false },
      ]);

      const result = await analyzeRequirementsWithAI(specText, { cwd: "/project" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("No AI agents available");
    });

    it("should call agent twice and return parsed result", async () => {
      const nameResponse = JSON.stringify({ requirementName: "用户登录" });
      const stepsResponse = JSON.stringify({
        steps: [
          {
            slug: "setup-auth-api",
            description: "实现登录接口",
            verification: [{ type: "unit", description: "为登录接口编写单元测试" }],
            completion: "todo",
          },
        ] as StepDefinition[],
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: nameResponse,
        agentUsed: "gemini",
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: stepsResponse,
        agentUsed: "gemini",
      });

      const result = await analyzeRequirementsWithAI(specText, { cwd: "/project" });

      expect(result.success).toBe(true);
      expect(result.requirementName).toBe("用户登录");
      expect(result.steps).toHaveLength(1);
      expect(result.steps?.[0].completion).toBe("todo");
      expect(result.agentUsed).toBe("gemini");

      expect(callAnyAvailableAgent).toHaveBeenCalledTimes(2);
    });

    it("should return error when requirement name parsing fails", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: "not json at all",
        agentUsed: "gemini",
      });

      const result = await analyzeRequirementsWithAI(specText, { cwd: "/project" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse requirement name");
    });

    it("should return error when steps parsing fails", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: JSON.stringify({ requirementName: "用户登录" }),
        agentUsed: "gemini",
      });

      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: "invalid steps json",
        agentUsed: "gemini",
      });

      const result = await analyzeRequirementsWithAI(specText, { cwd: "/project" });
      expect(result.success).toBe(false);
      expect(result.error).toContain("Failed to parse steps");
    });
  });
});
