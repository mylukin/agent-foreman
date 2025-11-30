/**
 * AI-based capability discovery for unknown project types
 * Uses AI agents to analyze project structure and discover verification commands
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { callAnyAvailableAgent } from "./agents.js";
import { getTimeout } from "./timeout-config.js";
import type {
  ExtendedCapabilities,
  CapabilityCommand,
  CustomRule,
  CustomRuleType,
} from "./verification-types.js";
import { debugDiscovery } from "./debug.js";
import { fileExists, findFiles as findFilesShared } from "./file-utils.js";

// ============================================================================
// Types
// ============================================================================

/**
 * Project context for AI analysis
 */
export interface ProjectContext {
  /** Config files found in project root */
  configFiles: string[];
  /** Build system files found */
  buildFiles: string[];
  /** Directory structure (tree output) */
  directoryStructure: string;
  /** Sample source files with content */
  sampleFiles: Array<{ path: string; content: string }>;
}

/**
 * AI response structure for capability discovery
 */
interface AICapabilityResponse {
  languages: string[];
  test?: {
    available: boolean;
    command?: string;
    framework?: string;
    confidence?: number;
  };
  typecheck?: {
    available: boolean;
    command?: string;
    confidence?: number;
  };
  lint?: {
    available: boolean;
    command?: string;
    confidence?: number;
  };
  build?: {
    available: boolean;
    command?: string;
    confidence?: number;
  };
  customRules?: Array<{
    id: string;
    description: string;
    command: string;
    type: string;
  }>;
}

// ============================================================================
// Configuration
// ============================================================================

/** Config file patterns to search for */
const CONFIG_FILE_PATTERNS = [
  // Package managers & build files
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Makefile",
  "CMakeLists.txt",
  "Gemfile",
  "composer.json",
  "mix.exs",
  "pyproject.toml",
  "setup.py",
  "deno.json",
  // Config files
  "tsconfig.json",
  ".eslintrc.js",
  ".eslintrc.json",
  "eslint.config.js",
  "eslint.config.mjs",
  "biome.json",
  "jest.config.js",
  "jest.config.ts",
  "vitest.config.ts",
  "vitest.config.js",
  "pytest.ini",
  "mypy.ini",
  "ruff.toml",
  ".rspec",
  // CI config
  ".github/workflows",
  ".gitlab-ci.yml",
  "Jenkinsfile",
  ".travis.yml",
  "azure-pipelines.yml",
];

/** Build file patterns */
const BUILD_FILE_PATTERNS = [
  "package.json",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "Makefile",
  "CMakeLists.txt",
  "Gemfile",
  "composer.json",
  "mix.exs",
  "pyproject.toml",
  "setup.py",
  "deno.json",
  "bun.lockb",
];

/** Source file extensions to sample */
const SOURCE_EXTENSIONS = [
  ".java",
  ".kt",
  ".scala",
  ".rb",
  ".php",
  ".ex",
  ".exs",
  ".erl",
  ".cs",
  ".fs",
  ".swift",
  ".m",
  ".c",
  ".cpp",
  ".h",
  ".hpp",
  ".zig",
  ".nim",
  ".cr",
  ".dart",
  ".lua",
  ".pl",
  ".pm",
  ".r",
  ".R",
  ".jl",
  ".clj",
  ".cljs",
  ".hs",
  ".ml",
  ".elm",
  ".v",
  ".sol",
];

/** Max files to sample */
const MAX_SAMPLE_FILES = 5;

/** Max content per file (characters) */
const MAX_CONTENT_PER_FILE = 1000;

// ============================================================================
// Context Collection
// ============================================================================

/**
 * Find config files in project
 * Uses shared findFiles utility
 */
async function findConfigFiles(cwd: string): Promise<string[]> {
  return findFilesShared(cwd, CONFIG_FILE_PATTERNS);
}

/**
 * Find build files in project
 * Uses shared findFiles utility
 */
async function findBuildFiles(cwd: string): Promise<string[]> {
  return findFilesShared(cwd, BUILD_FILE_PATTERNS);
}

/**
 * Get directory structure using safe Node.js file system operations
 * Avoids shell commands to prevent command injection
 */
