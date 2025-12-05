/**
 * File-based caching for capabilities
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";

import type { ExtendedCapabilities, CapabilityCache } from "../verification-types.js";
import { debugCache } from "../debug.js";
import { getGitCommitHash } from "./git-invalidation.js";

/** Cache file path relative to project root */
export const CACHE_FILE = "ai/capabilities.json";

/** Cache schema version for migration support */
export const CACHE_VERSION = "1.0.0";

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
