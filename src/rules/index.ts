/**
 * Rules module for managing agent-foreman rule templates
 *
 * This module provides functions to copy rule templates to project's .claude/rules/ directory.
 * Claude Code automatically loads all .md files from .claude/rules/ as project memory.
 */

import { existsSync, readFileSync } from "node:fs";
import * as fs from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Try to import embedded rules (available in compiled binary)
// Falls back to file system access in development mode
let EMBEDDED_RULES: Record<string, string> = {};
try {
  const embedded = await import("./embedded-rules.generated.js");
  EMBEDDED_RULES = embedded.EMBEDDED_RULES;
} catch {
  // Not in compiled mode or generated file doesn't exist
}

/**
 * List of bundled rule template names (in order)
 */
export const RULE_TEMPLATES = [
  "00-overview",
  "01-workflow",
  "02-rules",
  "03-commands",
  "04-feature-schema",
  "05-tdd",
  "06-progress-log",
] as const;

export type RuleTemplateName = (typeof RULE_TEMPLATES)[number];

/**
 * Check if a template name is a valid rule template
 */
export function isRuleTemplate(name: string): name is RuleTemplateName {
  return RULE_TEMPLATES.includes(name as RuleTemplateName);
}

/**
 * Get the path to a rule template file
 */
export function getRuleTemplatePath(name: RuleTemplateName): string {
  return join(__dirname, "templates", `${name}.md`);
}

/**
 * Get a rule template by name (synchronous)
 * Returns null if template doesn't exist
 *
 * Priority:
 * 1. Embedded templates (for compiled binary)
 * 2. File system (for development)
 */
export function getRuleTemplate(name: string): string | null {
  if (!isRuleTemplate(name)) {
    return null;
  }

  // Try embedded templates first (compiled binary mode)
  if (EMBEDDED_RULES[name]) {
    return EMBEDDED_RULES[name];
  }

  // Fall back to file system (development mode)
  const templatePath = getRuleTemplatePath(name);

  if (!existsSync(templatePath)) {
    return null;
  }

  return readFileSync(templatePath, "utf-8");
}

/**
 * Get all rule templates as a map
 */
export function getAllRuleTemplates(): Map<RuleTemplateName, string> {
  const templates = new Map<RuleTemplateName, string>();

  for (const name of RULE_TEMPLATES) {
    const content = getRuleTemplate(name);
    if (content) {
      templates.set(name, content);
    }
  }

  return templates;
}

/**
 * Options for copying rules to project
 */
export interface CopyRulesOptions {
  /** Force overwrite existing files */
  force?: boolean;
  /** Verbose output */
  verbose?: boolean;
}

/**
 * Result of copying rules to project
 */
export interface CopyRulesResult {
  /** Number of files created */
  created: number;
  /** Number of files skipped (already exist) */
  skipped: number;
  /** List of created file names */
  createdFiles: string[];
  /** List of skipped file names */
  skippedFiles: string[];
}

/**
 * Copy rule templates to project's .claude/rules/ directory
 *
 * @param cwd - Project root directory
 * @param options - Copy options
 * @returns Result with counts and file lists
 */
export async function copyRulesToProject(
  cwd: string,
  options: CopyRulesOptions = {}
): Promise<CopyRulesResult> {
  const { force = false } = options;

  const rulesDir = join(cwd, ".claude", "rules");
  const result: CopyRulesResult = {
    created: 0,
    skipped: 0,
    createdFiles: [],
    skippedFiles: [],
  };

  // Ensure .claude/rules/ directory exists
  await fs.mkdir(rulesDir, { recursive: true });

  // Copy each rule template
  for (const name of RULE_TEMPLATES) {
    const content = getRuleTemplate(name);
    if (!content) {
      continue;
    }

    const destPath = join(rulesDir, `${name}.md`);

    // Check if file already exists
    if (!force && existsSync(destPath)) {
      result.skipped++;
      result.skippedFiles.push(`${name}.md`);
      continue;
    }

    // Write the file
    await fs.writeFile(destPath, content);
    result.created++;
    result.createdFiles.push(`${name}.md`);
  }

  return result;
}

/**
 * Check if all rule templates are available
 */
export function verifyRuleTemplates(): {
  available: RuleTemplateName[];
  missing: RuleTemplateName[];
} {
  const available: RuleTemplateName[] = [];
  const missing: RuleTemplateName[] = [];

  for (const name of RULE_TEMPLATES) {
    // Check embedded first, then file system
    if (EMBEDDED_RULES[name]) {
      available.push(name);
    } else {
      const templatePath = getRuleTemplatePath(name);
      if (existsSync(templatePath)) {
        available.push(name);
      } else {
        missing.push(name);
      }
    }
  }

  return { available, missing };
}

/**
 * Check if rules are already installed in a project
 */
export function hasRulesInstalled(cwd: string): boolean {
  const rulesDir = join(cwd, ".claude", "rules");
  if (!existsSync(rulesDir)) {
    return false;
  }

  // Check if at least one rule file exists
  for (const name of RULE_TEMPLATES) {
    const filePath = join(rulesDir, `${name}.md`);
    if (existsSync(filePath)) {
      return true;
    }
  }

  return false;
}
