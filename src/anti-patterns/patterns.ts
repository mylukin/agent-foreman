/**
 * Built-in Anti-Pattern Definitions
 * Standard patterns for detecting workflow violations
 */

import type { AntiPattern } from "./types.js";

/**
 * Built-in anti-patterns for workflow enforcement
 */
export const builtInPatterns: AntiPattern[] = [
  // ============================================================================
  // Workflow Bypass Patterns
  // ============================================================================
  {
    id: "skip-next-command",
    description: "Implementation started without running `agent-foreman next`",
    category: "workflow-bypass",
    severity: "critical",
    detectionPatterns: [
      // Editing source files before running next
      /(?:writing|editing|creating|modifying)\s+(?:the\s+)?(?:file|code|implementation)/i,
      // Starting implementation language
      /(?:let me|I'll|I will|going to)\s+(?:start|begin)\s+(?:implementing|coding|writing)/i,
    ],
    contextPatterns: [
      // Must NOT have evidence of running next first
      /^(?!.*agent-foreman\s+next)/i,
    ],
    excludePatterns: [
      // Exclude if they did run next
      /agent-foreman\s+next/i,
      /ran\s+next/i,
      /after\s+running\s+next/i,
    ],
    remediation: "Run `agent-foreman next <task_id>` before starting implementation",
    example: "I'll start implementing the login feature now...",
    correctExample: "agent-foreman next auth.login\n# Now implementing based on the guidance...",
  },

  {
    id: "skip-check-command",
    description: "Running `done` without verifying with `check` first",
    category: "workflow-bypass",
    severity: "critical",
    detectionPatterns: [
      // Running done without check
      /agent-foreman\s+done\s+\S+(?:\s|$)/,
    ],
    contextPatterns: [
      // Must NOT have evidence of check before done
      /^(?!.*agent-foreman\s+check)/i,
    ],
    excludePatterns: [
      // Exclude if they ran check
      /agent-foreman\s+check/i,
      /after\s+(?:running\s+)?check/i,
      /check\s+passed/i,
    ],
    remediation: "Run `agent-foreman check <task_id>` before `agent-foreman done`",
    example: "agent-foreman done auth.login",
    correctExample: "agent-foreman check auth.login\nagent-foreman done auth.login",
  },

  // ============================================================================
  // File Reading Patterns
  // ============================================================================
  {
    id: "read-index-json",
    description: "Reading index.json directly for workflow decisions",
    category: "file-reading",
    severity: "critical",
    detectionPatterns: [
      // Reading index.json file
      /(?:read|open|cat|view|check)\s+(?:the\s+)?(?:ai\/tasks\/)?index\.json/i,
      /readFileSync\s*\(\s*['"`].*index\.json/i,
      /fs\.read.*index\.json/i,
      /JSON\.parse.*index\.json/i,
    ],
    excludePatterns: [
      // Exclude legitimate documentation references
      /documented\s+in\s+index\.json/i,
      /format\s+of\s+index\.json/i,
    ],
    remediation: "Use `agent-foreman status` to check project status",
    example: "Let me read ai/tasks/index.json to see what tasks are pending...",
    correctExample: "agent-foreman status",
  },

  {
    id: "read-task-for-status",
    description: "Reading task markdown files to determine status",
    category: "file-reading",
    severity: "critical",
    detectionPatterns: [
      // Reading task files for status
      /(?:read|check|view)\s+(?:the\s+)?(?:task|feature)\s+(?:file|status)/i,
      /ai\/tasks\/\S+\.md.*status/i,
      /status.*ai\/tasks\/\S+\.md/i,
      /reading.*\.md.*to\s+(?:check|see|determine|get)\s+(?:the\s+)?status/i,
    ],
    excludePatterns: [
      // Exclude reading for implementation context (after next)
      /acceptance\s+criteria/i,
      /after\s+running\s+next/i,
    ],
    remediation: "Use `agent-foreman status` or `agent-foreman next` to get task status",
    example: "Let me read ai/tasks/auth/login.md to check if it's done...",
    correctExample: "agent-foreman status",
  },

  // ============================================================================
  // Manual Edit Patterns
  // ============================================================================
  {
    id: "edit-task-status",
    description: "Manually editing task file status field",
    category: "manual-edit",
    severity: "critical",
    detectionPatterns: [
      // Editing status in task files
      /(?:edit|update|change|modify)\s+(?:the\s+)?status\s+(?:to|field|in)/i,
      /status:\s*(?:failing|passing|blocked)/i,
      /replace.*status:\s*\w+.*status:\s*\w+/i,
      /writeFileSync.*\.md.*status/i,
    ],
    excludePatterns: [
      // Exclude documentation
      /status\s+values/i,
      /status\s+field\s+(?:is|can\s+be)/i,
    ],
    remediation: "Use `agent-foreman done <task_id>` or `agent-foreman fail <task_id>` to change status",
    example: "I'll update the status field from 'failing' to 'passing'...",
    correctExample: "agent-foreman done auth.login",
  },

  {
    id: "edit-index-json",
    description: "Manually editing index.json file",
    category: "manual-edit",
    severity: "critical",
    detectionPatterns: [
      // Editing index.json
      /(?:edit|update|modify|write)\s+(?:to\s+)?(?:the\s+)?(?:ai\/tasks\/)?index\.json/i,
      /writeFileSync.*index\.json/i,
      /fs\.write.*index\.json/i,
    ],
    excludePatterns: [
      // Exclude CLI commands that modify it
      /agent-foreman/i,
    ],
    remediation: "Never edit index.json directly. Use CLI commands to modify task state.",
    example: "Let me update index.json to mark this task as done...",
    correctExample: "agent-foreman done auth.login",
  },

  // ============================================================================
  // Algorithm Local Patterns
  // ============================================================================
  {
    id: "local-task-selection",
    description: "Implementing task selection algorithm locally instead of using CLI",
    category: "algorithm-local",
    severity: "warning",
    detectionPatterns: [
      // Implementing selection logic
      /sort.*priority/i,
      /filter.*status.*failing/i,
      /find.*next.*task/i,
      /select.*highest.*priority/i,
      /Object\.entries.*features/i,
    ],
    contextPatterns: [
      // In context of task selection
      /task|feature/i,
    ],
    excludePatterns: [
      // Exclude agent-foreman source code itself
      /src\/features\//i,
      /agent-foreman.*implementation/i,
    ],
    remediation: "Use `agent-foreman next` to get the next task. Don't implement selection locally.",
    example: "const nextTask = tasks.filter(t => t.status === 'failing').sort((a,b) => a.priority - b.priority)[0]",
    correctExample: "agent-foreman next",
  },

  // ============================================================================
  // Status Guess Patterns
  // ============================================================================
  {
    id: "assume-task-status",
    description: "Assuming task status without checking via CLI",
    category: "status-guess",
    severity: "warning",
    detectionPatterns: [
      // Assuming or guessing status
      /(?:assume|assuming|guess|guessing)\s+(?:the\s+)?(?:task|feature)\s+(?:is|status)/i,
      /(?:probably|likely|should\s+be)\s+(?:passing|failing|done|complete)/i,
      /I\s+think\s+(?:the\s+)?(?:task|it)\s+is\s+(?:done|complete|passing)/i,
    ],
    excludePatterns: [
      // Exclude after verification
      /check\s+(?:shows|passed|confirmed)/i,
      /verified/i,
    ],
    remediation: "Run `agent-foreman status` or `agent-foreman check <task_id>` to verify status",
    example: "I think the task is probably done now...",
    correctExample: "agent-foreman check auth.login",
  },

  {
    id: "skip-verification-confidence",
    description: "Skipping verification due to confidence in implementation",
    category: "status-guess",
    severity: "warning",
    detectionPatterns: [
      // Confidence-based skipping
      /(?:confident|sure|certain)\s+(?:the\s+)?(?:code|implementation)\s+(?:works|is\s+correct)/i,
      /(?:don't\s+need|no\s+need)\s+(?:to\s+)?(?:check|verify|test)/i,
      /(?:skip|skipping)\s+(?:verification|check|tests)/i,
      /(?:looks|seems)\s+(?:good|correct|fine)\s+(?:to\s+me)?/i,
    ],
    excludePatterns: [
      // Exclude after running check
      /after\s+(?:running\s+)?check/i,
      /check\s+passed/i,
    ],
    remediation: "Always run `agent-foreman check <task_id>` regardless of confidence",
    example: "The code looks good to me, no need to run checks...",
    correctExample: "agent-foreman check auth.login",
  },
];

/**
 * Get all built-in patterns
 */
export function getBuiltInPatterns(): AntiPattern[] {
  return [...builtInPatterns];
}

/**
 * Get built-in patterns by category
 */
export function getBuiltInPatternsByCategory(
  category: import("./types.js").AntiPatternCategory
): AntiPattern[] {
  return builtInPatterns.filter((p) => p.category === category);
}

/**
 * Get built-in pattern IDs
 */
export function getBuiltInPatternIds(): string[] {
  return builtInPatterns.map((p) => p.id);
}
