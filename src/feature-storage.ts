/**
 * Feature storage module for modular Markdown-based feature storage
 * Handles parsing and serialization of feature markdown files
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import matter from "gray-matter";
import type {
  Feature,
  FeatureIndex,
  FeatureStatus,
  FeatureOrigin,
  FeatureVerificationSummary,
  TestRequirements,
} from "./types.js";

/** Path to the feature index file relative to project root */
const INDEX_PATH = "ai/features/index.json";

/**
 * Parse a feature markdown file content into a Feature object
 *
 * Expected markdown format:
 * ```markdown
 * ---
 * id: module.feature
 * version: 1
 * origin: manual
 * dependsOn: []
 * supersedes: []
 * tags: [tag1, tag2]
 * testRequirements: {...}
 * verification: {...}
 * ---
 *
 * # Feature Description
 *
 * ## Acceptance Criteria
 *
 * 1. First criterion
 * 2. Second criterion
 *
 * ## Notes
 *
 * Additional notes here.
 * ```
 *
 * @param content - The markdown file content
 * @returns Parsed Feature object
 */
export function parseFeatureMarkdown(content: string): Feature {
  const { data: frontmatter, content: body } = matter(content);

  // Extract description from H1 heading
  const descriptionMatch = body.match(/^#\s+(.+)$/m);
  const description = descriptionMatch
    ? descriptionMatch[1].trim()
    : frontmatter.description || "";

  // Extract acceptance criteria from numbered list after "## Acceptance Criteria"
  const acceptance = extractAcceptanceCriteria(body);

  // Extract notes from "## Notes" section
  const notes = extractNotesSection(body);

  // Build Feature object from frontmatter and extracted content
  const feature: Feature = {
    id: frontmatter.id || "",
    description,
    module: frontmatter.module || extractModuleFromId(frontmatter.id || ""),
    priority: typeof frontmatter.priority === "number" ? frontmatter.priority : 0,
    status: (frontmatter.status as FeatureStatus) || "failing",
    acceptance,
    dependsOn: frontmatter.dependsOn || [],
    supersedes: frontmatter.supersedes || [],
    tags: frontmatter.tags || [],
    version: typeof frontmatter.version === "number" ? frontmatter.version : 1,
    origin: (frontmatter.origin as FeatureOrigin) || "manual",
    notes,
  };

  // Optional fields
  if (frontmatter.verification) {
    feature.verification = frontmatter.verification as FeatureVerificationSummary;
  }
  if (frontmatter.e2eTags) {
    feature.e2eTags = frontmatter.e2eTags;
  }
  if (frontmatter.testRequirements) {
    feature.testRequirements = frontmatter.testRequirements as TestRequirements;
  }
  if (frontmatter.testFiles) {
    feature.testFiles = frontmatter.testFiles;
  }

  return feature;
}

/**
 * Serialize a Feature object to markdown format with YAML frontmatter
 *
 * @param feature - The Feature object to serialize
 * @returns Markdown string with YAML frontmatter
 */
export function serializeFeatureMarkdown(feature: Feature): string {
  // Build frontmatter object (exclude fields that go in the body)
  // Use empty arrays as defaults to prevent YAML serialization errors with undefined
  const frontmatter: Record<string, unknown> = {
    id: feature.id,
    module: feature.module,
    priority: feature.priority,
    status: feature.status,
    version: feature.version,
    origin: feature.origin,
    dependsOn: feature.dependsOn || [],
    supersedes: feature.supersedes || [],
    tags: feature.tags || [],
  };

  // Add optional fields if present
  if (feature.e2eTags && feature.e2eTags.length > 0) {
    frontmatter.e2eTags = feature.e2eTags;
  }
  if (feature.testRequirements) {
    frontmatter.testRequirements = feature.testRequirements;
  }
  if (feature.testFiles && feature.testFiles.length > 0) {
    frontmatter.testFiles = feature.testFiles;
  }
  if (feature.verification) {
    frontmatter.verification = feature.verification;
  }

  // Build markdown body
  const bodyParts: string[] = [];

  // H1 heading with description
  bodyParts.push(`# ${feature.description}`);
  bodyParts.push("");

  // Acceptance criteria section
  if (feature.acceptance.length > 0) {
    bodyParts.push("## Acceptance Criteria");
    bodyParts.push("");
    feature.acceptance.forEach((criterion, index) => {
      bodyParts.push(`${index + 1}. ${criterion}`);
    });
    bodyParts.push("");
  }

  // Notes section
  if (feature.notes && feature.notes.trim()) {
    bodyParts.push("## Notes");
    bodyParts.push("");
    bodyParts.push(feature.notes.trim());
    bodyParts.push("");
  }

  const body = bodyParts.join("\n");

  // Use gray-matter to stringify with frontmatter
  return matter.stringify(body, frontmatter);
}

/**
 * Extract acceptance criteria from markdown body
 */
function extractAcceptanceCriteria(body: string): string[] {
  const criteria: string[] = [];

  // Find the "## Acceptance Criteria" section
  const sectionMatch = body.match(
    /## Acceptance Criteria\s*\n([\s\S]*?)(?=\n## |\n# |$)/i
  );

  if (sectionMatch) {
    const section = sectionMatch[1];
    // Match numbered list items: 1. text, 2. text, etc.
    const itemRegex = /^\d+\.\s+(.+)$/gm;
    let match;
    while ((match = itemRegex.exec(section)) !== null) {
      criteria.push(match[1].trim());
    }
  }

  return criteria;
}

/**
 * Extract notes from the "## Notes" section
 */
function extractNotesSection(body: string): string {
  // Find the "## Notes" section
  const sectionMatch = body.match(
    /## Notes\s*\n([\s\S]*?)(?=\n## |\n# |$)/i
  );

  if (sectionMatch) {
    return sectionMatch[1].trim();
  }

  return "";
}

/**
 * Extract module name from feature ID (e.g., "cli.survey" -> "cli")
 */
function extractModuleFromId(id: string): string {
  const parts = id.split(".");
  return parts.length > 1 ? parts[0] : id;
}

/**
 * Convert feature ID to file path
 * e.g., "cli.survey" -> "cli/survey.md"
 *
 * @param id - The feature ID
 * @returns Relative path to the markdown file
 */
export function featureIdToPath(id: string): string {
  const parts = id.split(".");
  if (parts.length === 1) {
    return `${id}.md`;
  }
  const module = parts[0];
  const name = parts.slice(1).join(".");
  return `${module}/${name}.md`;
}

/**
 * Convert file path to feature ID
 * e.g., "cli/survey.md" -> "cli.survey"
 *
 * @param path - The relative path to the markdown file
 * @returns Feature ID
 */
export function pathToFeatureId(filePath: string): string {
  // Remove .md extension
  const withoutExt = filePath.replace(/\.md$/, "");
  // Replace path separator with dot
  return withoutExt.replace(/\//g, ".");
}

// ============================================================================
// Feature Index Operations
// ============================================================================

/**
 * Load the feature index from ai/features/index.json
 *
 * @param cwd - The project root directory
 * @returns FeatureIndex object or null if file doesn't exist
 */
export async function loadFeatureIndex(cwd: string): Promise<FeatureIndex | null> {
  const indexPath = path.join(cwd, INDEX_PATH);

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content) as FeatureIndex;
  } catch (error) {
    // Return null if file doesn't exist
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Save the feature index to ai/features/index.json
 * Uses atomic write pattern to prevent corruption
 *
 * @param cwd - The project root directory
 * @param index - The FeatureIndex object to save
 */
export async function saveFeatureIndex(cwd: string, index: FeatureIndex): Promise<void> {
  const indexPath = path.join(cwd, INDEX_PATH);
  const tempPath = `${indexPath}.tmp`;

  // Update timestamp
  const updatedIndex: FeatureIndex = {
    ...index,
    updatedAt: new Date().toISOString(),
  };

  // Ensure directory exists
  await fs.mkdir(path.dirname(indexPath), { recursive: true });

  // Write to temp file first (atomic write pattern)
  await fs.writeFile(tempPath, JSON.stringify(updatedIndex, null, 2), "utf-8");

  // Rename temp file to actual file (atomic on most filesystems)
  await fs.rename(tempPath, indexPath);
}

// ============================================================================
// Single Feature Operations
// ============================================================================

/** Path to the features directory relative to project root */
const FEATURES_DIR = "ai/features";

/**
 * Load a single feature from its markdown file
 *
 * @param cwd - The project root directory
 * @param featureId - The feature ID (e.g., "cli.survey")
 * @returns Feature object or null if file doesn't exist
 */
export async function loadSingleFeature(
  cwd: string,
  featureId: string
): Promise<Feature | null> {
  const relativePath = featureIdToPath(featureId);
  const fullPath = path.join(cwd, FEATURES_DIR, relativePath);

  try {
    const content = await fs.readFile(fullPath, "utf-8");
    return parseFeatureMarkdown(content);
  } catch (error) {
    // Return null if file doesn't exist
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

/**
 * Save a single feature to its markdown file
 *
 * @param cwd - The project root directory
 * @param feature - The Feature object to save
 */
export async function saveSingleFeature(
  cwd: string,
  feature: Feature
): Promise<void> {
  const relativePath = featureIdToPath(feature.id);
  const fullPath = path.join(cwd, FEATURES_DIR, relativePath);

  // Ensure module directory exists
  await fs.mkdir(path.dirname(fullPath), { recursive: true });

  // Serialize and write
  const content = serializeFeatureMarkdown(feature);
  await fs.writeFile(fullPath, content, "utf-8");
}

// ============================================================================
// Migration Detection
// ============================================================================

/** Path to the legacy feature list file */
const LEGACY_FEATURE_LIST_PATH = "ai/feature_list.json";

/**
 * Check if migration from old format to new format is needed
 *
 * Returns true if:
 * - ai/feature_list.json exists
 * - ai/features/index.json does NOT exist
 *
 * @param cwd - The project root directory
 * @returns true if migration is needed
 */
export async function needsMigration(cwd: string): Promise<boolean> {
  const legacyPath = path.join(cwd, LEGACY_FEATURE_LIST_PATH);
  const indexPath = path.join(cwd, INDEX_PATH);

  // Check if index.json already exists
  try {
    await fs.access(indexPath);
    // index.json exists - no migration needed
    return false;
  } catch {
    // index.json doesn't exist - check for legacy file
  }

  // Check if legacy feature_list.json exists
  try {
    await fs.access(legacyPath);
    // Legacy file exists and index.json doesn't - migration needed
    return true;
  } catch {
    // Neither file exists - no migration needed
    return false;
  }
}

// ============================================================================
// Migration Execution
// ============================================================================

/**
 * Result of a migration operation
 */
export interface MigrationResult {
  /** Number of features successfully migrated */
  migrated: number;
  /** Errors encountered during migration */
  errors: string[];
  /** Whether the migration was successful overall */
  success: boolean;
}

/**
 * Migrate from legacy feature_list.json to modular markdown format
 *
 * This function:
 * 1. Loads the existing feature_list.json
 * 2. Creates the ai/features/ directory structure
 * 3. Writes each feature to its own markdown file
 * 4. Builds and saves index.json
 * 5. Backs up the old file as feature_list.json.bak
 *
 * @param cwd - The project root directory
 * @returns MigrationResult with count and errors
 */
export async function migrateToMarkdown(cwd: string): Promise<MigrationResult> {
  const legacyPath = path.join(cwd, LEGACY_FEATURE_LIST_PATH);
  const backupPath = `${legacyPath}.bak`;
  const result: MigrationResult = {
    migrated: 0,
    errors: [],
    success: false,
  };

  // 1. Load existing feature_list.json
  let legacyData: { features: Feature[]; metadata: { projectGoal: string; createdAt: string; updatedAt: string; version: string } };
  try {
    const content = await fs.readFile(legacyPath, "utf-8");
    legacyData = JSON.parse(content);
  } catch (error) {
    result.errors.push(`Failed to load feature_list.json: ${(error as Error).message}`);
    return result;
  }

  // 2. Create ai/features/ directory structure
  try {
    await fs.mkdir(path.join(cwd, FEATURES_DIR), { recursive: true });
  } catch (error) {
    result.errors.push(`Failed to create features directory: ${(error as Error).message}`);
    return result;
  }

  // 3. Write each feature to {module}/{name}.md
  const indexFeatures: Record<string, { status: FeatureStatus; priority: number; module: string; description: string }> = {};

  for (const feature of legacyData.features) {
    try {
      await saveSingleFeature(cwd, feature);

      // Add to index
      indexFeatures[feature.id] = {
        status: feature.status,
        priority: feature.priority,
        module: feature.module,
        description: feature.description,
      };

      result.migrated++;
    } catch (error) {
      result.errors.push(`Failed to migrate feature ${feature.id}: ${(error as Error).message}`);
    }
  }

  // 4. Build and save index.json
  try {
    const index: FeatureIndex = {
      version: "2.0.0",
      updatedAt: new Date().toISOString(),
      metadata: legacyData.metadata,
      features: indexFeatures,
    };
    await saveFeatureIndex(cwd, index);
  } catch (error) {
    result.errors.push(`Failed to save index.json: ${(error as Error).message}`);
    return result;
  }

  // 5. Backup old file as feature_list.json.bak
  try {
    await fs.copyFile(legacyPath, backupPath);
  } catch (error) {
    result.errors.push(`Failed to backup feature_list.json: ${(error as Error).message}`);
    // Continue anyway - migration was successful even if backup failed
  }

  result.success = result.errors.length === 0;
  return result;
}

/**
 * Automatically migrate from legacy format if needed
 *
 * This function is safe to call multiple times (idempotent).
 * It will only perform migration if:
 * - ai/feature_list.json exists
 * - ai/features/index.json does NOT exist
 *
 * @param cwd - The project root directory
 * @param silent - If true, suppress console output (default: false)
 * @returns MigrationResult if migration was performed, null otherwise
 */
export async function autoMigrateIfNeeded(
  cwd: string,
  silent = false
): Promise<MigrationResult | null> {
  // Check if migration is needed
  const migrationNeeded = await needsMigration(cwd);

  if (!migrationNeeded) {
    return null;
  }

  // Log migration start
  if (!silent) {
    console.log("📦 Migrating feature list to modular format...");
  }

  // Perform migration
  const result = await migrateToMarkdown(cwd);

  // Log results
  if (!silent) {
    if (result.success) {
      console.log(`✓ Migrated ${result.migrated} features to ai/features/`);
      console.log("  Backup saved: ai/feature_list.json.bak");
    } else {
      console.log(`⚠ Migration completed with errors:`);
      for (const error of result.errors) {
        console.log(`  - ${error}`);
      }
    }
  }

  return result;
}
