/**
 * Spec Compliance Check (Layer 2.5)
 *
 * Two-stage verification inspired by superpowers:
 * 1. Spec Compliance: Does the implementation match acceptance criteria EXACTLY?
 * 2. Over-engineering Detection: Did we build things not requested?
 *
 * This catches the common failure mode: "well-written code that doesn't match requirements"
 */

import chalk from "chalk";

import type { Feature } from "../types/index.js";
import { callAnyAvailableAgent } from "../agents.js";
import { getTimeout } from "../timeout-config.js";

/**
 * Result of spec compliance check for a single criterion
 */
export interface CriterionComplianceResult {
  criterion: string;
  satisfied: boolean;
  evidence: string;
  fileReferences: string[];
}

/**
 * Over-engineering detection result
 */
export interface OverEngineeringResult {
  detected: boolean;
  extras: string[];
  reasoning: string;
}

/**
 * Complete spec compliance result
 */
export interface SpecComplianceResult {
  taskId: string;
  compliant: boolean;
  criteriaResults: CriterionComplianceResult[];
  overEngineering: OverEngineeringResult;
  missingCriteria: string[];
  summary: string;
  duration: number;
}

/**
 * Build the spec compliance prompt
 *
 * Key insight from superpowers: "Do NOT trust the report - read actual code"
 */
function buildSpecCompliancePrompt(
  feature: Feature,
  diff: string,
  changedFiles: string[]
): string {
  const criteriaList = feature.acceptance
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  return `# Spec Compliance Review

You are reviewing whether an implementation matches its specification.

## CRITICAL: Do Not Trust Self-Reports

The implementer may have:
- Claimed to implement something they didn't
- Misunderstood the requirements
- Over-engineered or under-engineered the solution

**You MUST verify everything independently by reading the actual code.**

## Task: ${feature.id}

### Description
${feature.description}

### Acceptance Criteria (What Was Requested)
${criteriaList}

### Changed Files
${changedFiles.map((f) => `- ${f}`).join("\n")}

### Code Changes (Git Diff)
\`\`\`diff
${diff.slice(0, 15000)}${diff.length > 15000 ? "\n... (truncated)" : ""}
\`\`\`

## Your Job

Read the implementation code and verify:

### 1. Missing Requirements
For EACH acceptance criterion, determine:
- Is it fully implemented?
- Is there evidence in the code?
- What file:line proves it?

### 2. Extra/Unneeded Work (Over-Engineering)
Check if the implementer:
- Built features not in the spec
- Added "nice to have" functionality
- Over-abstracted or over-generalized

### 3. Misunderstandings
Check if the implementer:
- Interpreted requirements differently than intended
- Solved the wrong problem
- Implemented correctly but for wrong use case

## Response Format

Respond in this exact JSON format:

\`\`\`json
{
  "criteriaResults": [
    {
      "criterion": "exact text of criterion",
      "satisfied": true/false,
      "evidence": "description of what code proves this",
      "fileReferences": ["file:line", "file:line"]
    }
  ],
  "overEngineering": {
    "detected": true/false,
    "extras": ["feature not requested 1", "feature not requested 2"],
    "reasoning": "explanation"
  },
  "missingCriteria": ["criterion text that is NOT satisfied"],
  "summary": "one-line summary: COMPLIANT or NOT COMPLIANT with reason"
}
\`\`\`

**IMPORTANT:** Be skeptical. Assume the implementation may be incomplete until proven otherwise.`;
}

/**
 * Parse the spec compliance response from AI
 */
function parseSpecComplianceResponse(response: string): {
  criteriaResults: CriterionComplianceResult[];
  overEngineering: OverEngineeringResult;
  missingCriteria: string[];
  summary: string;
} | null {
  try {
    // Extract JSON from response
    const jsonMatch = response.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      return {
        criteriaResults: parsed.criteriaResults || [],
        overEngineering: parsed.overEngineering || {
          detected: false,
          extras: [],
          reasoning: "",
        },
        missingCriteria: parsed.missingCriteria || [],
        summary: parsed.summary || "Unable to determine compliance",
      };
    }

    // Try parsing the whole response as JSON
    const parsed = JSON.parse(response);
    return {
      criteriaResults: parsed.criteriaResults || [],
      overEngineering: parsed.overEngineering || {
        detected: false,
        extras: [],
        reasoning: "",
      },
      missingCriteria: parsed.missingCriteria || [],
      summary: parsed.summary || "Unable to determine compliance",
    };
  } catch {
    return null;
  }
}

