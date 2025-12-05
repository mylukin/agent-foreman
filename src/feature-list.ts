/**
 * Feature list operations for ai/feature_list.json
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Feature, FeatureList, FeatureStatus, FeatureVerificationSummary, DiscoveredFeature } from "./types.js";
import { validateFeatureList } from "./schema.js";

/** Default path for feature list file */
export const FEATURE_LIST_PATH = "ai/feature_list.json";

/**
 * Load feature list from file
 */
export async function loadFeatureList(basePath: string): Promise<FeatureList | null> {
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
 * Save feature list to file
 */
export async function saveFeatureList(basePath: string, list: FeatureList): Promise<void> {
  const filePath = path.join(basePath, FEATURE_LIST_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  list.metadata.updatedAt = new Date().toISOString();
  await fs.writeFile(filePath, JSON.stringify(list, null, 2) + "\n");
}

/**
 * Check if feature list exists
 */
export async function featureListExists(basePath: string): Promise<boolean> {
  const filePath = path.join(basePath, FEATURE_LIST_PATH);
  try {
    await fs.access(filePath);
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
