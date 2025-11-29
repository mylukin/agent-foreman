/**
 * Persistence layer for verification results
 * Stores verification data in ai/verification/results.json
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  VerificationStore,
  VerificationResult,
} from "./verification-types.js";

// ============================================================================
// Constants
// ============================================================================

/** Path to verification store relative to project root */
export const VERIFICATION_STORE_DIR = "ai/verification";
export const VERIFICATION_STORE_FILE = "results.json";
export const VERIFICATION_STORE_PATH = `${VERIFICATION_STORE_DIR}/${VERIFICATION_STORE_FILE}`;

/** Current store schema version */
export const STORE_VERSION = "1.0.0";

// ============================================================================
// Store Operations
// ============================================================================

/**
 * Create an empty verification store
 */
export function createEmptyStore(): VerificationStore {
  return {
    results: {},
    updatedAt: new Date().toISOString(),
    version: STORE_VERSION,
  };
}

/**
 * Load verification store from ai/verification/results.json
 * Returns null if file doesn't exist, empty store if corrupted
 */
export async function loadVerificationStore(
  cwd: string
): Promise<VerificationStore | null> {
  const storePath = path.join(cwd, VERIFICATION_STORE_PATH);

  try {
    const content = await fs.readFile(storePath, "utf-8");
    const store = JSON.parse(content) as VerificationStore;

    // Validate basic structure
    if (!store.results || typeof store.results !== "object") {
      console.warn(
        `[verification-store] Corrupted store file, returning empty store`
      );
      return createEmptyStore();
    }

    return store;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // File doesn't exist - this is normal for new projects
      return null;
    }

    // Parse error or other issue - return empty store
    console.warn(
      `[verification-store] Error loading store: ${error}, returning empty store`
    );
    return createEmptyStore();
  }
}

/**
 * Ensure the verification directory exists
 */
async function ensureVerificationDir(cwd: string): Promise<void> {
  const dirPath = path.join(cwd, VERIFICATION_STORE_DIR);
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Save verification store to disk
 */
async function saveStore(cwd: string, store: VerificationStore): Promise<void> {
  await ensureVerificationDir(cwd);

  const storePath = path.join(cwd, VERIFICATION_STORE_PATH);
  const content = JSON.stringify(store, null, 2);
  await fs.writeFile(storePath, content, "utf-8");
}

/**
 * Save a verification result to the store
 * Creates the store if it doesn't exist
 */
export async function saveVerificationResult(
  cwd: string,
  result: VerificationResult
): Promise<void> {
  // Load existing store or create new one
  let store = await loadVerificationStore(cwd);
  if (!store) {
    store = createEmptyStore();
  }

  // Add/update result
  store.results[result.featureId] = result;
  store.updatedAt = new Date().toISOString();

  // Save to disk
  await saveStore(cwd, store);
}

/**
 * Get the last verification result for a feature
 * Returns null if no verification exists
 */
export async function getLastVerification(
  cwd: string,
  featureId: string
): Promise<VerificationResult | null> {
  const store = await loadVerificationStore(cwd);
  if (!store) {
    return null;
  }

  return store.results[featureId] || null;
}

/**
 * Clear a verification result from the store
 */
export async function clearVerificationResult(
  cwd: string,
  featureId: string
): Promise<void> {
  const store = await loadVerificationStore(cwd);
  if (!store) {
    return;
  }

  if (store.results[featureId]) {
    delete store.results[featureId];
    store.updatedAt = new Date().toISOString();
    await saveStore(cwd, store);
  }
}

/**
 * Get all verification results
 */
export async function getAllVerificationResults(
  cwd: string
): Promise<Record<string, VerificationResult>> {
  const store = await loadVerificationStore(cwd);
  return store?.results || {};
}

/**
 * Check if a feature has been verified
 */
export async function hasVerification(
  cwd: string,
  featureId: string
): Promise<boolean> {
  const result = await getLastVerification(cwd, featureId);
  return result !== null;
}

/**
 * Get verification summary statistics
 */
export async function getVerificationStats(cwd: string): Promise<{
  total: number;
  passing: number;
  failing: number;
  needsReview: number;
}> {
  const results = await getAllVerificationResults(cwd);
  const values = Object.values(results);

  return {
    total: values.length,
    passing: values.filter((r) => r.verdict === "pass").length,
    failing: values.filter((r) => r.verdict === "fail").length,
    needsReview: values.filter((r) => r.verdict === "needs_review").length,
  };
}
