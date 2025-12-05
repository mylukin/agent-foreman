/**
 * Project Capabilities Detection
 *
 * Discovers and caches project verification commands (test, typecheck, lint, build)
 * using AI-powered autonomous exploration.
 *
 * Architecture: Cache → AI Discovery
 * - First checks ai/capabilities.json cache
 * - If cache miss or stale, uses AI to explore and discover commands
 *
 * This module is split into focused submodules:
 * - memory-cache: In-memory caching
 * - disk-cache: File-based caching
 * - git-invalidation: Git-based cache invalidation
 * - ai-discovery: AI-powered discovery
 * - formatters: Display formatting
 */

import type { VerificationCapabilities, ExtendedCapabilities } from "../verification-types.js";

// Re-export memory cache functions
export {
  MEMORY_CACHE_TTL,
  clearCapabilitiesCache,
  getMemoryCache,
  setMemoryCache,
} from "./memory-cache.js";

// Re-export disk cache functions
export {
  CACHE_FILE,
  CACHE_VERSION,
  loadCachedCapabilities,
  saveCapabilities,
  invalidateCache,
  loadFullCache,
} from "./disk-cache.js";

// Re-export git invalidation functions
export {
  getGitCommitHash,
  hasCommitChanged,
  hasBuildFileChanges,
  checkGitAvailable,
  isStale,
} from "./git-invalidation.js";

// Re-export AI discovery functions
export {
  buildAutonomousDiscoveryPrompt,
  parseCapabilityResponse,
  discoverCapabilitiesWithAI,
  type DiscoveryResult,
} from "./ai-discovery.js";

// Re-export formatters
export {
  formatCapabilities,
  formatExtendedCapabilities,
} from "./formatters.js";

// Import for main API implementation
import { getMemoryCache, setMemoryCache } from "./memory-cache.js";
import { loadCachedCapabilities, saveCapabilities } from "./disk-cache.js";
import { isStale } from "./git-invalidation.js";
import { discoverCapabilitiesWithAI } from "./ai-discovery.js";

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
