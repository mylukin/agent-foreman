/**
 * Tests for Test Gate Module
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  verifyTestFilesExist,
  discoverFeatureTestFiles,
  type TestGateResult,
} from "../src/test-gate.js";
import type { Feature } from "../src/types.js";

describe("verifyTestFilesExist", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-gate-"));
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createFeature = (overrides: Partial<Feature> = {}): Feature => ({
    id: "auth.login",
    description: "User login functionality",
    module: "auth",
    priority: 1,
    status: "failing",
    acceptance: [],
    dependsOn: [],
    supersedes: [],
    tags: [],
    version: 1,
    origin: "manual",
    notes: "",
    ...overrides,
  });

  it("should pass when no testRequirements defined", async () => {
    const feature = createFeature();
    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
    expect(result.missingUnitTests).toHaveLength(0);
    expect(result.missingE2ETests).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
  });

  it("should pass when unit tests are required and exist", async () => {
    // Create test file
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/auth/**/*.test.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
    expect(result.missingUnitTests).toHaveLength(0);
    expect(result.foundTestFiles).toContain("tests/auth/login.test.ts");
  });

  it("should fail when unit tests are required but missing", async () => {
    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/auth/**/*.test.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(false);
    expect(result.missingUnitTests).toContain("tests/auth/**/*.test.ts");
  });

  it("should pass when E2E tests are required and exist", async () => {
    // Create E2E test file
    await fs.mkdir(path.join(tempDir, "e2e/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "e2e/auth/login.spec.ts"),
      "test content"
    );

    const feature = createFeature({
      testRequirements: {
        e2e: {
          required: true,
          pattern: "e2e/auth/**/*.spec.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
    expect(result.missingE2ETests).toHaveLength(0);
    expect(result.foundTestFiles).toContain("e2e/auth/login.spec.ts");
  });

  it("should fail when E2E tests are required but missing", async () => {
    const feature = createFeature({
      testRequirements: {
        e2e: {
          required: true,
          pattern: "e2e/auth/**/*.spec.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(false);
    expect(result.missingE2ETests).toContain("e2e/auth/**/*.spec.ts");
  });

  it("should check both unit and E2E when both are required", async () => {
    // Create only unit test
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/auth/**/*.test.ts",
        },
        e2e: {
          required: true,
          pattern: "e2e/auth/**/*.spec.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(false);
    expect(result.missingUnitTests).toHaveLength(0);
    expect(result.missingE2ETests).toContain("e2e/auth/**/*.spec.ts");
    expect(result.foundTestFiles).toContain("tests/auth/login.test.ts");
  });

  it("should pass when both unit and E2E tests exist", async () => {
    // Create both test files
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "e2e/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );
    await fs.writeFile(
      path.join(tempDir, "e2e/auth/login.spec.ts"),
      "test content"
    );

    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/auth/**/*.test.ts",
        },
        e2e: {
          required: true,
          pattern: "e2e/auth/**/*.spec.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
    expect(result.missingUnitTests).toHaveLength(0);
    expect(result.missingE2ETests).toHaveLength(0);
    expect(result.foundTestFiles).toHaveLength(2);
  });

  it("should use testPattern fallback when unit pattern not specified", async () => {
    // Create test file matching testPattern
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      testPattern: "tests/auth/**/*.test.ts",
      testRequirements: {
        unit: {
          required: true,
          // No pattern specified - should fall back to testPattern
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
    expect(result.foundTestFiles).toContain("tests/auth/login.test.ts");
  });

  it("should use module-based default pattern when no patterns specified", async () => {
    // Create test file in default location
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/something.test.ts"),
      "test content"
    );

    const feature = createFeature({
      module: "auth",
      testRequirements: {
        unit: {
          required: true,
          // No pattern specified - should use module-based default
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
  });

  it("should pass when unit.required is false", async () => {
    const feature = createFeature({
      testRequirements: {
        unit: {
          required: false,
          pattern: "tests/nonexistent/**/*.test.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
  });

  it("should pass when e2e.required is false", async () => {
    const feature = createFeature({
      testRequirements: {
        e2e: {
          required: false,
          pattern: "e2e/nonexistent/**/*.spec.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(true);
  });

  it("should return correct arrays for mixed results", async () => {
    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/missing/**/*.test.ts",
        },
        e2e: {
          required: true,
          pattern: "e2e/also-missing/**/*.spec.ts",
        },
      },
    });

    const result = await verifyTestFilesExist(tempDir, feature);

    expect(result.passed).toBe(false);
    expect(result.missingUnitTests).toEqual(["tests/missing/**/*.test.ts"]);
    expect(result.missingE2ETests).toEqual(["e2e/also-missing/**/*.spec.ts"]);
    expect(result.foundTestFiles).toHaveLength(0);
  });

});

describe("discoverFeatureTestFiles", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-discovery-"));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const createFeature = (overrides: Partial<Feature> = {}): Feature => ({
    id: "auth.login",
    description: "User login functionality",
    module: "auth",
    priority: 1,
    status: "failing",
    acceptance: [],
    dependsOn: [],
    supersedes: [],
    tags: [],
    version: 1,
    origin: "manual",
    notes: "",
    ...overrides,
  });

  it("should discover files from testRequirements.unit.pattern", async () => {
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/auth/**/*.test.ts",
        },
      },
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    expect(files).toContain("tests/auth/login.test.ts");
  });

  it("should discover files from testRequirements.e2e.pattern", async () => {
    await fs.mkdir(path.join(tempDir, "e2e/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "e2e/auth/login.spec.ts"),
      "test content"
    );

    const feature = createFeature({
      testRequirements: {
        e2e: {
          required: true,
          pattern: "e2e/auth/**/*.spec.ts",
        },
      },
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    expect(files).toContain("e2e/auth/login.spec.ts");
  });

  it("should discover files from legacy testPattern", async () => {
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      testPattern: "tests/auth/**/*.test.ts",
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    expect(files).toContain("tests/auth/login.test.ts");
  });

  it("should combine files from multiple patterns", async () => {
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.mkdir(path.join(tempDir, "e2e/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );
    await fs.writeFile(
      path.join(tempDir, "e2e/auth/login.spec.ts"),
      "test content"
    );

    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/auth/**/*.test.ts",
        },
        e2e: {
          required: true,
          pattern: "e2e/auth/**/*.spec.ts",
        },
      },
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    expect(files).toHaveLength(2);
    expect(files).toContain("tests/auth/login.test.ts");
    expect(files).toContain("e2e/auth/login.spec.ts");
  });

  it("should deduplicate files from overlapping patterns", async () => {
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      testPattern: "tests/auth/**/*.test.ts",
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/auth/**/*.test.ts", // Same pattern
        },
      },
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    // Should be deduplicated
    expect(files).toHaveLength(1);
    expect(files).toContain("tests/auth/login.test.ts");
  });

  it("should use module-based fallback when no patterns defined", async () => {
    await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/auth/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      module: "auth",
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    expect(files).toContain("tests/auth/login.test.ts");
  });

  it("should return empty array when no files match", async () => {
    const feature = createFeature({
      testRequirements: {
        unit: {
          required: true,
          pattern: "tests/nonexistent/**/*.test.ts",
        },
      },
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    expect(files).toHaveLength(0);
  });

  it("should handle special characters in module names", async () => {
    await fs.mkdir(path.join(tempDir, "tests/user-auth-module"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "tests/user-auth-module/login.test.ts"),
      "test content"
    );

    const feature = createFeature({
      module: "User Auth Module",
    });

    const files = await discoverFeatureTestFiles(tempDir, feature);

    expect(files).toContain("tests/user-auth-module/login.test.ts");
  });
});