async function getDirectoryStructure(cwd: string): Promise<string> {
  const ignoreDirs = new Set([
    "node_modules",
    ".git",
    "__pycache__",
    ".venv",
    "target",
    "dist",
    "build",
    ".next",
    ".nuxt",
    "coverage",
    ".cache",
  ]);

  const lines: string[] = [];
  const maxDepth = 2;
  const maxItems = 50;

  /**
   * Recursively build directory tree using pure Node.js
   */
  async function buildTree(dir: string, prefix: string, depth: number): Promise<void> {
    if (depth > maxDepth || lines.length >= maxItems) {
      return;
    }

    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      const filtered = entries.filter(
        (e) => !e.name.startsWith(".") && !ignoreDirs.has(e.name)
      );

      // Sort: directories first, then files
      const sorted = filtered.sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1;
        if (!a.isDirectory() && b.isDirectory()) return 1;
        return a.name.localeCompare(b.name);
      });

      for (let i = 0; i < sorted.length && lines.length < maxItems; i++) {
        const entry = sorted[i];
        const isLast = i === sorted.length - 1;
        const connector = isLast ? "└── " : "├── ";
        const childPrefix = isLast ? "    " : "│   ";

        lines.push(`${prefix}${connector}${entry.name}${entry.isDirectory() ? "/" : ""}`);

        if (entry.isDirectory()) {
          await buildTree(path.join(dir, entry.name), prefix + childPrefix, depth + 1);
        }
      }
    } catch (error) {
      debugDiscovery("Directory traversal error: %s", (error as Error).message);
    }
  }

  try {
    lines.push("./");
    await buildTree(cwd, "", 0);
    return lines.join("\n").slice(0, 2000);
  } catch (error) {
    debugDiscovery("buildTree failed: %s", (error as Error).message);
    // Fallback: just list top-level directories
    try {
      const entries = await fs.readdir(cwd, { withFileTypes: true });
      const dirs = entries
        .filter((e) => e.isDirectory() && !e.name.startsWith(".") && !ignoreDirs.has(e.name))
        .map((e) => e.name)
        .slice(0, 20);
      return `Directories: ${dirs.join(", ")}`;
    } catch (fallbackError) {
      debugDiscovery("Fallback directory read failed: %s", (fallbackError as Error).message);
      return "Unable to read directory structure";
    }
  }
}

/**
 * Find and read sample source files
 */
async function getSampleSourceFiles(
  cwd: string
): Promise<Array<{ path: string; content: string }>> {
  const samples: Array<{ path: string; content: string }> = [];

  // Walk src/ or lib/ or root to find source files
  const searchDirs = ["src", "lib", "app", "pkg", "."];

  for (const dir of searchDirs) {
    if (samples.length >= MAX_SAMPLE_FILES) break;

    const searchPath = path.join(cwd, dir);
    try {
      const stat = await fs.stat(searchPath);
      if (!stat.isDirectory()) continue;

      const files = await findSourceFilesRecursive(searchPath, cwd, 2);
      for (const file of files) {
        if (samples.length >= MAX_SAMPLE_FILES) break;

        try {
          const content = await fs.readFile(file, "utf-8");
          samples.push({
            path: path.relative(cwd, file),
            content: content.slice(0, MAX_CONTENT_PER_FILE),
          });
        } catch (error) {
          debugDiscovery("Failed to read source file %s: %s", file, (error as Error).message);
        }
      }
    } catch (error) {
      debugDiscovery("Failed to access search dir %s: %s", dir, (error as Error).message);
    }
  }

  return samples;
}

/**
 * Recursively find source files up to max depth
 */
async function findSourceFilesRecursive(
  dir: string,
  cwd: string,
  maxDepth: number
): Promise<string[]> {
  if (maxDepth <= 0) return [];

  const files: string[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      // Skip hidden and common ignore directories
      if (
        entry.name.startsWith(".") ||
        entry.name === "node_modules" ||
        entry.name === "__pycache__" ||
        entry.name === "target" ||
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === ".venv" ||
        entry.name === "vendor"
      ) {
        continue;
      }

      const fullPath = path.join(dir, entry.name);

      if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (SOURCE_EXTENSIONS.includes(ext)) {
          files.push(fullPath);
        }
      } else if (entry.isDirectory()) {
        const subFiles = await findSourceFilesRecursive(
          fullPath,
          cwd,
          maxDepth - 1
        );
        files.push(...subFiles);
      }
    }
  } catch (error) {
    debugDiscovery("Recursive file search error in %s: %s", dir, (error as Error).message);
  }

  return files;
}

