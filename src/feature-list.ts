/**
 * Feature list operations for ai/features/ (modular markdown format)
 * Also supports legacy ai/feature_list.json with auto-migration
 *
 * Primary format: ai/features/index.json + ai/features/{module}/{id}.md
 * Legacy format: ai/feature_list.json (auto-migrated on first load)
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import type { Feature, FeatureList, FeatureStatus, FeatureVerificationSummary, DiscoveredFeature } from "./types.js";
import { validateFeatureList } from "./schema.js";
import {
  loadFeatureIndex,
  loadSingleFeature,
  saveSingleFeature,
  saveFeatureIndex,
  autoMigrateIfNeeded,
  pathToFeatureId,
} from "./feature-storage.js";
import type { FeatureIndex, FeatureIndexEntry } from "./types.js";

/** Default path for legacy feature list file (for migration) */
export const FEATURE_LIST_PATH = "ai/feature_list.json";

/** Path to features directory for modular format */
const FEATURES_DIR = "ai/features";

/**
 * Load feature list from file
 * Supports both new modular format (ai/features/) and legacy JSON format
 *
 * Strategy:
 * 1. Try new format (index.json) first
 * 2. Auto-migrate if old format detected
 * 3. Load all features from markdown files
 * 4. Fall back to legacy format if neither exists
 */
export async function loadFeatureList(basePath: string): Promise<FeatureList | null> {
  // 1. Check if new format exists (index.json)
  const index = await loadFeatureIndex(basePath);

  if (index) {
    // Load all features from markdown files
    const features = await loadAllFeaturesFromMarkdown(basePath, index);
    return {
      $schema: "./feature_list.schema.json",
      features,
      metadata: index.metadata,
    };
  }

  // 2. Check if legacy format exists and auto-migrate
  const legacyPath = path.join(basePath, FEATURE_LIST_PATH);
  try {
    await fs.access(legacyPath);
    // Legacy file exists - attempt auto-migration
    await autoMigrateIfNeeded(basePath);

    // After migration, try loading from new format
    const migratedIndex = await loadFeatureIndex(basePath);
    if (migratedIndex) {
      const features = await loadAllFeaturesFromMarkdown(basePath, migratedIndex);
      return {
        $schema: "./feature_list.schema.json",
        features,
        metadata: migratedIndex.metadata,
      };
    }

    // If migration failed or index still doesn't exist, load legacy format
    return loadLegacyFeatureList(basePath);
  } catch {
    // Neither format exists
    return null;
  }
}

/**
 * Load legacy feature list from ai/feature_list.json
 */
async function loadLegacyFeatureList(basePath: string): Promise<FeatureList | null> {
  const filePath = path.join(basePath, FEATURE_LIST_PATH);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content);
    const { valid, errors } = validateFeatureList(data);
    if (!valid) {
      console.error("Invalid feature list:", errors);
      return null;
    }
    return data as FeatureList;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw err;
  }
}

/**
 * Load all features from markdown files based on index
 */
async function loadAllFeaturesFromMarkdown(
  basePath: string,
  index: import("./types.js").FeatureIndex
): Promise<Feature[]> {
  const features: Feature[] = [];
  const featureIds = Object.keys(index.features);

  // Load features in parallel for better performance
  const loadPromises = featureIds.map(async (id) => {
    const feature = await loadSingleFeature(basePath, id);
    if (feature) {
      return feature;
    }
    // If markdown file is missing, create minimal feature from index
    const indexEntry = index.features[id];
    return {
      id,
      description: indexEntry.description,
      module: indexEntry.module,
      priority: indexEntry.priority,
      status: indexEntry.status,
      acceptance: [],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual" as const,
      notes: "",
    };
  });

  const loadedFeatures = await Promise.all(loadPromises);
  features.push(...loadedFeatures);

  return features;
}

/**
 * Save feature list to file
 * Writes to new modular format (ai/features/)
 *
 * Strategy:
 * 1. Ensure directory structure exists
 * 2. Write each feature to its markdown file
 * 3. Update index.json with brief properties
 */
