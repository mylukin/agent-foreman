/**
 * Tests for src/tdd-ai-generator.ts - AI TDD guidance generator
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildTDDPrompt,
  parseTDDResponse,
  generateTDDGuidanceWithAI,
} from "../src/tdd-ai-generator.js";
import type { Feature, CachedTDDGuidance } from "../src/types.js";
import type { ExtendedCapabilities } from "../src/verification-types.js";

// Mock the agents module
vi.mock("../src/agents.js", () => ({
  callAnyAvailableAgent: vi.fn(),
}));

import { callAnyAvailableAgent } from "../src/agents.js";

// Mock feature for testing
const mockFeature: Feature = {
  id: "auth.login",
  description: "User can log in with email and password",
  module: "auth",
  priority: 1,
  status: "failing",
  acceptance: [
    "User can enter email and password",
    "User receives error message for invalid credentials",
    "User is redirected to dashboard after successful login",
  ],
  dependsOn: [],
  supersedes: [],
  tags: ["auth"],
  version: 1,
  origin: "manual",
  notes: "",
};

// Mock capabilities for testing
const mockCapabilities: ExtendedCapabilities = {
  testFramework: "vitest",
  language: "typescript",
  confidence: 0.95,
  languages: ["typescript"],
};

// Valid AI response JSON
const validAIResponse = JSON.stringify({
  suggestedTestFiles: {
    unit: ["tests/auth/login.test.ts"],
    e2e: ["e2e/auth/login.spec.ts"],
  },
  unitTestCases: [
    {
      name: "should allow user to enter email and password",
      assertions: [
        "expect(emailInput).toBeDefined()",
        "expect(passwordInput).toBeDefined()",
      ],
    },
    {
      name: "should show error message for invalid credentials",
      assertions: [
        "expect(errorMessage).toBe('Invalid credentials')",
      ],
    },
    {
      name: "should redirect to dashboard after successful login",
      assertions: [
        "expect(location.pathname).toBe('/dashboard')",
      ],
    },
  ],
  e2eScenarios: [
    {
      name: "user logs in successfully",
      steps: [
        "navigate to login page",
        "fill in email field",
        "fill in password field",
        "click submit button",
        "verify redirect to dashboard",
      ],
    },
  ],
  frameworkHint: "vitest",
});

describe("TDD AI Generator", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("buildTDDPrompt", () => {
    it("should include feature ID in prompt", () => {
      const prompt = buildTDDPrompt(mockFeature, mockCapabilities);
      expect(prompt).toContain("Feature ID: auth.login");
    });

    it("should include feature description in prompt", () => {
      const prompt = buildTDDPrompt(mockFeature, mockCapabilities);
      expect(prompt).toContain("Description: User can log in with email and password");
    });

    it("should include module name in prompt", () => {
      const prompt = buildTDDPrompt(mockFeature, mockCapabilities);
      expect(prompt).toContain("Module: auth");
    });

    it("should include all acceptance criteria in prompt", () => {
      const prompt = buildTDDPrompt(mockFeature, mockCapabilities);
      expect(prompt).toContain("1. User can enter email and password");
      expect(prompt).toContain("2. User receives error message for invalid credentials");
      expect(prompt).toContain("3. User is redirected to dashboard after successful login");
    });

    it("should include test framework from capabilities", () => {
      const prompt = buildTDDPrompt(mockFeature, mockCapabilities);
      expect(prompt).toContain("Project test framework: vitest");
    });

    it("should handle null capabilities", () => {
      const prompt = buildTDDPrompt(mockFeature, null);
      expect(prompt).toContain("Project test framework: unknown");
    });

    it("should include E2E framework if available", () => {
      const capsWithE2E: ExtendedCapabilities = {
        ...mockCapabilities,
        e2eInfo: {
          command: "npx playwright test",
        },
      };
      const prompt = buildTDDPrompt(mockFeature, capsWithE2E);
      expect(prompt).toContain("E2E framework: npx playwright test");
    });

    it("should include JSON generation rules", () => {
      const prompt = buildTDDPrompt(mockFeature, mockCapabilities);
      expect(prompt).toContain("Generate one unit test case per acceptance criterion");
      expect(prompt).toContain("Only generate e2eScenarios for UI-related criteria");
    });
  });

  describe("parseTDDResponse", () => {
    it("should parse valid JSON response", () => {
      const result = parseTDDResponse(validAIResponse, "codex", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.generatedBy).toBe("codex");
      expect(result?.forVersion).toBe(mockFeature.version);
    });

    it("should extract suggested test files", () => {
      const result = parseTDDResponse(validAIResponse, "codex", mockFeature);

      expect(result?.suggestedTestFiles.unit).toEqual(["tests/auth/login.test.ts"]);
      expect(result?.suggestedTestFiles.e2e).toEqual(["e2e/auth/login.spec.ts"]);
    });

    it("should extract unit test cases", () => {
      const result = parseTDDResponse(validAIResponse, "codex", mockFeature);

      expect(result?.unitTestCases).toHaveLength(3);
      expect(result?.unitTestCases[0].name).toBe("should allow user to enter email and password");
      expect(result?.unitTestCases[0].assertions).toHaveLength(2);
    });

    it("should extract E2E scenarios", () => {
      const result = parseTDDResponse(validAIResponse, "codex", mockFeature);

      expect(result?.e2eScenarios).toHaveLength(1);
      expect(result?.e2eScenarios[0].name).toBe("user logs in successfully");
      expect(result?.e2eScenarios[0].steps).toHaveLength(5);
    });

    it("should extract framework hint", () => {
      const result = parseTDDResponse(validAIResponse, "codex", mockFeature);

      expect(result?.frameworkHint).toBe("vitest");
    });

    it("should set generatedAt timestamp", () => {
      const result = parseTDDResponse(validAIResponse, "codex", mockFeature);

      expect(result?.generatedAt).toBeDefined();
      expect(new Date(result!.generatedAt).getTime()).toBeLessThanOrEqual(Date.now());
    });

    it("should handle JSON wrapped in markdown code block", () => {
      const wrappedResponse = "```json\n" + validAIResponse + "\n```";
      const result = parseTDDResponse(wrappedResponse, "gemini", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.generatedBy).toBe("gemini");
    });

    it("should handle JSON with extra text around it", () => {
      const withExtraText = "Here is the guidance:\n" + validAIResponse + "\nLet me know if you need more.";
      const result = parseTDDResponse(withExtraText, "claude", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.generatedBy).toBe("claude");
    });

    it("should return null for invalid JSON", () => {
      const result = parseTDDResponse("not valid json", "codex", mockFeature);
      expect(result).toBeNull();
    });

    it("should return null for missing required fields", () => {
      const incomplete = JSON.stringify({ frameworkHint: "vitest" });
      const result = parseTDDResponse(incomplete, "codex", mockFeature);
      expect(result).toBeNull();
    });

    it("should handle empty arrays gracefully", () => {
      const minimalResponse = JSON.stringify({
        suggestedTestFiles: { unit: [], e2e: [] },
        unitTestCases: [],
        e2eScenarios: [],
      });
      const result = parseTDDResponse(minimalResponse, "codex", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.unitTestCases).toEqual([]);
      expect(result?.e2eScenarios).toEqual([]);
    });

    it("should handle missing e2eScenarios field", () => {
      const noE2E = JSON.stringify({
        suggestedTestFiles: { unit: ["test.ts"], e2e: [] },
        unitTestCases: [{ name: "test", assertions: [] }],
      });
      const result = parseTDDResponse(noE2E, "codex", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.e2eScenarios).toEqual([]);
    });

    it("should handle missing unit and e2e arrays in suggestedTestFiles", () => {
      const noArrays = JSON.stringify({
        suggestedTestFiles: {},
        unitTestCases: [{ name: "test", assertions: [] }],
        e2eScenarios: [],
      });
      const result = parseTDDResponse(noArrays, "codex", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.suggestedTestFiles.unit).toEqual([]);
      expect(result?.suggestedTestFiles.e2e).toEqual([]);
    });

    it("should handle missing name and assertions in unitTestCases", () => {
      const missingFields = JSON.stringify({
        suggestedTestFiles: { unit: ["test.ts"], e2e: [] },
        unitTestCases: [{}],
        e2eScenarios: [],
      });
      const result = parseTDDResponse(missingFields, "codex", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.unitTestCases[0].name).toBe("");
      expect(result?.unitTestCases[0].assertions).toEqual([]);
    });

    it("should handle missing name and steps in e2eScenarios", () => {
      const missingFields = JSON.stringify({
        suggestedTestFiles: { unit: ["test.ts"], e2e: [] },
        unitTestCases: [],
        e2eScenarios: [{}],
      });
      const result = parseTDDResponse(missingFields, "codex", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.e2eScenarios[0].name).toBe("");
      expect(result?.e2eScenarios[0].steps).toEqual([]);
    });

    it("should return null when JSON.parse throws an error", () => {
      // Valid JSON structure extracted but with invalid content that causes parsing error
      const malformedJSON = "{ suggestedTestFiles: }"; // Invalid JSON syntax
      const result = parseTDDResponse(malformedJSON, "codex", mockFeature);

      expect(result).toBeNull();
    });

    it("should return null when no JSON is found in output", () => {
      const noJSON = "This is plain text without any JSON object";
      const result = parseTDDResponse(noJSON, "codex", mockFeature);

      expect(result).toBeNull();
    });

    it("should handle code block without json language specifier", () => {
      const codeBlockNoLang = "```\n" + validAIResponse + "\n```";
      const result = parseTDDResponse(codeBlockNoLang, "codex", mockFeature);

      expect(result).not.toBeNull();
      expect(result?.generatedBy).toBe("codex");
    });
  });

  describe("generateTDDGuidanceWithAI", () => {
    it("should return CachedTDDGuidance on successful AI call", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: validAIResponse,
        agentUsed: "codex",
      });

      const result = await generateTDDGuidanceWithAI(mockFeature, mockCapabilities, "/test/path");

      expect(result).not.toBeNull();
      expect(result?.generatedBy).toBe("codex");
      expect(result?.unitTestCases).toHaveLength(3);
    });

    it("should call callAnyAvailableAgent with correct parameters", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: validAIResponse,
        agentUsed: "codex",
      });

      await generateTDDGuidanceWithAI(mockFeature, mockCapabilities, "/test/path");

      expect(callAnyAvailableAgent).toHaveBeenCalledTimes(1);
      expect(callAnyAvailableAgent).toHaveBeenCalledWith(
        expect.stringContaining("Feature ID: auth.login"),
        expect.objectContaining({
          verbose: false,
          cwd: "/test/path",
        })
      );
    });

    it("should return null when AI call fails", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: false,
        output: "",
        error: "No agents available",
      });

      const result = await generateTDDGuidanceWithAI(mockFeature, mockCapabilities, "/test/path");

      expect(result).toBeNull();
    });

    it("should return null when agentUsed is undefined", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: validAIResponse,
        agentUsed: undefined,
      });

      const result = await generateTDDGuidanceWithAI(mockFeature, mockCapabilities, "/test/path");

      expect(result).toBeNull();
    });

    it("should return null when AI returns unparseable output", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: "This is not JSON at all",
        agentUsed: "codex",
      });

      const result = await generateTDDGuidanceWithAI(mockFeature, mockCapabilities, "/test/path");

      expect(result).toBeNull();
    });

    it("should handle null capabilities", async () => {
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: validAIResponse,
        agentUsed: "claude",
      });

      const result = await generateTDDGuidanceWithAI(mockFeature, null, "/test/path");

      expect(result).not.toBeNull();
      expect(callAnyAvailableAgent).toHaveBeenCalledWith(
        expect.stringContaining("Project test framework: unknown"),
        expect.any(Object)
      );
    });

    it("should preserve feature version in generated guidance", async () => {
      const featureV2 = { ...mockFeature, version: 2 };
      vi.mocked(callAnyAvailableAgent).mockResolvedValueOnce({
        success: true,
        output: validAIResponse,
        agentUsed: "codex",
      });

      const result = await generateTDDGuidanceWithAI(featureV2, mockCapabilities, "/test/path");

      expect(result?.forVersion).toBe(2);
    });
  });
});
