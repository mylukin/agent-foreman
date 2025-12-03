/**
 * JSON Schema validation for feature storage (legacy JSON format)
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { FeatureList } from "./types.js";

/**
 * JSON Schema for legacy feature_list.json format (auto-migrated to modular markdown)
 */
export const featureListSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["features", "metadata"],
  properties: {
    $schema: { type: "string" },
    features: {
      type: "array",
      items: {
        type: "object",
        required: [
          "id",
          "description",
          "module",
          "priority",
          "status",
          "acceptance",
          "version",
          "origin",
        ],
        properties: {
          id: {
            type: "string",
            minLength: 1,
            description: "Unique identifier (any non-empty string without double quotes)",
          },
          description: {
            type: "string",
            minLength: 1,
            description: "Human-readable description of the feature",
          },
          module: {
            type: "string",
            minLength: 1,
            description: "Parent module or subsystem name",
          },
          priority: {
            type: "integer",
            minimum: 1,
            description: "Priority level (1 = highest)",
          },
          status: {
            type: "string",
            enum: ["failing", "passing", "blocked", "needs_review", "deprecated"],
            description: "Current feature status",
          },
          acceptance: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            description: "List of acceptance criteria",
          },
          dependsOn: {
            type: "array",
            items: { type: "string" },
            default: [],
            description: "Feature IDs this feature depends on",
          },
          supersedes: {
            type: "array",
            items: { type: "string" },
            default: [],
            description: "Feature IDs this feature replaces",
          },
          tags: {
            type: "array",
            items: { type: "string" },
            default: [],
            description: "Categorization tags",
          },
          version: {
            type: "integer",
            minimum: 1,
            description: "Version number, increments when description changes",
          },
          origin: {
            type: "string",
            enum: ["init-auto", "init-from-routes", "init-from-tests", "manual", "replan"],
            description: "How this feature was created",
          },
          notes: {
            type: "string",
            default: "",
            description: "Additional context or notes",
          },
          verification: {
            type: "object",
            properties: {
              verifiedAt: {
                type: "string",
                format: "date-time",
                description: "Last verification timestamp (ISO 8601)",
              },
              verdict: {
                type: "string",
                enum: ["pass", "fail", "needs_review"],
                description: "Verification verdict",
              },
              verifiedBy: {
                type: "string",
                description: "Agent that performed verification",
              },
              commitHash: {
                type: "string",
                description: "Git commit hash at verification time",
              },
              summary: {
                type: "string",
                description: "Brief summary of the verification result",
              },
            },
            required: ["verifiedAt", "verdict", "verifiedBy", "summary"],
            additionalProperties: false,
            description: "Last verification result",
          },
          e2eTags: {
            type: "array",
            items: { type: "string" },
            description: "E2E test tags for selective Playwright test execution (e.g., ['@feature-auth', '@smoke'])",
          },
          testRequirements: {
            type: "object",
            properties: {
              unit: {
                type: "object",
                properties: {
                  required: {
                    type: "boolean",
                    description: "Whether unit tests are required for this feature",
                  },
                  pattern: {
                    type: "string",
                    description: "Glob pattern for test files",
                  },
                  cases: {
                    type: "array",
                    items: { type: "string" },
                    description: "Expected test case names derived from acceptance criteria",
                  },
                },
                required: ["required"],
                additionalProperties: false,
                description: "Unit test requirements",
              },
              e2e: {
                type: "object",
                properties: {
                  required: {
                    type: "boolean",
                    description: "Whether E2E tests are required for this feature",
                  },
                  pattern: {
                    type: "string",
                    description: "Glob pattern for E2E test files",
                  },
                  tags: {
                    type: "array",
                    items: { type: "string" },
                    description: "Playwright tags for filtering",
                  },
                  scenarios: {
                    type: "array",
                    items: { type: "string" },
                    description: "Expected scenario names derived from acceptance criteria",
                  },
                },
                required: ["required"],
                additionalProperties: false,
                description: "E2E test requirements",
              },
            },
            additionalProperties: false,
            description: "Test requirements for TDD workflow",
          },
          testFiles: {
            type: "array",
            items: { type: "string" },
            description: "Actual test files created for this feature",
          },
        },
        additionalProperties: false,
      },
    },
    metadata: {
      type: "object",
      required: ["projectGoal", "createdAt", "updatedAt", "version"],
      properties: {
        projectGoal: {
          type: "string",
          description: "Project goal description",
        },
        createdAt: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp of creation",
        },
        updatedAt: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp of last update",
        },
        version: {
          type: "string",
          description: "Schema version",
        },
      },
      additionalProperties: false,
    },
  },
  additionalProperties: false,
};

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Create a JSON schema validator
 */