/**
 * Collect project context for AI analysis
 */
export async function collectProjectContext(
  cwd: string
): Promise<ProjectContext> {
  const [configFiles, buildFiles, directoryStructure, sampleFiles] =
    await Promise.all([
      findConfigFiles(cwd),
      findBuildFiles(cwd),
      getDirectoryStructure(cwd),
      getSampleSourceFiles(cwd),
    ]);

  return {
    configFiles,
    buildFiles,
    directoryStructure,
    sampleFiles,
  };
}

// ============================================================================
// Prompt Building
// ============================================================================

/**
 * Build prompt for AI capability discovery
 */
export function buildCapabilityDiscoveryPrompt(context: ProjectContext): string {
  const configSection =
    context.configFiles.length > 0
      ? context.configFiles.map((f) => `- ${f}`).join("\n")
      : "None detected";

  const buildSection =
    context.buildFiles.length > 0
      ? context.buildFiles.map((f) => `- ${f}`).join("\n")
      : "None detected";

  const sampleSection =
    context.sampleFiles.length > 0
      ? context.sampleFiles
          .map((f) => `\n--- ${f.path} ---\n${f.content}`)
          .join("\n")
      : "No source files found";

  return `You are analyzing a software project to discover its verification capabilities.

## Project Context

### Config Files Found
${configSection}

### Build Files Found
${buildSection}

### Directory Structure
${context.directoryStructure}

### Sample Source Files
${sampleSection}

## Your Task

Analyze this project and determine:
1. What programming language(s) is this project using?
2. How to run tests (command, framework)
3. How to run type checking (if applicable)
4. How to run linting (if applicable)
5. How to build the project

Return ONLY valid JSON (no markdown, no explanation):
{
  "languages": ["java"],
  "test": {
    "available": true,
    "command": "./gradlew test",
    "framework": "junit",
    "confidence": 0.95
  },
  "typecheck": {
    "available": true,
    "command": "./gradlew compileJava",
    "confidence": 0.9
  },
  "lint": {
    "available": true,
    "command": "./gradlew checkstyleMain",
    "confidence": 0.85
  },
  "build": {
    "available": true,
    "command": "./gradlew build",
    "confidence": 0.95
  },
  "customRules": [
    {
      "id": "integration-test",
      "description": "Run integration tests",
      "command": "./gradlew integrationTest",
      "type": "test"
    }
  ]
}

Important:
- Set "available": false if you cannot determine a command
- Use confidence between 0.0 and 1.0 to indicate certainty
- Only include customRules for additional project-specific commands
- Return ONLY the JSON object, no other text`;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Extract JSON from AI response (handles markdown code blocks)
 */
function extractJSON(response: string): string {
  // Try to extract from markdown code block
  const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  // Try to find JSON object directly
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return response;
}

/**
 * Parse and validate AI response for capability discovery
 */
export function parseCapabilityResponse(
  response: string
): { success: true; data: AICapabilityResponse } | { success: false; error: string } {
  try {
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr) as AICapabilityResponse;

    // Validate required fields
    if (!parsed.languages || !Array.isArray(parsed.languages)) {
      return { success: false, error: "Missing or invalid 'languages' field" };
    }

    return { success: true, data: parsed };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse JSON: ${(error as Error).message}`,
    };
  }
}

/**
 * Convert AI response to CapabilityCommand
 */
function toCapabilityCommand(
  info?: { available: boolean; command?: string; framework?: string; confidence?: number }
): CapabilityCommand {
  if (!info) {
    return { available: false, confidence: 0 };
  }

  return {
    available: info.available,
    command: info.command,
    framework: info.framework,
    confidence: info.confidence ?? (info.available ? 0.8 : 0),
  };
}

/**
 * Convert AI custom rules to CustomRule array
 */
function toCustomRules(
  rules?: Array<{ id: string; description: string; command: string; type: string }>
): CustomRule[] | undefined {
  if (!rules || rules.length === 0) {
    return undefined;
  }

  return rules.map((r) => ({
    id: r.id,
    description: r.description,
    command: r.command,
    type: (["test", "typecheck", "lint", "build", "custom"].includes(r.type)
      ? r.type
      : "custom") as CustomRuleType,
  }));
}

// ============================================================================
// Main Discovery Function
// ============================================================================

/**
 * Use AI to discover verification capabilities for any project
 *
 * @param cwd - Project root directory
 * @returns ExtendedCapabilities with source='ai-discovered'
 */
export async function discoverCapabilitiesWithAI(
  cwd: string
): Promise<ExtendedCapabilities> {
  // Collect project context
  console.log("  Collecting project context...");
  const context = await collectProjectContext(cwd);

  // Build discovery prompt
  const prompt = buildCapabilityDiscoveryPrompt(context);

  // Call AI agent
  console.log("  Analyzing project with AI...");
  const result = await callAnyAvailableAgent(prompt, {
    cwd,
    timeoutMs: getTimeout("AI_CAPABILITY_DISCOVERY"),
  });

  if (!result.success) {
    console.log(`  AI discovery failed: ${result.error}`);
    // Return minimal capabilities on failure
    return createMinimalCapabilities();
  }

  // Parse response
  const parsed = parseCapabilityResponse(result.output);

  if (!parsed.success) {
    console.log(`  Failed to parse AI response: ${parsed.error}`);
    return createMinimalCapabilities();
  }

  const data = parsed.data;

  // Calculate overall confidence
  const confidences = [
    data.test?.confidence ?? 0,
    data.typecheck?.confidence ?? 0,
    data.lint?.confidence ?? 0,
    data.build?.confidence ?? 0,
  ].filter((c) => c > 0);

  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.5;

  // Build ExtendedCapabilities
  const capabilities: ExtendedCapabilities = {
    // Base capabilities (for backward compatibility)
    hasTests: data.test?.available ?? false,
    testCommand: data.test?.command,
    testFramework: data.test?.framework,
    hasTypeCheck: data.typecheck?.available ?? false,
    typeCheckCommand: data.typecheck?.command,
    hasLint: data.lint?.available ?? false,
    lintCommand: data.lint?.command,
    hasBuild: data.build?.available ?? false,
    buildCommand: data.build?.command,
    hasGit: await checkGitAvailable(cwd),

    // Extended fields
    source: "ai-discovered",
    confidence: avgConfidence,
    languages: data.languages,
    detectedAt: new Date().toISOString(),

    // Structured command info
    testInfo: toCapabilityCommand(data.test),
    typeCheckInfo: toCapabilityCommand(data.typecheck),
    lintInfo: toCapabilityCommand(data.lint),
    buildInfo: toCapabilityCommand(data.build),

    // Custom rules
    customRules: toCustomRules(data.customRules),
  };

  console.log(`  Discovered capabilities for: ${data.languages.join(", ")}`);

  return capabilities;
}

/**
 * Check if git is available in the project
 * Uses spawnSync to avoid shell injection
 */
async function checkGitAvailable(cwd: string): Promise<boolean> {
  try {
    const result = spawnSync("git", ["rev-parse", "--git-dir"], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
    });
    return result.status === 0;
  } catch {
    return false;
  }
}

/**
 * Create minimal capabilities when AI discovery fails
 */
function createMinimalCapabilities(): ExtendedCapabilities {
  return {
    hasTests: false,
    hasTypeCheck: false,
    hasLint: false,
    hasBuild: false,
    hasGit: false,
    source: "ai-discovered",
    confidence: 0,
    languages: [],
    detectedAt: new Date().toISOString(),
    testInfo: { available: false, confidence: 0 },
    typeCheckInfo: { available: false, confidence: 0 },
    lintInfo: { available: false, confidence: 0 },
    buildInfo: { available: false, confidence: 0 },
  };
}
