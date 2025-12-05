/**
 * Migration operations for verification store
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import {
  VERIFICATION_STORE_DIR,
  VERIFICATION_STORE_PATH,
  VERIFICATION_INDEX_PATH,
} from "./constants.js";
import {
  ensureVerificationDir,
  loadVerificationStore,
} from "./legacy-store.js";
import {
  createEmptyIndex,
  saveIndex,
  ensureFeatureDir,
  formatRunNumber,
  toMetadata,
} from "./index-operations.js";
import { generateVerificationReport } from "../verification-report.js";

/**
 * Check if migration is needed
 * Returns true if old results.json exists but index.json doesn't
 */
export async function needsMigration(cwd: string): Promise<boolean> {
  const storePath = path.join(cwd, VERIFICATION_STORE_PATH);
  const indexPath = path.join(cwd, VERIFICATION_INDEX_PATH);

  try {
    // Check if old store exists
    await fs.access(storePath);
    // Check if new index doesn't exist
    try {
      await fs.access(indexPath);
      return false; // Both exist, no migration needed
    } catch {
      return true; // Old exists, new doesn't - migration needed
    }
  } catch {
    return false; // Old store doesn't exist, no migration needed
  }
}

/**
 * Migrate old results.json to new per-feature structure
 * Creates subdirectories, JSON/MD files, and index.json
 *
 * @param cwd - Project root directory
 * @returns Number of features migrated, or -1 if migration not needed
 */
export async function migrateResultsJson(cwd: string): Promise<number> {
  // Check if migration is needed
  if (!(await needsMigration(cwd))) {
    return -1;
  }

  // Load old store
  const store = await loadVerificationStore(cwd);
  if (!store || Object.keys(store.results).length === 0) {
    return 0;
  }

  // Create new index
  const index = createEmptyIndex();
  let migratedCount = 0;

  // Migrate each feature result
  for (const [featureId, result] of Object.entries(store.results)) {
    try {
      // Create feature directory
      const featureDir = await ensureFeatureDir(cwd, featureId);

      // Run number is 1 for migrated data
      const runNumber = 1;
      const runStr = formatRunNumber(runNumber);

      // Write metadata JSON
      const metadata = toMetadata(result, runNumber);
      const jsonPath = path.join(featureDir, `${runStr}.json`);
      await fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2), "utf-8");

      // Write markdown report
      const report = generateVerificationReport(result, runNumber);
      const mdPath = path.join(featureDir, `${runStr}.md`);
      await fs.writeFile(mdPath, report, "utf-8");

      // Update index
      index.features[featureId] = {
        featureId,
        latestRun: runNumber,
        latestTimestamp: result.timestamp,
        latestVerdict: result.verdict,
        totalRuns: 1,
        passCount: result.verdict === "pass" ? 1 : 0,
        failCount: result.verdict === "fail" ? 1 : 0,
      };

      migratedCount++;
    } catch (error) {
      console.warn(
        `[verification-store] Failed to migrate feature ${featureId}: ${error}`
      );
    }
  }

  // Save new index
  await saveIndex(cwd, index);

  // Backup old results.json
  const storePath = path.join(cwd, VERIFICATION_STORE_PATH);
  const backupPath = path.join(cwd, VERIFICATION_STORE_DIR, "results.json.bak");
  try {
    await fs.copyFile(storePath, backupPath);
  } catch (error) {
    console.warn(
      `[verification-store] Failed to backup results.json: ${error}`
    );
  }

  return migratedCount;
}

/**
 * Auto-migrate if needed (called on first access)
 * Silent migration - logs but doesn't throw on errors
 */
export async function autoMigrateIfNeeded(cwd: string): Promise<void> {
  try {
    if (await needsMigration(cwd)) {
      const count = await migrateResultsJson(cwd);
      if (count > 0) {
        console.log(
          `[verification-store] Migrated ${count} verification results to new format`
        );
      }
    }
  } catch (error) {
    console.warn(
      `[verification-store] Auto-migration failed: ${error}`
    );
  }
}
