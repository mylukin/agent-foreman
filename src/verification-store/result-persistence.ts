/**
 * Result persistence operations - save, load, and query verification results
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import type {
  VerificationResult,
  VerificationMetadata,
  FeatureSummary,
} from "../verification-types.js";
import { VERIFICATION_STORE_DIR, VERIFICATION_STORE_PATH } from "./constants.js";
import {
  ensureVerificationDir,
  loadVerificationStore,
  createEmptyStore,
  saveLegacyResult,
} from "./legacy-store.js";
import {
  createEmptyIndex,
  loadVerificationIndex,
  saveIndex,
  ensureFeatureDir,
  formatRunNumber,
  toMetadata,
  updateFeatureSummary,
  getNextRunNumber,
} from "./index-operations.js";
import { generateVerificationReport } from "../verification-report.js";

/**
 * Save a verification result to the store
 * Creates per-feature subdirectory with JSON metadata and MD report
 */
export async function saveVerificationResult(
  cwd: string,
  result: VerificationResult
): Promise<void> {
  // Get next run number
  const runNumber = await getNextRunNumber(cwd, result.featureId);
  const runStr = formatRunNumber(runNumber);

  // Ensure feature directory exists
  const featureDir = await ensureFeatureDir(cwd, result.featureId);

  // Write metadata JSON (compact)
  const metadata = toMetadata(result, runNumber);
  const jsonPath = path.join(featureDir, `${runStr}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(metadata, null, 2), "utf-8");

  // Write markdown report (detailed)
  const report = generateVerificationReport(result, runNumber);
  const mdPath = path.join(featureDir, `${runStr}.md`);
  await fs.writeFile(mdPath, report, "utf-8");

  // Update index
  let index = await loadVerificationIndex(cwd);
  if (!index) {
    index = createEmptyIndex();
  }
  updateFeatureSummary(index, result, runNumber);
  await saveIndex(cwd, index);

  // Also save to legacy results.json for backward compatibility
  await saveLegacyResult(cwd, result);
}

/**
 * Get the last verification result for a feature
 * Tries new index first, falls back to legacy store
 */
export async function getLastVerification(
  cwd: string,
  featureId: string
): Promise<VerificationResult | null> {
  // Try new index structure first
  const index = await loadVerificationIndex(cwd);
  if (index && index.features[featureId]) {
    const summary = index.features[featureId];
    const runStr = formatRunNumber(summary.latestRun);
    const jsonPath = path.join(
      cwd,
      VERIFICATION_STORE_DIR,
      featureId,
      `${runStr}.json`
    );

    try {
      const content = await fs.readFile(jsonPath, "utf-8");
      const metadata = JSON.parse(content) as VerificationMetadata;

      // For full result, we need to read from legacy store or reconstruct
      // For now, return from legacy store which has full data
      const store = await loadVerificationStore(cwd);
      if (store && store.results[featureId]) {
        return store.results[featureId];
      }

      // If legacy doesn't have it, return minimal result from metadata
      return {
        featureId: metadata.featureId,
        timestamp: metadata.timestamp,
        commitHash: metadata.commitHash,
        changedFiles: metadata.changedFiles,
        diffSummary: metadata.diffSummary,
        automatedChecks: metadata.automatedChecks.map((c) => ({
          type: c.type,
          success: c.success,
          duration: c.duration,
          errorCount: c.errorCount,
        })),
        criteriaResults: metadata.criteriaResults.map((c) => ({
          criterion: c.criterion,
          index: c.index,
          satisfied: c.satisfied,
          confidence: c.confidence,
          reasoning: "", // Not stored in metadata
        })),
        verdict: metadata.verdict,
        verifiedBy: metadata.verifiedBy,
        overallReasoning: "", // Not stored in metadata
      };
    } catch {
      // Fall back to legacy store
    }
  }

  // Fall back to legacy store
  const store = await loadVerificationStore(cwd);
  if (!store) {
    return null;
  }
  return store.results[featureId] || null;
}

/**
 * Get all verification runs for a feature (history)
 */
export async function getVerificationHistory(
  cwd: string,
  featureId: string
): Promise<VerificationMetadata[]> {
  const featureDir = path.join(cwd, VERIFICATION_STORE_DIR, featureId);
  const results: VerificationMetadata[] = [];

  try {
    const files = await fs.readdir(featureDir);
    const jsonFiles = files.filter((f) => f.endsWith(".json")).sort();

    for (const file of jsonFiles) {
      try {
        const content = await fs.readFile(path.join(featureDir, file), "utf-8");
        const metadata = JSON.parse(content) as VerificationMetadata;
        results.push(metadata);
      } catch {
        // Skip invalid files
      }
    }
  } catch {
    // Directory doesn't exist - no history
  }

  return results;
}

/**
 * Clear a verification result from the store
 */
export async function clearVerificationResult(
  cwd: string,
  featureId: string
): Promise<void> {
  // Clear from legacy store
  const store = await loadVerificationStore(cwd);
  if (store && store.results[featureId]) {
    delete store.results[featureId];
    store.updatedAt = new Date().toISOString();
    await ensureVerificationDir(cwd);
    const storePath = path.join(cwd, VERIFICATION_STORE_PATH);
    await fs.writeFile(storePath, JSON.stringify(store, null, 2), "utf-8");
  }

  // Clear from index
  const index = await loadVerificationIndex(cwd);
  if (index && index.features[featureId]) {
    delete index.features[featureId];
    index.updatedAt = new Date().toISOString();
    await saveIndex(cwd, index);
  }

  // Note: We don't delete the feature subdirectory to preserve history
}

/**
 * Get all verification results (summaries from index)
 */
export async function getAllVerificationResults(
  cwd: string
): Promise<Record<string, VerificationResult>> {
  // Return from legacy store for full results
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
  // Check index first
  const index = await loadVerificationIndex(cwd);
  if (index && index.features[featureId]) {
    return true;
  }

  // Fall back to legacy
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
  // Try index first
  const index = await loadVerificationIndex(cwd);
  if (index && Object.keys(index.features).length > 0) {
    const summaries = Object.values(index.features);
    return {
      total: summaries.length,
      passing: summaries.filter((s) => s.latestVerdict === "pass").length,
      failing: summaries.filter((s) => s.latestVerdict === "fail").length,
      needsReview: summaries.filter((s) => s.latestVerdict === "needs_review").length,
    };
  }

  // Fall back to legacy
  const results = await getAllVerificationResults(cwd);
  const values = Object.values(results);

  return {
    total: values.length,
    passing: values.filter((r) => r.verdict === "pass").length,
    failing: values.filter((r) => r.verdict === "fail").length,
    needsReview: values.filter((r) => r.verdict === "needs_review").length,
  };
}

/**
 * Get feature summary from index
 */
export async function getFeatureSummary(
  cwd: string,
  featureId: string
): Promise<FeatureSummary | null> {
  const index = await loadVerificationIndex(cwd);
  if (!index) {
    return null;
  }
  return index.features[featureId] || null;
}
