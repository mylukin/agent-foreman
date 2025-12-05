/**
 * Legacy store operations for backward compatibility
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { VerificationStore, VerificationResult } from "../verification-types.js";
import {
  VERIFICATION_STORE_PATH,
  VERIFICATION_STORE_DIR,
  STORE_VERSION,
} from "./constants.js";

/**
 * Ensure the verification directory exists
 */
export async function ensureVerificationDir(cwd: string): Promise<void> {
  const dirPath = path.join(cwd, VERIFICATION_STORE_DIR);
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Create an empty verification store (legacy)
 * @deprecated Use createEmptyIndex instead
 */
export function createEmptyStore(): VerificationStore {
  return {
    results: {},
    updatedAt: new Date().toISOString(),
    version: STORE_VERSION,
  };
}

/**
 * Load verification store from ai/verification/results.json (legacy)
 * Returns null if file doesn't exist, empty store if corrupted
 * @deprecated Use loadVerificationIndex instead
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
 * Save to legacy results.json for backward compatibility
 */
export async function saveLegacyResult(
  cwd: string,
  result: VerificationResult
): Promise<void> {
  let store = await loadVerificationStore(cwd);
  if (!store) {
    store = createEmptyStore();
  }
  store.results[result.featureId] = result;
  store.updatedAt = new Date().toISOString();

  await ensureVerificationDir(cwd);
  const storePath = path.join(cwd, VERIFICATION_STORE_PATH);
  await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
}
