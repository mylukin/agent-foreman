/**
 * Main gitignore generator module
 *
 * Generates comprehensive .gitignore files based on:
 * - Config file detection (next.config.js → Nextjs)
 * - Language detection (typescript → Node)
 * - Multiple templates combined for polyglot projects
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, basename } from "node:path";
import {
  getBundledTemplate,
  isBundledTemplate,
  BUNDLED_TEMPLATES,
} from "./bundled-templates.js";
import { fetchGitignoreTemplate } from "./github-api.js";

// ============================================================================
// Types
// ============================================================================

export interface GitignoreResult {
  success: boolean;
  action: "created" | "updated" | "skipped" | "error";
  reason: string;
  templates?: string[];
}

export interface GeneratorOptions {
  /** Additional custom patterns to include */
  customPatterns?: string[];
  /** Skip fetching from API (use bundled only) */
  bundledOnly?: boolean;
}

// ============================================================================
// Template Mappings
// ============================================================================

/**
 * Map config files to GitHub template names
 */
export const CONFIG_TO_TEMPLATE: Record<string, string> = {
  // Next.js
  "next.config.js": "Nextjs",
  "next.config.mjs": "Nextjs",
  "next.config.ts": "Nextjs",

  // Vite / Node.js
  "vite.config.js": "Node",
  "vite.config.ts": "Node",
  "vite.config.mjs": "Node",

  // Nuxt
  "nuxt.config.js": "Node",
  "nuxt.config.ts": "Node",

  // SvelteKit
  "svelte.config.js": "Node",
  "svelte.config.ts": "Node",

  // Node.js
  "package.json": "Node",
  "package-lock.json": "Node",
  "yarn.lock": "Node",
  "pnpm-lock.yaml": "Node",

  // Go
  "go.mod": "Go",
  "go.sum": "Go",

  // Rust
  "Cargo.toml": "Rust",
  "Cargo.lock": "Rust",

  // Python
  "pyproject.toml": "Python",
  "requirements.txt": "Python",
  "setup.py": "Python",
  "Pipfile": "Python",
  "poetry.lock": "Python",

  // Java
  "pom.xml": "Java",
  "build.gradle": "Java",
  "build.gradle.kts": "Java",
  "settings.gradle": "Java",
  "settings.gradle.kts": "Java",
};

/**
 * Map detected languages to GitHub template names
 */
export const LANGUAGE_TO_TEMPLATE: Record<string, string> = {
  // JavaScript / TypeScript → Node
  typescript: "Node",
  javascript: "Node",
  nodejs: "Node",
  node: "Node",
  react: "Node",
  vue: "Node",
  angular: "Node",

  // Python
  python: "Python",
  django: "Python",
  flask: "Python",
  fastapi: "Python",

  // Go
  go: "Go",
  golang: "Go",

  // Rust
  rust: "Rust",

  // Java
  java: "Java",
  kotlin: "Java",
  spring: "Java",
  springboot: "Java",

  // Next.js
  next: "Nextjs",
  nextjs: "Nextjs",
};

/**
 * Template display names for section headers
 */
const TEMPLATE_DISPLAY_NAMES: Record<string, string> = {
  Node: "Node.js",
  Python: "Python",
  Go: "Go",
  Rust: "Rust",
  Java: "Java",
  Nextjs: "Next.js",
};

// ============================================================================
// Agent-Foreman Patterns
// ============================================================================

/**
 * Agent-foreman specific patterns (always included)
 */
const AGENT_FOREMAN_PATTERNS = `# === agent-foreman ===
# Auto-generated cache file
ai/capabilities.json
`;

/**
 * Minimal gitignore for immediate protection
 */
export const MINIMAL_GITIGNORE = `# === Essential Protection ===
# Environment variables
.env
.env.*
!.env.example

# Dependencies
node_modules/
vendor/
__pycache__/
.venv/

# Build artifacts
dist/
build/
.next/
target/

# IDE
.idea/
.vscode/
*.swp

# OS
.DS_Store
Thumbs.db
`;

// ============================================================================
// Core Functions
// ============================================================================

/**
 * Get a template by name with priority: bundled → cached → API fetch
 */
export async function getTemplate(
  name: string,
  options: GeneratorOptions = {}
): Promise<string | null> {
  // 1. Try bundled template first (instant, offline)
  if (isBundledTemplate(name)) {
    const bundled = getBundledTemplate(name);
    if (bundled) {
      return bundled;
    }
  }

  // 2. Skip API fetch if bundledOnly option is set
  if (options.bundledOnly) {
    return null;
  }

  // 3. Try API fetch (cached → fresh)
  try {
    const result = await fetchGitignoreTemplate(name);
    return result.source;
  } catch {
    return null;
  }
}

/**
 * Detect templates from config files
 */
export function detectTemplatesFromConfigFiles(
  configFiles: string[]
): string[] {
  const templates = new Set<string>();

  for (const file of configFiles) {
    const fileName = basename(file);
    const template = CONFIG_TO_TEMPLATE[fileName];
    if (template) {
      templates.add(template);
    }
  }

  return Array.from(templates);
}

/**
 * Detect templates from languages
 */
export function detectTemplatesFromLanguages(languages: string[]): string[] {
  const templates = new Set<string>();

  for (const lang of languages) {
    const normalized = lang.toLowerCase().replace(/[^a-z0-9]/g, "");
    const template = LANGUAGE_TO_TEMPLATE[normalized];
    if (template) {
      templates.add(template);
    }
  }

  return Array.from(templates);
}

/**
 * Generate gitignore content from multiple templates
 */
