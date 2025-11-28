/**
 * JSON Schema validation for feature_list.json
 */
import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { FeatureList } from "./types.js";

/**
 * JSON Schema for feature_list.json
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
            pattern: "^[a-zA-Z][a-zA-Z0-9_.]*$",
            description: "Unique identifier using dot notation (e.g., chat.message.edit, core.app.initSentry)",
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
 */
export function isValidFeatureId(id: string): boolean {
  return /^[a-zA-Z][a-zA-Z0-9_.]*$/.test(id);
}

/**
 * Validate feature status value
 */
export function isValidStatus(status: string): status is FeatureList["features"][0]["status"] {
  return ["failing", "passing", "blocked", "needs_review", "deprecated"].includes(status);
}
