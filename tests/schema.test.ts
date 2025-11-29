/**
 * Tests for src/schema.ts - JSON Schema validation
 */
import { describe, it, expect } from "vitest";
import {
  validateFeatureList,
  parseFeatureList,
  isValidFeatureId,
  isValidStatus,
  featureListSchema,
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

    it("should reject invalid feature ID format", () => {
      const invalid = {
        ...validFeatureList,
        features: [
          {
            ...validFeatureList.features[0],
            id: "Invalid-ID", // uppercase not allowed
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
    it("should accept valid feature IDs", () => {
      expect(isValidFeatureId("auth")).toBe(true);
      expect(isValidFeatureId("auth.login")).toBe(true);
      expect(isValidFeatureId("auth.password.reset")).toBe(true);
      expect(isValidFeatureId("api.v2.users")).toBe(true);
      expect(isValidFeatureId("feature_with_underscore")).toBe(true);
      expect(isValidFeatureId("a1.b2.c3")).toBe(true);
    });

    it("should reject invalid feature IDs", () => {
      expect(isValidFeatureId("")).toBe(false);
      expect(isValidFeatureId("1auth")).toBe(false); // starts with number
      expect(isValidFeatureId("auth-login")).toBe(false); // hyphen
      expect(isValidFeatureId("auth login")).toBe(false); // space
      expect(isValidFeatureId(".auth")).toBe(false); // starts with dot
    });

    it("should accept uppercase feature IDs", () => {
      expect(isValidFeatureId("Auth")).toBe(true); // uppercase allowed
      expect(isValidFeatureId("AuthLogin")).toBe(true);
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
