/**
 * Project Capabilities Detection
 *
 * Discovers and caches project verification commands (test, typecheck, lint, build)
 * using AI-powered autonomous exploration.
 *
 * Architecture: Cache → AI Discovery
 * - First checks ai/capabilities.json cache
 * - If cache miss or stale, uses AI to explore and discover commands
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import { callAnyAvailableAgent } from "./agents.js";
import { getTimeout } from "./timeout-config.js";
import { debugCache } from "./debug.js";
import type {
  VerificationCapabilities,
  ExtendedCapabilities,
  CapabilityCommand,
  TestCapabilityInfo,
  E2ECapabilityInfo,
  CapabilityCache,
  CustomRule,
  CustomRuleType,
} from "./verification-types.js";

// ============================================================================
// Constants
// ============================================================================

/** Cache file path relative to project root */
const CACHE_FILE = "ai/capabilities.json";

/** Cache schema version for migration support */
export const CACHE_VERSION = "1.0.0";

/** Memory cache TTL in milliseconds (1 minute) */
export const MEMORY_CACHE_TTL = 60000;

// ============================================================================
// Memory Cache
// ============================================================================

/** Memory cache structure */
interface MemoryCache {
  cwd: string;
  capabilities: ExtendedCapabilities;
  timestamp: number;
}

/** Module-level memory cache */
let memoryCache: MemoryCache | null = null;

/**
 * Clear the memory cache (for testing purposes)
 */
export function clearCapabilitiesCache(): void {
  memoryCache = null;
}

/**
 * Get cached capabilities from memory if valid
 */
function getMemoryCache(cwd: string): ExtendedCapabilities | null {
  if (!memoryCache) {
    return null;
  }

  // Check if cache is for the same project
  if (memoryCache.cwd !== cwd) {
    return null;
  }

  // Check if cache has expired
  const age = Date.now() - memoryCache.timestamp;
  if (age > MEMORY_CACHE_TTL) {
    return null;
  }

  return memoryCache.capabilities;
}

/**
 * Update the memory cache
 */
function setMemoryCache(cwd: string, capabilities: ExtendedCapabilities): void {
  memoryCache = {
    cwd,
    capabilities,
    timestamp: Date.now(),
  };
}

// ============================================================================
// Types
// ============================================================================