export async function saveFeatureList(basePath: string, list: FeatureList): Promise<void> {
  const featuresDir = path.join(basePath, FEATURES_DIR);
  await fs.mkdir(featuresDir, { recursive: true });

  // Update metadata timestamp
  const updatedMetadata = {
    ...list.metadata,
    updatedAt: new Date().toISOString(),
  };

  // Build index entries while saving features
  const indexFeatures: Record<string, FeatureIndexEntry> = {};

  // Save each feature to its markdown file in parallel
  const savePromises = list.features.map(async (feature) => {
    await saveSingleFeature(basePath, feature);

    // Add to index
    indexFeatures[feature.id] = {
      status: feature.status,
      priority: feature.priority,
      module: feature.module,
      description: feature.description,
    };
  });

  await Promise.all(savePromises);

  // Build and save index.json
  const index: FeatureIndex = {
    version: "2.0.0",
    updatedAt: updatedMetadata.updatedAt,
    metadata: updatedMetadata,
    features: indexFeatures,
  };

  await saveFeatureIndex(basePath, index);
}

/**
 * Check if feature list exists
 * Checks for both new format (index.json) and legacy format
 */
export async function featureListExists(basePath: string): Promise<boolean> {
  // Check new format first
  const indexPath = path.join(basePath, FEATURES_DIR, "index.json");
  try {
    await fs.access(indexPath);
    return true;
  } catch {
    // Fall through to check legacy format
  }

  // Check legacy format
  const legacyPath = path.join(basePath, FEATURE_LIST_PATH);
  try {
    await fs.access(legacyPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Select next feature to work on based on priority
 * Priority order:
 * 1. needs_review status (highest)
 * 2. failing status
 * 3. Then by priority number (lower = higher priority)
 */
export function selectNextFeature(features: Feature[]): Feature | null {
  const candidates = features.filter(
    (f) => f.status === "needs_review" || f.status === "failing"
  );

  if (candidates.length === 0) return null;

  // Sort: needs_review first, then by priority number (lower = higher)
  candidates.sort((a, b) => {
    const statusOrder: Record<FeatureStatus, number> = {
      needs_review: 0,
      failing: 1,
      blocked: 2,
      passing: 3,
      deprecated: 4,
    };
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.priority - b.priority;
  });

  return candidates[0];
}

/**
 * Find feature by ID
 */
export function findFeatureById(features: Feature[], id: string): Feature | undefined {
  return features.find((f) => f.id === id);
}

/**
 * Update feature status
 */
export function updateFeatureStatus(
  features: Feature[],
  id: string,
  status: FeatureStatus,
  notes?: string
): Feature[] {
  return features.map((f) => {
    if (f.id === id) {
      return {
        ...f,
        status,
        notes: notes ?? f.notes,
      };
    }
    return f;
  });
}

/**
 * Update feature verification summary
 */
export function updateFeatureVerification(
  features: Feature[],
  id: string,
  verification: FeatureVerificationSummary
): Feature[] {
  return features.map((f) => {
    if (f.id === id) {
      return {
        ...f,
        verification,
      };
    }
    return f;
  });
}

/**
 * Find features that depend on a given feature
 */
export function findDependentFeatures(features: Feature[], featureId: string): Feature[] {
  return features.filter((f) => f.dependsOn.includes(featureId));
}

/**
 * Find features in the same module
 */
export function findSameModuleFeatures(
  features: Feature[],
  module: string,
  excludeId: string
): Feature[] {
  return features.filter((f) => f.module === module && f.id !== excludeId);
}

/**
 * Merge new features with existing ones (no duplicates)
 */
export function mergeFeatures(existing: Feature[], discovered: Feature[]): Feature[] {
  const existingIds = new Set(existing.map((f) => f.id));
  const newFeatures = discovered.filter((f) => !existingIds.has(f.id));
  return [...existing, ...newFeatures];
}

/**
 * Create an empty feature list with metadata
 */
export function createEmptyFeatureList(goal: string): FeatureList {
  const now = new Date().toISOString();
  return {
    $schema: "./feature_list.schema.json",
    features: [],
    metadata: {
      projectGoal: goal,
      createdAt: now,
      updatedAt: now,
      version: "1.0.0",
    },
  };
}

/**
 * Generate test pattern based on feature module
 *
 * Strategy:
 * Use module name to create glob pattern: tests/{module}/**\/*.test.*
 *
 * @param module - Feature module name (e.g., "auth", "verification")
 * @returns Glob pattern for related tests
 */
export function generateTestPattern(module: string): string {
  const sanitizedModule = module.replace(/[^a-zA-Z0-9_-]/g, "");
  return `tests/${sanitizedModule}/**/*.test.*`;
}

/**
 * Generate default testRequirements for a feature
 *
 * @param module - Feature module name
 * @returns Default TestRequirements with pattern
 */
export function generateTestRequirements(module: string): { unit: { required: boolean; pattern: string } } {
  return {
    unit: {
      required: false,
      pattern: generateTestPattern(module),
    },
  };
}

/**
 * Convert discovered feature to full Feature object
 */
export function discoveredToFeature(
  discovered: DiscoveredFeature,
  index: number
): Feature {
  return {
    id: discovered.id,
    description: discovered.description,
    module: discovered.module,
    priority: 10 + index, // Default priority
    status: "failing",
    acceptance: [`${discovered.description} works as expected`],
    dependsOn: [],
    supersedes: [],
    tags: [discovered.source],
    version: 1,
    origin:
      discovered.source === "route"
        ? "init-from-routes"
        : discovered.source === "test"
          ? "init-from-tests"
          : "init-auto",
    notes: "",
    testRequirements: generateTestRequirements(discovered.module),
  };
}

/**
 * Get statistics about feature list
 */
export function getFeatureStats(features: Feature[]): Record<FeatureStatus, number> {
  const stats: Record<FeatureStatus, number> = {
    failing: 0,
    passing: 0,
    blocked: 0,
    needs_review: 0,
    deprecated: 0,
  };

  for (const f of features) {
    stats[f.status]++;
  }

  return stats;
}

/**
 * Calculate completion percentage (excluding deprecated)
 */
export function getCompletionPercentage(features: Feature[]): number {
  const active = features.filter((f) => f.status !== "deprecated");
  if (active.length === 0) return 0;
  const passing = active.filter((f) => f.status === "passing").length;
  return Math.round((passing / active.length) * 100);
}

/**
 * Get features grouped by module
 */
export function groupByModule(features: Feature[]): Map<string, Feature[]> {
  const groups = new Map<string, Feature[]>();
  for (const f of features) {
    const existing = groups.get(f.module) || [];
    existing.push(f);
    groups.set(f.module, existing);
  }
  return groups;
}

/**
 * Mark a feature as deprecated
 */
export function deprecateFeature(
  features: Feature[],
  id: string,
  replacedBy?: string
): Feature[] {
  return features.map((f) => {
    if (f.id === id) {
      return {
        ...f,
        status: "deprecated" as FeatureStatus,
        notes: replacedBy
          ? `${f.notes}; Replaced by ${replacedBy}`.trim().replace(/^; /, "")
          : f.notes,
      };
    }
    return f;
  });
}

/**
 * Add a new feature to the list
 */
export function addFeature(features: Feature[], feature: Feature): Feature[] {
  // Check for duplicate ID
  if (features.some((f) => f.id === feature.id)) {
    throw new Error(`Feature with ID "${feature.id}" already exists`);
  }
  return [...features, feature];
}

/**
 * Create a new feature from user input
 */
export function createFeature(
  id: string,
  description: string,
  module: string,
  acceptance: string[],
  options: Partial<Omit<Feature, "id" | "description" | "module" | "acceptance">> = {}
): Feature {
  return {
    id,
    description,
    module,
    acceptance,
    priority: options.priority ?? 10,
    status: options.status ?? "failing",
    dependsOn: options.dependsOn ?? [],
    supersedes: options.supersedes ?? [],
    tags: options.tags ?? [],
    version: options.version ?? 1,
    origin: options.origin ?? "manual",
    notes: options.notes ?? "",
    testRequirements: options.testRequirements ?? generateTestRequirements(module),
  };
}

// ============================================================================
// Quick Operations (Index + Single File Only)
// ============================================================================

/** Valid status values for validation */
const VALID_STATUSES: FeatureStatus[] = ["failing", "passing", "blocked", "needs_review", "deprecated"];

/**
 * Quick status update - updates only index.json and single feature file
 * Much faster than full load/save cycle for status-only updates
 *
 * @param cwd - Project root directory
 * @param id - Feature ID to update
 * @param status - New status value
 * @param notes - Optional notes to update
 * @returns Updated Feature object
 * @throws Error if status is invalid or feature not found
 */
export async function updateFeatureStatusQuick(
  cwd: string,
  id: string,
  status: FeatureStatus,
  notes?: string
): Promise<Feature> {
  // Validate status
  if (!VALID_STATUSES.includes(status)) {
    throw new Error(`Invalid status: ${status}. Valid values: ${VALID_STATUSES.join(", ")}`);
  }

  // Load feature index
  const index = await loadFeatureIndex(cwd);
  if (!index) {
    throw new Error("Feature index not found. Run migration first.");
  }

  // Check feature exists in index
  if (!index.features[id]) {
    throw new Error(`Feature not found: ${id}`);
  }

  // Load single feature
  const feature = await loadSingleFeature(cwd, id);
  if (!feature) {
    throw new Error(`Feature file not found: ${id}`);
  }

  // Update feature
  const updatedFeature: Feature = {
    ...feature,
    status,
    notes: notes ?? feature.notes,
  };

  // Save updated feature (single file)
  await saveSingleFeature(cwd, updatedFeature);

  // Update index entry
  index.features[id] = {
    ...index.features[id],
    status,
  };

  // Save updated index
  await saveFeatureIndex(cwd, index);

  return updatedFeature;
}

/**
 * Quick stats lookup - reads only index.json
 * Much faster than loading all features for status statistics
 *
 * @param cwd - Project root directory
 * @returns Status counts keyed by status value
 * @throws Error if index not found
 */
export async function getFeatureStatsQuick(cwd: string): Promise<Record<FeatureStatus, number>> {
  // Load feature index only
  const index = await loadFeatureIndex(cwd);
  if (!index) {
    throw new Error("Feature index not found. Run migration first.");
  }

  // Initialize stats
  const stats: Record<FeatureStatus, number> = {
    failing: 0,
    passing: 0,
    blocked: 0,
    needs_review: 0,
    deprecated: 0,
  };

  // Count from index entries
  for (const entry of Object.values(index.features)) {
    if (entry.status in stats) {
      stats[entry.status]++;
    }
  }

  return stats;
}

/**
 * Quick next feature selection - reads index.json for selection, loads full feature only when found
 * Much faster than loading all features when only selecting next
 *
 * @param cwd - Project root directory
 * @returns Selected Feature or null if none available
 * @throws Error if index not found
 */
export async function selectNextFeatureQuick(cwd: string): Promise<Feature | null> {
  // Load feature index only
  const index = await loadFeatureIndex(cwd);
  if (!index) {
    throw new Error("Feature index not found. Run migration first.");
  }

  // Convert index entries to array with IDs for sorting
  const candidates = Object.entries(index.features)
    .filter(([, entry]) => entry.status === "needs_review" || entry.status === "failing")
    .map(([id, entry]) => ({ id, ...entry }));

  if (candidates.length === 0) {
    return null;
  }

  // Sort: needs_review first, then by priority number (lower = higher)
  const statusOrder: Record<FeatureStatus, number> = {
    needs_review: 0,
    failing: 1,
    blocked: 2,
    passing: 3,
    deprecated: 4,
  };

  candidates.sort((a, b) => {
    const statusDiff = statusOrder[a.status] - statusOrder[b.status];
    if (statusDiff !== 0) return statusDiff;
    return a.priority - b.priority;
  });

  // Load full feature for the selected one
  const selectedId = candidates[0].id;
  const feature = await loadSingleFeature(cwd, selectedId);

  if (!feature) {
    // Fall back to minimal feature from index if file missing
    const entry = index.features[selectedId];
    return {
      id: selectedId,
      description: entry.description,
      module: entry.module,
      priority: entry.priority,
      status: entry.status,
      acceptance: [],
      dependsOn: [],
      supersedes: [],
      tags: [],
      version: 1,
      origin: "manual",
      notes: "",
    };
  }

  return feature;
}
