/**
 * Index management operations for verification store
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  VerificationIndex,
  VerificationResult,
  VerificationMetadata,
} from "../verification-types.js";
import {
  VERIFICATION_STORE_DIR,
  VERIFICATION_INDEX_PATH,
  INDEX_VERSION,
} from "./constants.js";
import { ensureVerificationDir, loadVerificationStore } from "./legacy-store.js";
import {
  generateVerificationReport,
} from "../verification-report.js";

/**
 * Create an empty verification index
 */
export function createEmptyIndex(): VerificationIndex {
  return {
    features: {},
    updatedAt: new Date().toISOString(),
    version: INDEX_VERSION,
  };
}

/**
 * Save the index to disk
 */
export async function saveIndex(cwd: string, index: VerificationIndex): Promise<void> {
  await ensureVerificationDir(cwd);
  const indexPath = path.join(cwd, VERIFICATION_INDEX_PATH);
  const content = JSON.stringify(index, null, 2);
  await fs.writeFile(indexPath, content, "utf-8");
}

/**
 * Ensure a feature subdirectory exists
 */
export async function ensureFeatureDir(cwd: string, featureId: string): Promise<string> {
  const featureDir = path.join(cwd, VERIFICATION_STORE_DIR, featureId);
  await fs.mkdir(featureDir, { recursive: true });
  return featureDir;
}

/**
 * Format run number to padded string (001, 002, etc.)
 */
export function formatRunNumber(num: number): string {
  return String(num).padStart(3, "0");
}

/**
 * Convert VerificationResult to compact VerificationMetadata
 */
export function toMetadata(result: VerificationResult, runNumber: number): VerificationMetadata {
  return {
    featureId: result.featureId,
    runNumber,
    timestamp: result.timestamp,
    commitHash: result.commitHash,
    changedFiles: result.changedFiles,
    diffSummary: result.diffSummary,
    automatedChecks: result.automatedChecks.map((c) => ({
      type: c.type,
      success: c.success,
      duration: c.duration,
      errorCount: c.errorCount,
      // Note: output excluded
    })),
    criteriaResults: result.criteriaResults.map((c) => ({
      criterion: c.criterion,
      index: c.index,
      satisfied: c.satisfied,
      confidence: c.confidence,
      // Note: reasoning and evidence excluded
    })),
    verdict: result.verdict,
    verifiedBy: result.verifiedBy,
  };
}

/**
 * Update the feature summary in the index
 */
export function updateFeatureSummary(
  index: VerificationIndex,
  result: VerificationResult,
  runNumber: number
): void {
  const existing = index.features[result.featureId];

  if (existing) {
    // Update existing summary
    existing.latestRun = runNumber;
    existing.latestTimestamp = result.timestamp;
    existing.latestVerdict = result.verdict;
    existing.totalRuns = runNumber;
    if (result.verdict === "pass") {
      existing.passCount++;
    } else if (result.verdict === "fail") {
      existing.failCount++;
    }
  } else {
    // Create new summary
    index.features[result.featureId] = {
      featureId: result.featureId,
      latestRun: runNumber,
      latestTimestamp: result.timestamp,
      latestVerdict: result.verdict,
      totalRuns: 1,
      passCount: result.verdict === "pass" ? 1 : 0,
      failCount: result.verdict === "fail" ? 1 : 0,
    };
  }

  index.updatedAt = new Date().toISOString();
}

/**
 * Internal auto-migration helper (called during loadVerificationIndex)
 * Performs migration if old results.json exists and index.json doesn't
 */
async function performAutoMigration(cwd: string): Promise<void> {
  const storePath = path.join(cwd, VERIFICATION_STORE_DIR, "results.json");

  try {
    // Check if old store exists
    await fs.access(storePath);

    // Old store exists - perform migration
    // We call the migration logic directly to avoid circular dependency
    const store = await loadVerificationStore(cwd);
    if (!store || Object.keys(store.results).length === 0) {
      return;
    }

    // Create new index
    const index = createEmptyIndex();
    let migratedCount = 0;

    for (const [featureId, result] of Object.entries(store.results)) {
      try {
        // Create feature directory
        const featureDir = path.join(cwd, VERIFICATION_STORE_DIR, featureId);
        await fs.mkdir(featureDir, { recursive: true });

        // Run number is 1 for migrated data
        const runNumber = 1;
        const runStr = String(runNumber).padStart(3, "0");

        // Write metadata JSON
        const metadata = {
          featureId: result.featureId,
          runNumber,
          timestamp: result.timestamp,
          commitHash: result.commitHash,
          changedFiles: result.changedFiles,
          diffSummary: result.diffSummary,
          automatedChecks: result.automatedChecks.map((c) => ({
            type: c.type,
            success: c.success,
            duration: c.duration,
            errorCount: c.errorCount,
          })),
          criteriaResults: result.criteriaResults.map((c) => ({
            criterion: c.criterion,
            index: c.index,
            satisfied: c.satisfied,
            confidence: c.confidence,
          })),
          verdict: result.verdict,
          verifiedBy: result.verifiedBy,
        };
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
      } catch (err) {
        console.warn(
          `[verification-store] Auto-migration: Failed to migrate ${featureId}: ${err}`
        );
      }
    }

    // Save new index
    await ensureVerificationDir(cwd);
    const indexPath = path.join(cwd, VERIFICATION_INDEX_PATH);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2), "utf-8");

    // Backup old results.json
    const backupPath = path.join(cwd, VERIFICATION_STORE_DIR, "results.json.bak");
    try {
      await fs.copyFile(storePath, backupPath);
    } catch {
      // Ignore backup errors
    }

    if (migratedCount > 0) {
      console.log(
        `[verification-store] Auto-migrated ${migratedCount} verification results to new format`
      );
    }
  } catch {
    // Old store doesn't exist, nothing to migrate
  }
}

/**
 * Load verification index from ai/verification/index.json
 * Returns null if file doesn't exist
 * Triggers auto-migration from legacy results.json if needed
 */
export async function loadVerificationIndex(
  cwd: string
): Promise<VerificationIndex | null> {
  const indexPath = path.join(cwd, VERIFICATION_INDEX_PATH);

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    const index = JSON.parse(content) as VerificationIndex;

    // Validate basic structure
    if (!index.features || typeof index.features !== "object") {
      console.warn(
        `[verification-store] Corrupted index file, returning empty index`
      );
      return createEmptyIndex();
    }

    return index;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      // Index doesn't exist - check if we need to migrate from legacy
      await performAutoMigration(cwd);

      // Try loading again after migration
      try {
        const content = await fs.readFile(indexPath, "utf-8");
        const index = JSON.parse(content) as VerificationIndex;
        if (index.features && typeof index.features === "object") {
          return index;
        }
      } catch {
        // Still doesn't exist after migration attempt
      }

      return null;
    }

    console.warn(
      `[verification-store] Error loading index: ${error}, returning empty index`
    );
    return createEmptyIndex();
  }
}

/**
 * Get the next run number for a feature
 */
export async function getNextRunNumber(cwd: string, featureId: string): Promise<number> {
  const index = await loadVerificationIndex(cwd);
  if (index && index.features[featureId]) {
    return index.features[featureId].latestRun + 1;
  }
  return 1;
}