/**
 * Run spec compliance check for a feature
 */
export async function checkSpecCompliance(
  _cwd: string,
  feature: Feature,
  diff: string,
  changedFiles: string[],
  options: { verbose?: boolean } = {}
): Promise<SpecComplianceResult> {
  const startTime = Date.now();
  const { verbose = false } = options;

  // Build prompt
  const prompt = buildSpecCompliancePrompt(feature, diff, changedFiles);

  if (verbose) {
    console.log(chalk.gray(`  Checking spec compliance for ${feature.id}...`));
  }

  // Call AI agent
  const timeoutMs = getTimeout("AI_VERIFICATION");
  const result = await callAnyAvailableAgent(prompt, { timeoutMs, verbose });

  if (!result.success || !result.output) {
    return {
      taskId: feature.id,
      compliant: false,
      criteriaResults: [],
      overEngineering: { detected: false, extras: [], reasoning: "" },
      missingCriteria: feature.acceptance,
      summary: `AI agent failed: ${result.error || "No output"}`,
      duration: Date.now() - startTime,
    };
  }

  // Parse response
  const parsed = parseSpecComplianceResponse(result.output);

  if (!parsed) {
    return {
      taskId: feature.id,
      compliant: false,
      criteriaResults: [],
      overEngineering: { detected: false, extras: [], reasoning: "" },
      missingCriteria: feature.acceptance,
      summary: "Failed to parse AI response",
      duration: Date.now() - startTime,
    };
  }

  // Determine compliance
  const allCriteriaSatisfied = parsed.criteriaResults.every((r) => r.satisfied);
  const noMissingCriteria = parsed.missingCriteria.length === 0;
  const compliant = allCriteriaSatisfied && noMissingCriteria;

  return {
    taskId: feature.id,
    compliant,
    criteriaResults: parsed.criteriaResults,
    overEngineering: parsed.overEngineering,
    missingCriteria: parsed.missingCriteria,
    summary: parsed.summary,
    duration: Date.now() - startTime,
  };
}

/**
 * Display spec compliance result
 */
export function displaySpecComplianceResult(
  result: SpecComplianceResult,
  verbose: boolean = false
): void {
  const icon = result.compliant ? chalk.green("✓") : chalk.red("✗");
  const status = result.compliant ? "COMPLIANT" : "NOT COMPLIANT";

  console.log(`│ ${icon} ${result.taskId}: ${status}`);

  if (!result.compliant || verbose) {
    // Show criteria results
    if (result.criteriaResults.length > 0) {
      console.log(chalk.gray("│   Criteria:"));
      for (const cr of result.criteriaResults) {
        const crIcon = cr.satisfied ? chalk.green("✓") : chalk.red("✗");
        const criterionShort =
          cr.criterion.length > 50
            ? cr.criterion.slice(0, 47) + "..."
            : cr.criterion;
        console.log(`│     ${crIcon} ${criterionShort}`);
        if (!cr.satisfied && cr.evidence) {
          console.log(chalk.gray(`│       → ${cr.evidence}`));
        }
      }
    }

    // Show missing criteria
    if (result.missingCriteria.length > 0) {
      console.log(chalk.red("│   Missing:"));
      for (const mc of result.missingCriteria) {
        console.log(chalk.red(`│     ✗ ${mc}`));
      }
    }

    // Show over-engineering
    if (result.overEngineering.detected) {
      console.log(chalk.yellow("│   Over-engineering detected:"));
      for (const extra of result.overEngineering.extras) {
        console.log(chalk.yellow(`│     ⚠ ${extra}`));
      }
    }
  }
}

/**
 * Run spec compliance checks for multiple features
 */
export async function runSpecComplianceChecks(
  cwd: string,
  features: Feature[],
  diff: string,
  changedFiles: string[],
  options: { verbose?: boolean } = {}
): Promise<SpecComplianceResult[]> {
  const results: SpecComplianceResult[] = [];

  for (const feature of features) {
    const result = await checkSpecCompliance(
      cwd,
      feature,
      diff,
      changedFiles,
      options
    );
    results.push(result);
  }

  return results;
}
