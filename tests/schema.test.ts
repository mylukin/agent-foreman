/**
 * Tests for src/schema.ts - JSON Schema validation
 */
import { describe, it, expect } from "vitest";
import {
  validateFeatureList,
  validateFeatureIndex,
  parseFeatureList,
  isValidFeatureId,
  isValidStatus,
  featureListSchema,
  featureIndexSchema,
} from "../src/schema.js";
import type { FeatureList } from "../src/types.js";

describe("Feature List Schema", () => {
  const validFeatureList: FeatureList = {
    features: [
      {
        id: "auth.login",
        description: "User can log in",
        module: "auth",
        priority: 1,
        status: "failing",
        acceptance: ["User enters credentials", "System validates"],
        dependsOn: [],
        supersedes: [],
        tags: ["auth"],
        version: 1,
        origin: "manual",
        notes: "",
      },
    ],
    metadata: {
      projectGoal: "Build auth system",
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
      version: "1.0.0",
    },
  };

  describe("validateFeatureList", () => {
    it("should validate correct feature list structure", () => {
      const result = validateFeatureList(validFeatureList);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should reject missing required fields", () => {
      const invalid = {
        features: [],
        // missing metadata
      };
      const result = validateFeatureList(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject invalid status values", () => {
      const invalid = {
        ...validFeatureList,
        features: [
          {
            ...validFeatureList.features[0],
            status: "invalid_status",
          },
        ],
      };
      const result = validateFeatureList(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes("status"))).toBe(true);
    });

    it("should accept flexible feature ID formats", () => {
      // Now accepts any non-empty string
      const valid = {
        ...validFeatureList,
        features: [
          {
            ...validFeatureList.features[0],
            id: "Any-Format_123.test",
          },
        ],
      };
      const result = validateFeatureList(valid);
      expect(result.valid).toBe(true);
    });

    it("should reject empty feature ID", () => {
      const invalid = {
        ...validFeatureList,
        features: [
          {
            ...validFeatureList.features[0],
            id: "",
          },
        ],
      };
      const result = validateFeatureList(invalid);
      expect(result.valid).toBe(false);
    });

    it("should reject empty acceptance array", () => {
      const invalid = {
        ...validFeatureList,
        features: [
          {
            ...validFeatureList.features[0],
            acceptance: [], // must have at least 1
          },
        ],
      };
      const result = validateFeatureList(invalid);
      expect(result.valid).toBe(false);
    });

    it("should reject priority less than 1", () => {
      const invalid = {
        ...validFeatureList,
        features: [
          {
            ...validFeatureList.features[0],
            priority: 0,
          },
        ],
      };
      const result = validateFeatureList(invalid);
      expect(result.valid).toBe(false);
    });

    it("should accept all valid status values", () => {
      const statuses = ["failing", "passing", "blocked", "needs_review", "deprecated"];
      for (const status of statuses) {
        const list = {
          ...validFeatureList,
          features: [
            {
              ...validFeatureList.features[0],
              status,
            },
          ],
        };
        const result = validateFeatureList(list);
        expect(result.valid).toBe(true);
      }
    });

    it("should accept all valid origin values", () => {
      const origins = ["init-auto", "init-from-routes", "init-from-tests", "manual", "replan"];
      for (const origin of origins) {
        const list = {
          ...validFeatureList,
          features: [
            {
              ...validFeatureList.features[0],
              origin,
            },
          ],
        };
        const result = validateFeatureList(list);
        expect(result.valid).toBe(true);
      }
    });

    it("should validate feature list with multiple features", () => {
      const multiFeature = {
        ...validFeatureList,
        features: [
          validFeatureList.features[0],
          {
            ...validFeatureList.features[0],
            id: "auth.logout",
            description: "User can log out",
          },
        ],
      };
      const result = validateFeatureList(multiFeature);
      expect(result.valid).toBe(true);
    });

    it("should validate empty features array", () => {
      const emptyFeatures = {
        ...validFeatureList,
        features: [],
      };
      const result = validateFeatureList(emptyFeatures);
      expect(result.valid).toBe(true);
    });
  });

  describe("parseFeatureList", () => {
    it("should return typed feature list for valid data", () => {
      const result = parseFeatureList(validFeatureList);
      expect(result).not.toBeNull();
      expect(result?.features).toHaveLength(1);
      expect(result?.metadata.projectGoal).toBe("Build auth system");
    });

    it("should return null for invalid data", () => {
      const invalid = { invalid: true };
      const result = parseFeatureList(invalid);
      expect(result).toBeNull();
    });
  });

  describe("isValidFeatureId", () => {
    it("should accept any non-empty string without double quotes", () => {
      expect(isValidFeatureId("auth")).toBe(true);
      expect(isValidFeatureId("auth.login")).toBe(true);
      expect(isValidFeatureId("auth-login")).toBe(true);
      expect(isValidFeatureId("1auth")).toBe(true);
      expect(isValidFeatureId(".auth")).toBe(true);
      expect(isValidFeatureId("Auth Login")).toBe(true);
      expect(isValidFeatureId("任何中文")).toBe(true);
      expect(isValidFeatureId("feature/with/slashes")).toBe(true);
    });

    it("should reject empty string", () => {
      expect(isValidFeatureId("")).toBe(false);
    });

    it("should reject strings containing double quotes", () => {
      expect(isValidFeatureId('has"quote')).toBe(false);
      expect(isValidFeatureId('"quoted"')).toBe(false);
    });
  });

  describe("isValidStatus", () => {
    it("should accept valid status values", () => {
      expect(isValidStatus("failing")).toBe(true);
      expect(isValidStatus("passing")).toBe(true);
      expect(isValidStatus("blocked")).toBe(true);
      expect(isValidStatus("needs_review")).toBe(true);
      expect(isValidStatus("deprecated")).toBe(true);
    });

    it("should reject invalid status values", () => {
      expect(isValidStatus("invalid")).toBe(false);
      expect(isValidStatus("")).toBe(false);
      expect(isValidStatus("PASSING")).toBe(false);
      expect(isValidStatus("complete")).toBe(false);
    });
  });

  describe("featureListSchema", () => {
    it("should have correct schema structure", () => {
      expect(featureListSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
      expect(featureListSchema.type).toBe("object");
      expect(featureListSchema.required).toContain("features");
      expect(featureListSchema.required).toContain("metadata");
    });
  });
});

describe("Feature Index Schema", () => {
  const validFeatureIndex = {
    version: "2.0.0",
    updatedAt: "2024-01-15T10:00:00Z",
    metadata: {
      projectGoal: "Build auth system",
      createdAt: "2024-01-15T10:00:00Z",
      updatedAt: "2024-01-15T10:00:00Z",
      version: "1.0.0",
    },
    features: {
      "auth.login": {
        status: "failing",
        priority: 1,
        module: "auth",
        description: "User can log in",
      },
    },
  };

  describe("featureIndexSchema", () => {
    it("should be defined in src/schema.ts", () => {
      expect(featureIndexSchema).toBeDefined();
      expect(featureIndexSchema.$schema).toBe("http://json-schema.org/draft-07/schema#");
    });

    it("should have required fields: version, updatedAt, metadata, features", () => {
      expect(featureIndexSchema.required).toContain("version");
      expect(featureIndexSchema.required).toContain("updatedAt");
      expect(featureIndexSchema.required).toContain("metadata");
      expect(featureIndexSchema.required).toContain("features");
    });
  });

  describe("validateFeatureIndex", () => {
    it("should validate correct index structure", () => {
      const result = validateFeatureIndex(validFeatureIndex);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it("should validate version, updatedAt, metadata, features fields", () => {
      const result = validateFeatureIndex(validFeatureIndex);
      expect(result.valid).toBe(true);
    });

    it("should validate FeatureIndexEntry structure within features", () => {
      // Valid entry
      const result = validateFeatureIndex(validFeatureIndex);
      expect(result.valid).toBe(true);

      // Invalid entry - missing required field
      const invalidEntry = {
        ...validFeatureIndex,
        features: {
          "test.feature": {
            status: "failing",
            priority: 1,
            // missing module and description
          },
        },
      };
      const invalidResult = validateFeatureIndex(invalidEntry);
      expect(invalidResult.valid).toBe(false);
    });

    it("should return ValidationResult type", () => {
      const result = validateFeatureIndex(validFeatureIndex);
      expect(result).toHaveProperty("valid");
      expect(result).toHaveProperty("errors");
      expect(typeof result.valid).toBe("boolean");
      expect(Array.isArray(result.errors)).toBe(true);
    });

    it("should reject missing required fields", () => {
      const invalid = {
        version: "2.0.0",
        // missing updatedAt, metadata, features
      };
      const result = validateFeatureIndex(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it("should reject invalid status in FeatureIndexEntry", () => {
      const invalid = {
        ...validFeatureIndex,
        features: {
          "test.feature": {
            status: "invalid_status",
            priority: 1,
            module: "test",
            description: "Test feature",
          },
        },
      };
      const result = validateFeatureIndex(invalid);
      expect(result.valid).toBe(false);
    });

    it("should reject invalid priority in FeatureIndexEntry", () => {
      const invalid = {
        ...validFeatureIndex,
        features: {
          "test.feature": {
            status: "failing",
            priority: 0, // must be >= 1
            module: "test",
            description: "Test feature",
          },
        },
      };
      const result = validateFeatureIndex(invalid);
      expect(result.valid).toBe(false);
    });

    it("should accept all valid status values in entries", () => {
      const statuses = ["failing", "passing", "blocked", "needs_review", "deprecated"];
      for (const status of statuses) {
        const index = {
          ...validFeatureIndex,
          features: {
            "test.feature": {
              status,
              priority: 1,
              module: "test",
              description: "Test feature",
            },
          },
        };
        const result = validateFeatureIndex(index);
        expect(result.valid).toBe(true);
      }
    });

    it("should validate empty features object", () => {
      const emptyFeatures = {
        ...validFeatureIndex,
        features: {},
      };
      const result = validateFeatureIndex(emptyFeatures);
      expect(result.valid).toBe(true);
    });
  });
});
