/**
 * Capability Cache Management
 * Persists detected project capabilities to ai/capabilities.json
 * Supports git-based cache invalidation when build files change
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import type { ExtendedCapabilities, CapabilityCache } from "./verification-types.js";
import { debugCache } from "./debug.js";

// Cache file path relative to project root
const CACHE_FILE = "ai/capabilities.json";

// Cache schema version for migration support
export const CACHE_VERSION = "1.0.0";

// Build files that trigger cache invalidation when modified
const BUILD_FILES = [
  "package.json",
  "package-lock.json",
  "yarn.lock",
  "pnpm-lock.yaml",
  "Cargo.toml",
  "Cargo.lock",
  "go.mod",
  "go.sum",
  "pyproject.toml",
  "setup.py",
  "requirements.txt",
  "Pipfile",
  "Pipfile.lock",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "settings.gradle",
  "settings.gradle.kts",
  "Makefile",
  "CMakeLists.txt",
  "Gemfile",
  "Gemfile.lock",
  "composer.json",
  "composer.lock",
  "mix.exs",
  "rebar.config",
  "deno.json",
  "deno.lock",
  "bun.lockb",
];

/**
 * Load cached capabilities from ai/capabilities.json
 * @param cwd - Project root directory
 * @returns Cached capabilities or null if cache doesn't exist or is invalid
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
    // File doesn't exist or is corrupted
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }

    // Log parsing errors but don't throw
    console.warn("Failed to parse capability cache:", (error as Error).message);
    return null;
  }
}

/**
 * Save capabilities to ai/capabilities.json
 * @param cwd - Project root directory
 * @param capabilities - Capabilities to cache
 */
export async function saveCapabilities(
  cwd: string,
  capabilities: ExtendedCapabilities
): Promise<void> {
  const cachePath = path.join(cwd, CACHE_FILE);
  const cacheDir = path.dirname(cachePath);

  // Ensure ai/ directory exists
  await fs.mkdir(cacheDir, { recursive: true });

  // Get current git commit hash for staleness tracking
  const commitHash = getGitCommitHash(cwd);

  // Find which build files exist in the project
  const trackedFiles = await findExistingBuildFiles(cwd);

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
 * @param cwd - Project root directory
 */
export async function invalidateCache(cwd: string): Promise<void> {
  const cachePath = path.join(cwd, CACHE_FILE);

  try {
    await fs.unlink(cachePath);
  } catch (error) {
    // Ignore if file doesn't exist
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

/**
 * Check if the cache is stale based on git changes to build files
 * Cache is considered stale if any tracked build file has been modified
 * since the cache was created
 *
 * @param cwd - Project root directory
 * @returns True if cache is stale and should be refreshed
 */
export async function isStale(cwd: string): Promise<boolean> {
  const cachePath = path.join(cwd, CACHE_FILE);

  try {
    const content = await fs.readFile(cachePath, "utf-8");
    const cache: CapabilityCache = JSON.parse(content);

    // If no commit hash stored, consider stale
    if (!cache.commitHash) {
      debugCache("No commit hash in cache, marking as stale");
      return true;
    }

    // If no tracked files, check if any build files have been modified
    const trackedFiles = cache.trackedFiles || BUILD_FILES;

    // Check if any tracked files have changed since cache commit
    const hasChanges = hasBuildFileChanges(cwd, cache.commitHash, trackedFiles);

    return hasChanges;
  } catch (error) {
    // If cache doesn't exist or is corrupted, it's effectively stale
    debugCache("isStale check failed: %s", (error as Error).message);
    return true;
  }
}

/**
 * Get the current git commit hash
 * @param cwd - Project root directory
 * @returns Commit hash or undefined if not a git repo
 */
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

/**
 * Find which build files exist in the project
 * @param cwd - Project root directory
 * @returns List of existing build file paths
 */
async function findExistingBuildFiles(cwd: string): Promise<string[]> {
  const existing: string[] = [];

  for (const file of BUILD_FILES) {
    const filePath = path.join(cwd, file);
    try {
      await fs.access(filePath);
      existing.push(file);
    } catch (error) {
      debugCache("Build file check failed for %s: %s", file, (error as Error).message);
    }
  }

  return existing;
}

/**
 * Check if any build files have changed since a given commit
 * Uses spawnSync with argument arrays to prevent command injection
 *
 * @param cwd - Project root directory
 * @param commitHash - Commit hash to compare against
 * @param files - List of files to check
 * @returns True if any files have been modified
 */
function hasBuildFileChanges(
  cwd: string,
  commitHash: string,
  files: string[]
): boolean {
  try {
    // Use spawnSync with argument array to prevent command injection
    // Arguments: git diff --name-only <commitHash> HEAD -- <file1> <file2> ...
    const args = ["diff", "--name-only", commitHash, "HEAD", "--", ...files];

    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    // If git command fails, assume stale to be safe
    if (result.status !== 0) {
      debugCache("git diff failed with status %d", result.status);
      return true;
    }

    // If any files returned, cache is stale
    return result.stdout.trim().length > 0;
  } catch (error) {
    // If git command fails, assume stale to be safe
    debugCache("hasBuildFileChanges error: %s", (error as Error).message);
    return true;
  }
}

/**
 * Load cache with full metadata (for debugging/inspection)
 * @param cwd - Project root directory
 * @returns Full cache object or null
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
