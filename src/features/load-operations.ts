/**
 * Feature list loading operations
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { glob } from "glob";
import type { Feature, FeatureList, FeatureIndex } from "../types/index.js";
import { validateFeatureList } from "../schemas/index.js";
import {
  loadFeatureIndex,
  parseFeatureMarkdown,
  autoMigrateIfNeeded,
} from "../storage/index.js";
import { FEATURE_LIST_PATH, TASKS_DIR } from "./constants.js";
import { syncIndexFromFeatures } from "./sync-operations.js";

/**
 * Load feature list from file
 * Supports both new modular format (ai/tasks/) and legacy JSON format
 *
 * Strategy:
 * 1. Try new format (index.json) first
 * 2. Auto-migrate if old format detected
 * 3. Load all features from markdown files (source of truth)
 * 4. Fall back to legacy format if neither exists
 */
export async function loadFeatureList(basePath: string): Promise<FeatureList | null> {
  // 1. Check if new format exists (index.json)
  const index = await loadFeatureIndex(basePath);

  if (index) {
    // Scan all features from markdown files (filesystem is source of truth)
    const features = await scanTaskFiles(basePath);

    // Auto-sync: update index.json to match .md files (add new, remove orphan, update status)
    await syncIndexFromFeatures(basePath, features, index);

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
    // Legacy file exists - attempt auto-migration (silent to not corrupt JSON output)
    await autoMigrateIfNeeded(basePath, true);

    // After migration, try loading from new format
    const migratedIndex = await loadFeatureIndex(basePath);
    if (migratedIndex) {
      const features = await scanTaskFiles(basePath);

      // Auto-sync: fix index.json if status differs from .md files
      await syncIndexFromFeatures(basePath, features, migratedIndex);

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
 * Scan filesystem for task files
 * Finds all ai/tasks/**\/*.md files and parses them into Features
 */
async function scanTaskFiles(basePath: string): Promise<Feature[]> {
  const tasksDir = path.join(basePath, TASKS_DIR);
  
  // Ensure tasks dir exists
  try {
    await fs.access(tasksDir);
  } catch {
    return [];
  }

  // Find all markdown files in tasks directory
  // Ignore spec files as they are not tasks
  const files = await glob(`${TASKS_DIR}/**/*.md`, {
    cwd: basePath,
    ignore: [`${TASKS_DIR}/spec/**/*.md`],
    nodir: true,
  });

  const features: Feature[] = [];
  
  // Load files in parallel
  const loadPromises = files.map(async (file) => {
    try {
      const absolutePath = path.join(basePath, file);
      const content = await fs.readFile(absolutePath, "utf-8");
      const feature = parseFeatureMarkdown(content);
      
      // Calculate filePath relative to TASKS_DIR (ai/tasks)
      // file is "ai/tasks/subdir/foo.md" -> "subdir/foo.md"
      feature.filePath = path.relative(TASKS_DIR, file);
      
      return feature;
    } catch (err) {
      console.warn(`Failed to load task file ${file}:`, err);
      return null;
    }
  });

  const results = await Promise.all(loadPromises);
  
  // Filter out nulls
  for (const result of results) {
    if (result) {
      features.push(result);
    }
  }

  return features;
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
 * Check if feature list exists
 * Checks for both new format (index.json) and legacy format
 */
export async function featureListExists(basePath: string): Promise<boolean> {
  // Check new format first
  const indexPath = path.join(basePath, TASKS_DIR, "index.json");
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

/** Alias for loadFeatureList - loads a task list */
export const loadTaskList = loadFeatureList;

/** Alias for featureListExists - checks if task list exists */
export const taskListExists = featureListExists;
