/**
 * Feature storage module for modular Markdown-based feature storage
 * Handles parsing and serialization of feature markdown files
 */
import matter from "gray-matter";
import type {
  Feature,
  FeatureStatus,
  FeatureOrigin,
  FeatureVerificationSummary,
  TestRequirements,
} from "./types.js";

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
  const frontmatter: Record<string, unknown> = {
    id: feature.id,
    module: feature.module,
    priority: feature.priority,
    status: feature.status,
    version: feature.version,
    origin: feature.origin,
    dependsOn: feature.dependsOn,
    supersedes: feature.supersedes,
    tags: feature.tags,
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
export function pathToFeatureId(path: string): string {
  // Remove .md extension
  const withoutExt = path.replace(/\.md$/, "");
  // Replace path separator with dot
  return withoutExt.replace(/\//g, ".");
}
