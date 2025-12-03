/**
 * AI TDD Guidance Generator
 * Uses AI agents to generate intelligent TDD guidance from acceptance criteria
 */

import type { Feature, CachedTDDGuidance } from "./types.js";
import type { ExtendedCapabilities } from "./verification-types.js";
import { callAnyAvailableAgent } from "./agents.js";

/**
 * AI-generated TDD response structure
 * Matches the JSON expected from AI agents
 */
interface AITDDResponse {
  suggestedTestFiles: {
    unit: string[];
    e2e: string[];
  };
  unitTestCases: Array<{
    name: string;
    assertions: string[];
  }>;
  e2eScenarios: Array<{
    name: string;
    steps: string[];
  }>;
  frameworkHint?: string;
}

/**
 * Build AI prompt for TDD guidance generation
 *
 * @param feature - The feature to generate guidance for
 * @param capabilities - Detected project capabilities
 * @returns Formatted prompt string
 */
export function buildTDDPrompt(
  feature: Feature,
  capabilities: ExtendedCapabilities | null
): string {
  const acceptanceCriteria = feature.acceptance
    .map((a, i) => `${i + 1}. ${a}`)
    .join("\n");

  return `Analyze this feature for TDD guidance:

Feature ID: ${feature.id}
Description: ${feature.description}
Module: ${feature.module}

Acceptance Criteria:
${acceptanceCriteria}

Project test framework: ${capabilities?.testFramework || "unknown"}
${capabilities?.e2eInfo?.command ? `E2E framework: ${capabilities.e2eInfo.command}` : ""}

Generate JSON with this exact structure (no markdown, just raw JSON):
{
  "suggestedTestFiles": {
    "unit": ["tests/module/feature.test.ts"],
    "e2e": ["e2e/module/feature.spec.ts"]
  },
  "unitTestCases": [
    { "name": "should do X", "assertions": ["expect(...).toBe(...)", "expect(...).toHaveLength(...)"] }
  ],
  "e2eScenarios": [
    { "name": "user does X", "steps": ["navigate to page", "click button", "verify result"] }
  ],
  "frameworkHint": "vitest"
}

Rules:
- Generate one unit test case per acceptance criterion
- Only generate e2eScenarios for UI-related criteria (user interactions, displays, forms)
- Assertions should be specific and meaningful, not generic
- Use the detected framework syntax for assertions
- Return ONLY valid JSON, no explanations or markdown`;
}

/**
 * Extract JSON from AI response
 * Handles potential markdown code blocks or extra text
 *
 * @param output - Raw AI agent output
 * @returns Extracted JSON string or null
 */
function extractJSON(output: string): string | null {
  // Try to find JSON in code block
  const codeBlockMatch = output.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = output.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}

/**
 * Parse AI response into CachedTDDGuidance
 *
 * @param output - Raw AI agent output
 * @param agentUsed - Name of the agent that produced the output
 * @param feature - The feature this guidance is for
 * @returns Parsed CachedTDDGuidance or null on parse error
 */
export function parseTDDResponse(
  output: string,
  agentUsed: string,
  feature: Feature
): CachedTDDGuidance | null {
  try {
    const jsonStr = extractJSON(output);
    if (!jsonStr) {
      return null;
    }

    const parsed = JSON.parse(jsonStr) as AITDDResponse;

    // Validate required fields
    if (
      !parsed.suggestedTestFiles ||
      !Array.isArray(parsed.unitTestCases)
    ) {
      return null;
    }

    // Build CachedTDDGuidance with metadata
    const guidance: CachedTDDGuidance = {
      generatedAt: new Date().toISOString(),
      generatedBy: agentUsed,
      forVersion: feature.version,
      suggestedTestFiles: {
        unit: parsed.suggestedTestFiles.unit || [],
        e2e: parsed.suggestedTestFiles.e2e || [],
      },
      unitTestCases: parsed.unitTestCases.map((tc) => ({
        name: tc.name || "",
        assertions: tc.assertions || [],
      })),
      e2eScenarios: (parsed.e2eScenarios || []).map((sc) => ({
        name: sc.name || "",
        steps: sc.steps || [],
      })),
      frameworkHint: parsed.frameworkHint,
    };

    return guidance;
  } catch {
    return null;
  }
}

/**
 * Generate TDD guidance using AI agents
 *
 * @param feature - The feature to generate guidance for
 * @param capabilities - Detected project capabilities (null if unavailable)
 * @param cwd - Working directory for the agent
 * @returns CachedTDDGuidance if successful, null on failure
 */
export async function generateTDDGuidanceWithAI(
  feature: Feature,
  capabilities: ExtendedCapabilities | null,
  cwd: string
): Promise<CachedTDDGuidance | null> {
  // Build prompt
  const prompt = buildTDDPrompt(feature, capabilities);

  // Call AI agent
  const result = await callAnyAvailableAgent(prompt, {
    verbose: false,
    cwd,
  });

  // Handle failure
  if (!result.success || !result.agentUsed) {
    return null;
  }

  // Parse response
  const guidance = parseTDDResponse(result.output, result.agentUsed, feature);

  return guidance;
}
