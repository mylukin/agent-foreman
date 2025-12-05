/**
 * Git-based cache invalidation
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

import type { CapabilityCache } from "../verification-types.js";
import { debugCache } from "../debug.js";
import { CACHE_FILE } from "./disk-cache.js";

/**
 * Get current git commit hash
 */
export function getGitCommitHash(cwd: string): string | undefined {
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
 * Check if commit hash has changed
 */
export function hasCommitChanged(cwd: string, cachedCommitHash: string): boolean {
  const currentHash = getGitCommitHash(cwd);
  if (!currentHash) {
    return true; // Can't determine, assume stale
  }
  return currentHash !== cachedCommitHash;
}

/**
 * Check if any tracked build files have changed since cached commit
 */
export function hasBuildFileChanges(cwd: string, commitHash: string, files: string[]): boolean {
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

/**
 * Check if git is available in the project
 */
export function checkGitAvailable(cwd: string): boolean {
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
