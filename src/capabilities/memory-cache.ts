/**
 * In-memory caching for capabilities
 */

import type { ExtendedCapabilities } from "../verification-types.js";

/** Memory cache TTL in milliseconds (1 minute) */
export const MEMORY_CACHE_TTL = 60000;

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
export function getMemoryCache(cwd: string): ExtendedCapabilities | null {
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
export function setMemoryCache(cwd: string, capabilities: ExtendedCapabilities): void {
  memoryCache = {
    cwd,
    capabilities,
    timestamp: Date.now(),
  };
}
