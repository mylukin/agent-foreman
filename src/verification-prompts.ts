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
// Configuration
// ============================================================================

/** Default maximum diff size in characters */
export const DEFAULT_MAX_DIFF_SIZE = 10000;

/** Minimum context lines to keep around changes */
const MIN_CONTEXT_LINES = 3;

// ============================================================================
// Diff Truncation Options
// ============================================================================

export interface DiffTruncationOptions {
  /** Maximum diff size in characters (default: 10000) */
  maxSize?: number;
  /** Whether to log warnings when truncation occurs */
  logWarnings?: boolean;
}

// ============================================================================
// Intelligent Diff Truncation
// ============================================================================

/**
 * Truncate a diff intelligently, preserving file headers and context
 *
 * Strategy:
 * 1. Parse diff into file sections
 * 2. Keep all file headers (diff --git, +++, ---)
 * 3. Keep hunk headers (@@ ... @@)
 * 4. Prioritize changed lines (+/-) over context
 * 5. If still too large, truncate per-file proportionally
 *
 * @param diff - The full git diff string
 * @param options - Truncation options
 * @returns Truncated diff with metadata
 */
export function truncateDiffIntelligently(
  diff: string,
  options: DiffTruncationOptions = {}
): { diff: string; wasTruncated: boolean; originalSize: number; truncatedSize: number } {
  const { maxSize = DEFAULT_MAX_DIFF_SIZE, logWarnings = true } = options;

  const originalSize = diff.length;

  // If diff is within limits, return as-is
  if (originalSize <= maxSize) {
    return { diff, wasTruncated: false, originalSize, truncatedSize: originalSize };
  }

  // Parse diff into file sections
  const fileSections = parseDiffIntoSections(diff);

  if (fileSections.length === 0) {
    // Can't parse, fall back to simple truncation
    const truncated = diff.slice(0, maxSize) + "\n\n... (diff truncated, showing first " + maxSize + " chars)";
    if (logWarnings) {
      console.warn(`[verification-prompts] Diff truncated: ${originalSize} -> ${truncated.length} chars (simple truncation)`);
    }
    return { diff: truncated, wasTruncated: true, originalSize, truncatedSize: truncated.length };
  }

  // Calculate budget per file (proportional to original size)
  const headerBudget = 500; // Reserve for headers
  const availableBudget = maxSize - headerBudget;
  const totalOriginalContent = fileSections.reduce((sum, s) => sum + s.content.length, 0);

  // Build truncated sections
  const truncatedSections: string[] = [];
  let currentSize = 0;

  for (const section of fileSections) {
    // Calculate this file's budget proportionally
    const fileBudget = Math.floor((section.content.length / totalOriginalContent) * availableBudget);

    // Always include file header
    let sectionOutput = section.header + "\n";

    if (section.content.length <= fileBudget) {
      // Content fits within budget
      sectionOutput += section.content;
    } else {
      // Need to truncate this file's content
      sectionOutput += truncateFileContent(section.content, fileBudget);
    }

    truncatedSections.push(sectionOutput);
    currentSize += sectionOutput.length;
  }

  const result = truncatedSections.join("\n");
  const truncatedSize = result.length;

  if (logWarnings) {
    console.warn(`[verification-prompts] Diff truncated: ${originalSize} -> ${truncatedSize} chars (${fileSections.length} files)`);
  }

  return {
    diff: result + "\n\n... (diff intelligently truncated from " + originalSize + " to " + truncatedSize + " chars)",
    wasTruncated: true,
    originalSize,
    truncatedSize,
  };
}

/**
 * Parse a diff into file sections
 */
interface DiffSection {
  header: string;
  content: string;
  filePath: string;
}

function parseDiffIntoSections(diff: string): DiffSection[] {
  const sections: DiffSection[] = [];
  const lines = diff.split("\n");

  let currentSection: DiffSection | null = null;
  let contentLines: string[] = [];

  for (const line of lines) {
    // New file starts with "diff --git"
    if (line.startsWith("diff --git ")) {
      // Save previous section
      if (currentSection) {
        currentSection.content = contentLines.join("\n");
        sections.push(currentSection);
      }

      // Extract file path from "diff --git a/path b/path"
      const match = line.match(/diff --git a\/(.+) b\/(.+)/);
      const filePath = match ? match[2] : "unknown";

      currentSection = {
        header: line,
        content: "",
        filePath,
      };
      contentLines = [];
    } else if (currentSection) {
      // File metadata lines (index, ---, +++) go in header
      if (
        line.startsWith("index ") ||
        line.startsWith("--- ") ||
        line.startsWith("+++ ") ||
        line.startsWith("new file mode") ||
        line.startsWith("deleted file mode") ||
        line.startsWith("old mode") ||
        line.startsWith("new mode")
      ) {
        currentSection.header += "\n" + line;
      } else {
        contentLines.push(line);
      }
    }
  }

  // Save last section
  if (currentSection) {
    currentSection.content = contentLines.join("\n");
    sections.push(currentSection);
  }

  return sections;
}

/**
 * Truncate file content while preserving hunk structure
 */
function truncateFileContent(content: string, budget: number): string {
  const lines = content.split("\n");
  const result: string[] = [];
  let currentSize = 0;
  let inHunk = false;
  let hunkLinesKept = 0;
  let skippedLines = 0;

  for (const line of lines) {
    // Always keep hunk headers
    if (line.startsWith("@@")) {
      if (skippedLines > 0) {
        result.push(`... (${skippedLines} lines omitted)`);
        skippedLines = 0;
      }
      result.push(line);
      currentSize += line.length + 1;
      inHunk = true;
      hunkLinesKept = 0;
      continue;
    }

    // Prioritize changed lines over context
    const isChange = line.startsWith("+") || line.startsWith("-");
    const isContext = line.startsWith(" ");

    if (currentSize + line.length + 1 > budget) {
      // Budget exceeded
      if (isChange) {
        // Try to fit changed lines even over budget (they're most important)
        if (currentSize + line.length + 1 < budget * 1.1) {
          result.push(line);
          currentSize += line.length + 1;
          hunkLinesKept++;
        } else {
          skippedLines++;
        }
      } else {
        skippedLines++;
      }
    } else {
      // Within budget
      if (isChange || (isContext && hunkLinesKept < MIN_CONTEXT_LINES * 2)) {
        result.push(line);
        currentSize += line.length + 1;
        hunkLinesKept++;
      } else {
        // Skip extra context to save space
        skippedLines++;
      }
    }
  }

  if (skippedLines > 0) {
    result.push(`... (${skippedLines} lines omitted)`);
  }

  return result.join("\n");
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build a comprehensive verification prompt for AI analysis
 *
 * @param feature - The feature being verified
 * @param diff - The git diff (will be truncated if too large)
 * @param changedFiles - List of changed file paths
 * @param automatedResults - Results from automated checks
 * @param relatedFileContents - Optional map of file contents for context
 * @param options - Optional truncation options
 */
export function buildVerificationPrompt(
  feature: Feature,
  diff: string,
  changedFiles: string[],
  automatedResults: AutomatedCheckResult[],
  relatedFileContents?: Map<string, string>,
  options?: DiffTruncationOptions
): string {
  const criteriaList = feature.acceptance
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const automatedChecksSummary = formatAutomatedChecks(automatedResults);

  const relatedFilesSection = relatedFileContents
    ? formatRelatedFiles(relatedFileContents)
    : "";

  // Apply intelligent diff truncation
  const { diff: truncatedDiff } = truncateDiffIntelligently(diff, options);

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
${truncatedDiff}
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
