/**
 * Verification Store - Persistence layer for verification results
 *
 * Stores verification data in per-feature subdirectories under ai/verification/
 *
 * New structure:
 *   ai/verification/
 *   ├── index.json              # Summary index for quick lookups
 *   ├── {featureId}/
 *   │   ├── 001.json            # Run 1 metadata (compact)
 *   │   ├── 001.md              # Run 1 detailed report
 *   │   ├── 002.json            # Run 2 metadata
 *   │   └── 002.md              # Run 2 detailed report
 *   └── ...
 *
 * Legacy structure (deprecated):
 *   ai/verification/results.json
 *
 * This module is split into focused submodules:
 * - constants: Store paths and version constants
 * - legacy-store: Legacy format support
 * - index-operations: Index management logic
 * - result-persistence: Result save/load functions
 * - migration: Migration logic
 */

// Re-export constants
export {
  VERIFICATION_STORE_DIR,
  VERIFICATION_STORE_FILE,
  VERIFICATION_STORE_PATH,
  VERIFICATION_INDEX_FILE,
  VERIFICATION_INDEX_PATH,
  STORE_VERSION,
  INDEX_VERSION,
} from "./constants.js";

// Re-export legacy store operations
export {
  createEmptyStore,
  loadVerificationStore,
} from "./legacy-store.js";

// Re-export index operations
export {
  createEmptyIndex,
  loadVerificationIndex,
  formatRunNumber,
} from "./index-operations.js";

// Re-export result persistence operations
export {
  saveVerificationResult,
  getLastVerification,
  getVerificationHistory,
  clearVerificationResult,
  getAllVerificationResults,
  hasVerification,
  getVerificationStats,
  getFeatureSummary,
} from "./result-persistence.js";

// Re-export migration operations
export {
  needsMigration,
  migrateResultsJson,
  autoMigrateIfNeeded,
} from "./migration.js";