export function createValidator() {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(featureListSchema);
}

// Cached validator instance
let cachedValidator: ReturnType<typeof createValidator> | null = null;

/**
 * Get or create cached validator
 */
function getValidator() {
  if (!cachedValidator) {
    cachedValidator = createValidator();
  }
  return cachedValidator;
}

/**
 * Validate a feature list object
 */
export function validateFeatureList(data: unknown): ValidationResult {
  const validate = getValidator();
  const valid = validate(data);

  if (!valid && validate.errors) {
    return {
      valid: false,
      errors: validate.errors.map((e) => {
        const path = e.instancePath || "(root)";
        return `${path}: ${e.message}`;
      }),
    };
  }

  return { valid: true, errors: [] };
}

/**
 * Validate and return typed feature list
 */
export function parseFeatureList(data: unknown): FeatureList | null {
  const result = validateFeatureList(data);
  if (result.valid) {
    return data as FeatureList;
  }
  return null;
}

/**
 * Validate a single feature ID format
 * Accepts any non-empty string without double quotes
 */
export function isValidFeatureId(id: string): boolean {
  return id.length > 0 && !id.includes('"');
}

/**
 * Validate feature status value
 */
export function isValidStatus(status: string): status is FeatureList["features"][0]["status"] {
  return ["failing", "passing", "blocked", "needs_review", "deprecated"].includes(status);
}

// ============================================================================
// Feature Index Schema (for ai/features/index.json)
// ============================================================================

/**
 * JSON Schema for FeatureIndexEntry
 */
const featureIndexEntrySchema = {
  type: "object",
  required: ["status", "priority", "module", "description"],
  properties: {
    status: {
      type: "string",
      enum: ["failing", "passing", "blocked", "needs_review", "deprecated"],
      description: "Current feature status",
    },
    priority: {
      type: "integer",
      minimum: 1,
      description: "Priority level (1 = highest)",
    },
    module: {
      type: "string",
      minLength: 1,
      description: "Parent module or subsystem name",
    },
    description: {
      type: "string",
      minLength: 1,
      description: "Human-readable description of the feature",
    },
  },
  additionalProperties: false,
};

/**
 * JSON Schema for ai/features/index.json
 */
export const featureIndexSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["version", "updatedAt", "metadata", "features"],
  properties: {
    version: {
      type: "string",
      description: "Index format version (e.g., '2.0.0')",
    },
    updatedAt: {
      type: "string",
      format: "date-time",
      description: "ISO 8601 timestamp of last update",
    },
    metadata: {
      type: "object",
      required: ["projectGoal", "createdAt", "updatedAt", "version"],
      properties: {
        projectGoal: {
          type: "string",
          description: "Project goal description",
        },
        createdAt: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp of creation",
        },
        updatedAt: {
          type: "string",
          format: "date-time",
          description: "ISO 8601 timestamp of last update",
        },
        version: {
          type: "string",
          description: "Schema version",
        },
      },
      additionalProperties: false,
    },
    features: {
      type: "object",
      additionalProperties: featureIndexEntrySchema,
      description: "Map of feature IDs to index entries",
    },
  },
  additionalProperties: false,
};

/**
 * Create a feature index validator
 */
export function createIndexValidator() {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(featureIndexSchema);
}

// Cached index validator instance
let cachedIndexValidator: ReturnType<typeof createIndexValidator> | null = null;

/**
 * Get or create cached index validator
 */
function getIndexValidator() {
  if (!cachedIndexValidator) {
    cachedIndexValidator = createIndexValidator();
  }
  return cachedIndexValidator;
}

/**
 * Validate a feature index object
 */
