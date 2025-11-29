/**
 * AI prompt templates for comprehensive feature verification
 * Builds prompts and parses AI responses for verification
 */

import type { Feature } from "./types.js";
import type {
  AutomatedCheckResult,
  AIVerificationResponse,
  CriterionResult,
  VerificationVerdict,
} from "./verification-types.js";

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build a comprehensive verification prompt for AI analysis
 */
export function buildVerificationPrompt(
  feature: Feature,
  diff: string,
  changedFiles: string[],
  automatedResults: AutomatedCheckResult[],
  relatedFileContents?: Map<string, string>
): string {
  const criteriaList = feature.acceptance
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const automatedChecksSummary = formatAutomatedChecks(automatedResults);

  const relatedFilesSection = relatedFileContents
    ? formatRelatedFiles(relatedFileContents)
    : "";

  return `You are a software verification expert. Analyze the code changes and determine if the acceptance criteria are satisfied for this feature.

## Feature Information

- **ID**: ${feature.id}
- **Description**: ${feature.description}
- **Module**: ${feature.module}
- **Priority**: ${feature.priority}

## Acceptance Criteria

${criteriaList}

## Changed Files

${changedFiles.map((f) => `- ${f}`).join("\n")}

## Git Diff

\`\`\`diff
${diff}
\`\`\`

${automatedChecksSummary}

${relatedFilesSection}

## Your Task

Perform a comprehensive analysis:

### 1. Per-Criterion Analysis

For EACH acceptance criterion above:
- Determine if it is **satisfied** by the code changes
- Provide specific **evidence** (file:line references from the diff)
- Rate your **confidence** (0.0 to 1.0, where 1.0 is highest)
- Explain your **reasoning** clearly

### 2. Code Quality Assessment

- Note any code quality issues (bugs, security, performance)
- Identify edge cases that may not be handled
- Check for proper error handling

### 3. Overall Verdict

Based on your analysis:
- **"pass"**: ALL criteria are satisfied with high confidence (>0.8 average)
- **"fail"**: ANY criterion is clearly NOT satisfied
- **"needs_review"**: Evidence is insufficient or confidence is low

### 4. Suggestions

Provide actionable suggestions for improvement.

## Output Format

Respond with ONLY valid JSON in this exact format:

\`\`\`json
{
  "criteriaResults": [
    {
      "index": 0,
      "satisfied": true,
      "reasoning": "The feature implements X as shown in file.ts:45",
      "evidence": ["file.ts:45", "file.ts:67-89"],
      "confidence": 0.95
    }
  ],
  "verdict": "pass",
  "overallReasoning": "All acceptance criteria are met with high confidence...",
  "suggestions": ["Consider adding more error handling..."],
  "codeQualityNotes": ["Good use of TypeScript types..."]
}
\`\`\`

IMPORTANT: Your response must be ONLY the JSON object, no other text.`;
}

/**
 * Format automated check results for the prompt
 */
function formatAutomatedChecks(results: AutomatedCheckResult[]): string {
  if (results.length === 0) {
    return "## Automated Check Results\n\nNo automated checks were run.";
  }

  const lines = results.map((r) => {
    const status = r.success ? "PASSED" : "FAILED";
    const duration = r.duration ? ` (${r.duration}ms)` : "";
    let line = `- **${r.type.toUpperCase()}**: ${status}${duration}`;
    if (r.errorCount !== undefined && r.errorCount > 0) {
      line += ` - ${r.errorCount} errors`;
    }
    return line;
  });

  return `## Automated Check Results

${lines.join("\n")}`;
}

/**
 * Format related file contents for context
 */
function formatRelatedFiles(files: Map<string, string>): string {
  if (files.size === 0) {
    return "";
  }

  const sections: string[] = [];
  for (const [filePath, content] of files) {
    // Truncate very long files
    const truncated =
      content.length > 5000
        ? content.slice(0, 5000) + "\n... (truncated)"
        : content;

    sections.push(`### ${filePath}

\`\`\`
${truncated}
\`\`\``);
  }

  return `## Related Files (for context)

${sections.join("\n\n")}`;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse AI verification response from JSON
 * Handles malformed responses gracefully
 */
export function parseVerificationResponse(
  response: string,
  acceptanceCriteria: string[]
): {
  criteriaResults: CriterionResult[];
  verdict: VerificationVerdict;
  overallReasoning: string;
  suggestions: string[];
  codeQualityNotes: string[];
} {
  // Default response for parsing failures
  const defaultResult = {
    criteriaResults: acceptanceCriteria.map((criterion, index) => ({
      criterion,
      index,
      satisfied: false,
      reasoning: "Failed to parse AI response",
      evidence: [],
      confidence: 0,
    })),
    verdict: "needs_review" as VerificationVerdict,
    overallReasoning: "Failed to parse AI response",
    suggestions: [],
    codeQualityNotes: [],
  };

  try {
    // Try to extract JSON from the response
    const jsonMatch = extractJson(response);
    if (!jsonMatch) {
      console.warn("[verification-prompts] No JSON found in response");
      return defaultResult;
    }

    const parsed = JSON.parse(jsonMatch) as AIVerificationResponse;

    // Validate and map criteria results
    const criteriaResults: CriterionResult[] = acceptanceCriteria.map(
      (criterion, index) => {
        const aiResult = parsed.criteriaResults?.find(
          (r) => r.index === index
        );

        if (aiResult) {
          return {
            criterion,
            index,
            satisfied: Boolean(aiResult.satisfied),
            reasoning: aiResult.reasoning || "No reasoning provided",
            evidence: aiResult.evidence || [],
            confidence: normalizeConfidence(aiResult.confidence),
          };
        }

        // Missing criterion result
        return {
          criterion,
          index,
          satisfied: false,
          reasoning: "Criterion not analyzed by AI",
          evidence: [],
          confidence: 0,
        };
      }
    );

    // Validate verdict
    const verdict = validateVerdict(parsed.verdict);

    return {
      criteriaResults,
      verdict,
      overallReasoning: parsed.overallReasoning || "No reasoning provided",
      suggestions: parsed.suggestions || [],
      codeQualityNotes: parsed.codeQualityNotes || [],
    };
  } catch (error) {
    console.warn(
      `[verification-prompts] Failed to parse response: ${error}`
    );
    return defaultResult;
  }
}

/**
 * Extract JSON from a response that may have surrounding text
 */
function extractJson(response: string): string | null {
  // Try to find JSON in code block
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}

/**
 * Normalize confidence value to 0-1 range
 */
function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number") {
    return 0;
  }
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * Validate and normalize verdict value
 */
function validateVerdict(value: unknown): VerificationVerdict {
  if (value === "pass" || value === "fail" || value === "needs_review") {
    return value;
  }
  return "needs_review";
}

// ============================================================================
// Quick Check Prompt (simplified)
// ============================================================================

/**
 * Build a simplified prompt for quick verification
 * Used when --skip-checks is not set but full analysis is not needed
 */
export function buildQuickCheckPrompt(feature: Feature, diff: string): string {
  const criteriaList = feature.acceptance
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  return `Quickly verify if these changes satisfy the acceptance criteria.

Feature: ${feature.id} - ${feature.description}

Criteria:
${criteriaList}

Changes:
\`\`\`diff
${diff.slice(0, 3000)}${diff.length > 3000 ? "\n... (truncated)" : ""}
\`\`\`

Respond with JSON:
{
  "criteriaResults": [{"index": 0, "satisfied": true/false, "reasoning": "...", "confidence": 0.0-1.0}],
  "verdict": "pass"/"fail"/"needs_review",
  "overallReasoning": "..."
}`;
}