export async function generateGitignoreContent(
  templateNames: string[],
  options: GeneratorOptions = {}
): Promise<string> {
  const sections: string[] = [];

  // Always start with agent-foreman patterns
  sections.push(AGENT_FOREMAN_PATTERNS);

  // Get unique template names
  const uniqueTemplates = [...new Set(templateNames)];

  // Fetch and add each template
  for (const name of uniqueTemplates) {
    const content = await getTemplate(name, options);
    if (content) {
      const displayName = TEMPLATE_DISPLAY_NAMES[name] || name;
      sections.push(`# === ${displayName} ===`);
      sections.push(content.trim());
      sections.push("");
    }
  }

  // Add custom patterns if provided
  if (options.customPatterns && options.customPatterns.length > 0) {
    sections.push("# === Custom ===");
    sections.push(options.customPatterns.join("\n"));
    sections.push("");
  }

  return sections.join("\n");
}

/**
 * Generate gitignore for a project based on config files and languages
 */
export async function generateGitignore(
  configFiles: string[],
  languages: string[],
  options: GeneratorOptions = {}
): Promise<string> {
  // Detect templates from config files (more precise)
  const configTemplates = detectTemplatesFromConfigFiles(configFiles);

  // Detect templates from languages (broader fallback)
  const langTemplates = detectTemplatesFromLanguages(languages);

  // Combine, prioritizing config file detection
  const allTemplates = [...new Set([...configTemplates, ...langTemplates])];

  // If no templates detected, use Node as default for JS/TS projects
  if (allTemplates.length === 0) {
    allTemplates.push("Node");
  }

  return generateGitignoreContent(allTemplates, options);
}

// ============================================================================
// File Operations
// ============================================================================

/**
 * Ensure minimal gitignore exists (for gitInit)
 */
export function ensureMinimalGitignore(cwd: string): GitignoreResult {
  const gitignorePath = join(cwd, ".gitignore");

  if (existsSync(gitignorePath)) {
    return {
      success: true,
      action: "skipped",
      reason: ".gitignore already exists",
    };
  }

  try {
    writeFileSync(gitignorePath, MINIMAL_GITIGNORE);
    return {
      success: true,
      action: "created",
      reason: "Created minimal .gitignore for immediate protection",
    };
  } catch (error) {
    return {
      success: false,
      action: "error",
      reason: `Failed to create .gitignore: ${(error as Error).message}`,
    };
  }
}

/**
 * Get patterns that are missing from existing gitignore
 */
function getMissingPatterns(
  existingContent: string,
  requiredPatterns: string[]
): string[] {
  const lines = existingContent
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"));

  return requiredPatterns.filter((pattern) => {
    const normalized = pattern.replace(/\/$/, "");
    return !lines.some((line) => {
      const normalizedLine = line.replace(/\/$/, "");
      return normalizedLine === normalized || normalizedLine === pattern;
    });
  });
}

/**
 * Ensure comprehensive gitignore exists (for generateHarnessFiles)
 */
export async function ensureComprehensiveGitignore(
  cwd: string,
  configFiles: string[],
  languages: string[],
  options: GeneratorOptions = {}
): Promise<GitignoreResult> {
  const gitignorePath = join(cwd, ".gitignore");

  // Detect templates
  const configTemplates = detectTemplatesFromConfigFiles(configFiles);
  const langTemplates = detectTemplatesFromLanguages(languages);
  const allTemplates = [...new Set([...configTemplates, ...langTemplates])];

  // If .gitignore doesn't exist, create it
  if (!existsSync(gitignorePath)) {
    try {
      const content = await generateGitignoreContent(allTemplates, options);
      writeFileSync(gitignorePath, content);
      return {
        success: true,
        action: "created",
        reason: `Generated from ${allTemplates.length} template(s)`,
        templates: allTemplates,
      };
    } catch (error) {
      return {
        success: false,
        action: "error",
        reason: `Failed to create .gitignore: ${(error as Error).message}`,
      };
    }
  }

  // .gitignore exists - check for missing essential patterns
  const existingContent = readFileSync(gitignorePath, "utf-8");

  // Essential patterns that should be present
  const essentialPatterns = ["ai/capabilities.json"];

  // Add language-specific essential patterns
  if (
    allTemplates.includes("Node") ||
    allTemplates.includes("Nextjs")
  ) {
    essentialPatterns.push("node_modules/");
  }
  if (allTemplates.includes("Python")) {
    essentialPatterns.push("__pycache__/", ".venv/");
  }
  if (allTemplates.includes("Go")) {
    essentialPatterns.push("vendor/");
  }
  if (allTemplates.includes("Rust")) {
    essentialPatterns.push("target/");
  }
  if (allTemplates.includes("Nextjs")) {
    essentialPatterns.push(".next/");
  }

  const missingPatterns = getMissingPatterns(existingContent, essentialPatterns);

  if (missingPatterns.length === 0) {
    return {
      success: true,
      action: "skipped",
      reason: ".gitignore already has essential patterns",
    };
  }

  // Append missing patterns
  try {
    const appendContent = `\n# === Added by agent-foreman ===\n${missingPatterns.join("\n")}\n`;
    writeFileSync(gitignorePath, existingContent.trimEnd() + appendContent);
    return {
      success: true,
      action: "updated",
      reason: `Added ${missingPatterns.length} missing pattern(s)`,
      templates: allTemplates,
    };
  } catch (error) {
    return {
      success: false,
      action: "error",
      reason: `Failed to update .gitignore: ${(error as Error).message}`,
    };
  }
}