export function validateFeatureIndex(data: unknown): ValidationResult {
  const validate = getIndexValidator();
  const valid = validate(data);

  if (!valid && validate.errors) {
    return {
      valid: false,
      errors: validate.errors.map((e) => {
        const path = e.instancePath || "(root)";
        return `${path}: ${e.message}`;
      }),
    };
  }

  return { valid: true, errors: [] };
}

// ============================================================================
// Feature Frontmatter Schema (for YAML frontmatter in markdown files)
// ============================================================================

/**
 * JSON Schema for YAML frontmatter in feature markdown files
 */
export const featureFrontmatterSchema = {
  $schema: "http://json-schema.org/draft-07/schema#",
  type: "object",
  required: ["id", "module", "priority", "status", "version", "origin"],
  properties: {
    id: {
      type: "string",
      minLength: 1,
      description: "Unique feature identifier",
    },
    module: {
      type: "string",
      minLength: 1,
      description: "Parent module or subsystem name",
    },
    priority: {
      type: "integer",
      minimum: 1,
      description: "Priority level (1 = highest)",
    },
    status: {
      type: "string",
      enum: ["failing", "passing", "blocked", "needs_review", "deprecated"],
      description: "Current feature status",
    },
    version: {
      type: "integer",
      minimum: 1,
      description: "Version number",
    },
    origin: {
      type: "string",
      enum: ["init-auto", "init-from-routes", "init-from-tests", "manual", "replan"],
      description: "How this feature was created",
    },
    dependsOn: {
      type: "array",
      items: { type: "string" },
      default: [],
      description: "Feature IDs this feature depends on",
    },
    supersedes: {
      type: "array",
      items: { type: "string" },
      default: [],
      description: "Feature IDs this feature replaces",
    },
    tags: {
      type: "array",
      items: { type: "string" },
      default: [],
      description: "Categorization tags",
    },
    verification: {
      type: "object",
      properties: {
        verifiedAt: {
          type: "string",
          format: "date-time",
          description: "Last verification timestamp (ISO 8601)",
        },
        verdict: {
          type: "string",
          enum: ["pass", "fail", "needs_review"],
          description: "Verification verdict",
        },
        verifiedBy: {
          type: "string",
          description: "Agent that performed verification",
        },
        commitHash: {
          type: "string",
          description: "Git commit hash at verification time",
        },
        summary: {
          type: "string",
          description: "Brief summary of the verification result",
        },
      },
      required: ["verifiedAt", "verdict", "verifiedBy", "summary"],
      additionalProperties: false,
      description: "Last verification result",
    },
    testRequirements: {
      type: "object",
      properties: {
        unit: {
          type: "object",
          properties: {
            required: { type: "boolean" },
            pattern: { type: "string" },
            cases: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["required"],
          additionalProperties: false,
        },
        e2e: {
          type: "object",
          properties: {
            required: { type: "boolean" },
            pattern: { type: "string" },
            tags: {
              type: "array",
              items: { type: "string" },
            },
            scenarios: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["required"],
          additionalProperties: false,
        },
      },
      additionalProperties: false,
      description: "Test requirements for TDD workflow",
    },
    e2eTags: {
      type: "array",
      items: { type: "string" },
      description: "E2E test tags for selective Playwright test execution",
    },
  },
  additionalProperties: false,
};

/**
 * Create a frontmatter validator
 */
export function createFrontmatterValidator() {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  return ajv.compile(featureFrontmatterSchema);
}

// Cached frontmatter validator instance
let cachedFrontmatterValidator: ReturnType<typeof createFrontmatterValidator> | null = null;

/**
 * Get or create cached frontmatter validator
 */
function getFrontmatterValidator() {
  if (!cachedFrontmatterValidator) {
    cachedFrontmatterValidator = createFrontmatterValidator();
  }
  return cachedFrontmatterValidator;
}

/**
 * Validate YAML frontmatter from a feature markdown file
 */
export function validateFeatureFrontmatter(data: unknown): ValidationResult {
  const validate = getFrontmatterValidator();
  const valid = validate(data);

  if (!valid && validate.errors) {
    return {
      valid: false,
      errors: validate.errors.map((e) => {
        const path = e.instancePath || "(root)";
        return `${path}: ${e.message}`;
      }),
    };
  }

  return { valid: true, errors: [] };
}