/** AI response structure for capability discovery */
interface AICapabilityResponse {
  languages: string[];
  configFiles: string[];
  packageManager?: string;
  test?: {
    available: boolean;
    command?: string;
    framework?: string;
    confidence?: number;
    /** Template for running specific test files, e.g., "pnpm test {files}" */
    selectiveFileTemplate?: string;
    /** Template for running tests by name pattern, e.g., "pnpm test --testNamePattern {pattern}" */
    selectiveNameTemplate?: string;
  };
  e2e?: {
    available: boolean;
    command?: string;
    framework?: string;
    confidence?: number;
    /** Config file path, e.g., "playwright.config.ts" */
    configFile?: string;
    /** Template for grep filtering by tags, e.g., "npx playwright test --grep {tags}" */
    grepTemplate?: string;
    /** Template for running specific files, e.g., "npx playwright test {files}" */
    fileTemplate?: string;
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
// Cache Functions
// ============================================================================

/**
 * Load cached capabilities from ai/capabilities.json
 */
export async function loadCachedCapabilities(
  cwd: string
): Promise<ExtendedCapabilities | null> {
  const cachePath = path.join(cwd, CACHE_FILE);

  try {
    const content = await fs.readFile(cachePath, "utf-8");
    const cache: CapabilityCache = JSON.parse(content);

    // Validate cache version
    if (cache.version !== CACHE_VERSION) {
      console.log(`Cache version mismatch (${cache.version} vs ${CACHE_VERSION}), invalidating...`);
      return null;
    }

    // Return capabilities with source marked as cached
    return {
      ...cache.capabilities,
      source: "cached",
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    console.warn("Failed to parse capability cache:", (error as Error).message);
    return null;
  }
}

/**
 * Save capabilities to ai/capabilities.json
 */
export async function saveCapabilities(
  cwd: string,
  capabilities: ExtendedCapabilities,
  trackedFiles: string[] = []
): Promise<void> {
  const cachePath = path.join(cwd, CACHE_FILE);
  const cacheDir = path.dirname(cachePath);

  await fs.mkdir(cacheDir, { recursive: true });

  const commitHash = getGitCommitHash(cwd);

  const cache: CapabilityCache = {
    version: CACHE_VERSION,
    capabilities: {
      ...capabilities,
      detectedAt: new Date().toISOString(),
    },
    commitHash,
    trackedFiles,
  };

  await fs.writeFile(cachePath, JSON.stringify(cache, null, 2));
}

/**
 * Invalidate (remove) the capability cache
 */
export async function invalidateCache(cwd: string): Promise<void> {
  const cachePath = path.join(cwd, CACHE_FILE);

  try {
    await fs.unlink(cachePath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Check if the cache is stale based on git changes to tracked config files
 */
export async function isStale(cwd: string): Promise<boolean> {
  const cachePath = path.join(cwd, CACHE_FILE);

  try {
    const content = await fs.readFile(cachePath, "utf-8");
    const cache: CapabilityCache = JSON.parse(content);

    if (!cache.commitHash) {
      debugCache("No commit hash in cache, marking as stale");
      return true;
    }

    // If no tracked files, cache is never stale (until commit changes)
    const trackedFiles = cache.trackedFiles || [];
    if (trackedFiles.length === 0) {
      debugCache("No tracked files, checking commit hash only");
      return hasCommitChanged(cwd, cache.commitHash);
    }

    return hasBuildFileChanges(cwd, cache.commitHash, trackedFiles);
  } catch (error) {
    debugCache("isStale check failed: %s", (error as Error).message);
    return true;
  }
}

/**
 * Load cache with full metadata (for debugging/inspection)
 */
export async function loadFullCache(cwd: string): Promise<CapabilityCache | null> {
  const cachePath = path.join(cwd, CACHE_FILE);

  try {
    const content = await fs.readFile(cachePath, "utf-8");
    return JSON.parse(content);
  } catch (error) {
    debugCache("loadFullCache failed: %s", (error as Error).message);
    return null;
  }
}

// ============================================================================
// Git Helpers
// ============================================================================

function getGitCommitHash(cwd: string): string | undefined {
  try {
    const result = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (result.status !== 0) {
      debugCache("git rev-parse failed with status %d", result.status);
      return undefined;
    }
    return result.stdout.trim();
  } catch (error) {
    debugCache("Failed to get git commit hash: %s", (error as Error).message);
    return undefined;
  }
}

function hasCommitChanged(cwd: string, cachedCommitHash: string): boolean {
  const currentHash = getGitCommitHash(cwd);
  if (!currentHash) {
    return true; // Can't determine, assume stale
  }
  return currentHash !== cachedCommitHash;
}

function hasBuildFileChanges(cwd: string, commitHash: string, files: string[]): boolean {
  try {
    const args = ["diff", "--name-only", commitHash, "HEAD", "--", ...files];
    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      debugCache("git diff failed with status %d", result.status);
      return true;
    }

    return result.stdout.trim().length > 0;
  } catch (error) {
    debugCache("hasBuildFileChanges error: %s", (error as Error).message);
    return true;
  }
}

function checkGitAvailable(cwd: string): boolean {
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

// ============================================================================
// AI Discovery
// ============================================================================

/**
 * Build autonomous capability discovery prompt
 */
export function buildAutonomousDiscoveryPrompt(cwd: string): string {
  return `You are a software project analyzer. Discover the verification capabilities of a project through autonomous exploration.

## Working Directory

${cwd}

## Task

Explore this project and discover:
1. **Package manager** - Which package manager is used (npm, pnpm, yarn, bun, etc.)
2. **Config files** - Which files define the project's build/test configuration
3. **Run tests** - Find and verify the test command, including selective test execution
4. **E2E tests** - Find E2E testing framework (Playwright, Cypress, etc.) if present
5. **Type check** - Find static type checking command (if applicable)
6. **Lint** - Find code linting command (if applicable)
7. **Build** - Find the build/compile command (if applicable)

## How to Explore

1. List the root directory to see what files exist
2. Check for lock files to determine package manager (pnpm-lock.yaml, yarn.lock, bun.lockb, package-lock.json)
3. Read configuration files you find (any build tool, package manager, or framework config)
4. Look for scripts or documentation that describes how to run checks
5. Verify commands exist before reporting them

## Critical Requirements

- **Test commands must run once and exit** - No watch mode, no interactive mode
- **Only report commands you have verified** - Read the actual config files
- **Use the project's own scripts when available** - Prefer configured commands over generic ones
- **Detect selective test execution** - How to run specific test files or filter by test name
- **Detect E2E testing** - Look for playwright.config.ts, cypress.config.js, or similar

## Output Format

Return ONLY a JSON object (no markdown, no explanation):

{
  "languages": ["<detected languages/frameworks>"],
  "configFiles": ["<files that define project config, e.g. package.json, Cargo.toml>"],
  "packageManager": "<npm|pnpm|yarn|bun|pip|cargo|go|gradle|maven|etc>",
  "test": {
    "available": true,
    "command": "<exact command to run ALL unit tests>",
    "framework": "<test framework name: vitest|jest|mocha|pytest|go|cargo|junit|etc>",
    "confidence": 0.95,
    "selectiveFileTemplate": "<command template to run specific files, use {files} placeholder>",
    "selectiveNameTemplate": "<command template to filter by test name, use {pattern} placeholder>"
  },
  "e2e": {
    "available": true,
    "command": "<exact command to run ALL E2E tests>",
    "framework": "<E2E framework: playwright|cypress|puppeteer|selenium|etc>",
    "confidence": 0.95,
    "configFile": "<config file path, e.g. playwright.config.ts>",
    "grepTemplate": "<command to filter by tags, use {tags} placeholder, e.g. npx playwright test --grep {tags}>",
    "fileTemplate": "<command to run specific files, use {files} placeholder>"
  },
  "typecheck": {
    "available": true,
    "command": "<exact command>",
    "confidence": 0.9
  },
  "lint": {
    "available": true,
    "command": "<exact command>",
    "confidence": 0.85
  },
  "build": {
    "available": true,
    "command": "<exact command>",
    "confidence": 0.95
  },
  "customRules": [
    {
      "id": "<rule-id>",
      "description": "<what this does>",
      "command": "<command>",
      "type": "test|typecheck|lint|build|custom"
    }
  ]
}

## Selective Test Examples

Different frameworks have different patterns:

| Package Manager | Framework | selectiveFileTemplate | selectiveNameTemplate |
|----------------|-----------|----------------------|----------------------|
| pnpm | vitest | pnpm test {files} | pnpm test --testNamePattern "{pattern}" |
| npm | jest | npm test -- {files} | npm test -- --testNamePattern="{pattern}" |
| yarn | jest | yarn test {files} | yarn test --testNamePattern="{pattern}" |
| bun | bun:test | bun test {files} | bun test --test-name-pattern "{pattern}" |
| pip | pytest | pytest {files} | pytest -k "{pattern}" |
| go | go test | go test {files} | go test -run "{pattern}" ./... |
| cargo | cargo test | cargo test --test {files} | cargo test "{pattern}" |

**configFiles:** List all configuration files that affect the build/test process. These will be monitored for changes to invalidate the cache.

**Confidence:**
- 0.9-1.0: Verified in config file
- 0.7-0.9: Strong indication
- Below 0.7: Set available: false

**Rules:**
- Set "available": false if command cannot be determined
- customRules is optional - only for additional project-specific commands
- Return ONLY JSON, no other text

Begin exploration now.`;
}

/**
 * Parse AI response for capability discovery
 */
export function parseCapabilityResponse(
  response: string
): { success: true; data: AICapabilityResponse } | { success: false; error: string } {
  try {
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr) as AICapabilityResponse;

    if (!parsed.languages || !Array.isArray(parsed.languages)) {
      return { success: false, error: "Missing or invalid 'languages' field" };
    }

    // Ensure configFiles is an array (default to empty if not provided)
    if (!parsed.configFiles) {
      parsed.configFiles = [];
    }

    return { success: true, data: parsed };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse JSON: ${(error as Error).message}`,
    };
  }
}

function extractJSON(response: string): string {
  const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return response;
}

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

function toTestCapabilityInfo(
  info?: AICapabilityResponse["test"],
  packageManager?: string
): TestCapabilityInfo {
  if (!info) {
    return { available: false, confidence: 0 };
  }

  return {
    available: info.available,
    command: info.command,
    framework: info.framework,
    confidence: info.confidence ?? (info.available ? 0.8 : 0),
    selectiveFileTemplate: info.selectiveFileTemplate,
    selectiveNameTemplate: info.selectiveNameTemplate,
    packageManager,
  };
}

function toE2ECapabilityInfo(
  info?: AICapabilityResponse["e2e"]
): E2ECapabilityInfo {
  if (!info) {
    return { available: false, confidence: 0 };
  }

  return {
    available: info.available,
    command: info.command,
    framework: info.framework,
    confidence: info.confidence ?? (info.available ? 0.8 : 0),
    configFile: info.configFile,
    grepTemplate: info.grepTemplate,
    fileTemplate: info.fileTemplate,
  };
}

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

/** Result from AI discovery including config files for cache tracking */
interface DiscoveryResult {
  capabilities: ExtendedCapabilities;
  configFiles: string[];
}

function createMinimalDiscoveryResult(): DiscoveryResult {
  return {
    capabilities: {
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
      e2eInfo: { available: false, confidence: 0 },
      typeCheckInfo: { available: false, confidence: 0 },
      lintInfo: { available: false, confidence: 0 },
      buildInfo: { available: false, confidence: 0 },
    },
    configFiles: [],
  };
}

/**
 * Use AI to autonomously discover verification capabilities
 */
export async function discoverCapabilitiesWithAI(
  cwd: string
): Promise<DiscoveryResult> {
  const prompt = buildAutonomousDiscoveryPrompt(cwd);

  console.log("  AI exploring project structure...");
  const result = await callAnyAvailableAgent(prompt, {
    cwd,
    timeoutMs: getTimeout("AI_CAPABILITY_DISCOVERY"),
  });

  if (!result.success) {
    console.log(`  AI discovery failed: ${result.error}`);
    return createMinimalDiscoveryResult();
  }

  const parsed = parseCapabilityResponse(result.output);

  if (!parsed.success) {
    console.log(`  Failed to parse AI response: ${parsed.error}`);
    return createMinimalDiscoveryResult();
  }

  const data = parsed.data;

  const confidences = [
    data.test?.confidence ?? 0,
    data.e2e?.confidence ?? 0,
    data.typecheck?.confidence ?? 0,
    data.lint?.confidence ?? 0,
    data.build?.confidence ?? 0,
  ].filter((c) => c > 0);

  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.5;

  const capabilities: ExtendedCapabilities = {
    hasTests: data.test?.available ?? false,
    testCommand: data.test?.command,
    testFramework: data.test?.framework,
    hasTypeCheck: data.typecheck?.available ?? false,
    typeCheckCommand: data.typecheck?.command,
    hasLint: data.lint?.available ?? false,
    lintCommand: data.lint?.command,
    hasBuild: data.build?.available ?? false,
    buildCommand: data.build?.command,
    hasGit: checkGitAvailable(cwd),
    source: "ai-discovered",
    confidence: avgConfidence,
    languages: data.languages,
    detectedAt: new Date().toISOString(),
    testInfo: toTestCapabilityInfo(data.test, data.packageManager),
    e2eInfo: toE2ECapabilityInfo(data.e2e),
    typeCheckInfo: toCapabilityCommand(data.typecheck),
    lintInfo: toCapabilityCommand(data.lint),
    buildInfo: toCapabilityCommand(data.build),
    customRules: toCustomRules(data.customRules),
  };

  console.log(`  Discovered capabilities for: ${data.languages.join(", ")}`);

  return {
    capabilities,
    configFiles: data.configFiles,
  };
}

// ============================================================================
// Main API
// ============================================================================

/**
 * Detect project capabilities using two-tier system:
 * 1. Cache - Return cached capabilities if valid and not stale
 * 2. AI Discovery - Use AI to autonomously explore and discover capabilities
 */
export async function detectCapabilities(
  cwd: string,
  options: {
    /** Force re-detection even if cache exists */
    force?: boolean;
    /** Show verbose output */
    verbose?: boolean;
  } = {}
): Promise<ExtendedCapabilities> {
  const { force = false, verbose = false } = options;

  // 0. Try memory cache first (fastest)
  if (!force) {
    const memoryCached = getMemoryCache(cwd);
    if (memoryCached) {
      if (verbose) {
        console.log("  Using memory-cached capabilities");
      }
      return memoryCached;
    }
  }

  // 1. Try disk cache
  if (!force) {
    const cached = await loadCachedCapabilities(cwd);
    if (cached) {
      const stale = await isStale(cwd);
      if (!stale) {
        if (verbose) {
          console.log("  Using cached capabilities");
        }
        // Update memory cache
        setMemoryCache(cwd, cached);
        return cached;
      }
      if (verbose) {
        console.log("  Cache is stale, re-detecting...");
      }
    }
  }

  // 2. Use AI discovery
  if (verbose) {
    console.log("  Using AI-based capability discovery...");
  }

  const { capabilities, configFiles } = await discoverCapabilitiesWithAI(cwd);
  await saveCapabilities(cwd, capabilities, configFiles);

  // Update memory cache
  setMemoryCache(cwd, capabilities);

  return capabilities;
}

/**
 * Detect capabilities (legacy format)
 * @deprecated Use detectCapabilities() instead
 */
export async function detectVerificationCapabilities(
  cwd: string
): Promise<VerificationCapabilities> {
  const extended = await detectCapabilities(cwd);

  return {
    hasTests: extended.hasTests,
    testCommand: extended.testCommand,
    testFramework: extended.testFramework,
    hasTypeCheck: extended.hasTypeCheck,
    typeCheckCommand: extended.typeCheckCommand,
    hasLint: extended.hasLint,
    lintCommand: extended.lintCommand,
    hasBuild: extended.hasBuild,
    buildCommand: extended.buildCommand,
    hasGit: extended.hasGit,
  };
}

// ============================================================================
// Formatting
// ============================================================================

/**
 * Format capabilities for display (legacy format)
 */
export function formatCapabilities(caps: VerificationCapabilities): string {
  const lines: string[] = [];

  if (caps.hasTests) {
    lines.push(`  Tests: ${caps.testFramework} (${caps.testCommand})`);
  } else {
    lines.push("  Tests: Not detected");
  }

  if (caps.hasTypeCheck) {
    lines.push(`  Type Check: ${caps.typeCheckCommand}`);
  } else {
    lines.push("  Type Check: Not detected");
  }

  if (caps.hasLint) {
    lines.push(`  Lint: ${caps.lintCommand}`);
  } else {
    lines.push("  Lint: Not detected");
  }

  if (caps.hasBuild) {
    lines.push(`  Build: ${caps.buildCommand}`);
  } else {
    lines.push("  Build: Not detected");
  }

  lines.push(`  Git: ${caps.hasGit ? "Available" : "Not available"}`);

  return lines.join("\n");
}

/**
 * Format extended capabilities for display
 */
export function formatExtendedCapabilities(caps: ExtendedCapabilities): string {
  const lines: string[] = [];

  lines.push(`  Source: ${caps.source}`);
  lines.push(`  Confidence: ${(caps.confidence * 100).toFixed(0)}%`);
  lines.push(`  Languages: ${caps.languages.join(", ") || "Unknown"}`);
  lines.push("");

  if (caps.testInfo?.available) {
    lines.push(`  Tests: ${caps.testInfo.framework || "custom"} (${caps.testInfo.command})`);
  } else {
    lines.push("  Tests: Not detected");
  }

  if (caps.e2eInfo?.available) {
    lines.push(`  E2E: ${caps.e2eInfo.framework || "custom"} (${caps.e2eInfo.command})`);
  } else {
    lines.push("  E2E: Not detected");
  }

  if (caps.typeCheckInfo?.available) {
    lines.push(`  Type Check: ${caps.typeCheckInfo.command}`);
  } else {
    lines.push("  Type Check: Not detected");
  }

  if (caps.lintInfo?.available) {
    lines.push(`  Lint: ${caps.lintInfo.command}`);
  } else {
    lines.push("  Lint: Not detected");
  }

  if (caps.buildInfo?.available) {
    lines.push(`  Build: ${caps.buildInfo.command}`);
  } else {
    lines.push("  Build: Not detected");
  }

  lines.push(`  Git: ${caps.hasGit ? "Available" : "Not available"}`);

  return lines.join("\n");
}
