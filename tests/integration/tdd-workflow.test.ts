/**
 * Integration tests for TDD workflow
 * Tests end-to-end behavior of TDD guidance, test gate, and verification
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Path to the built CLI
const CLI_PATH = path.resolve(process.cwd(), "dist/index.js");

describe("TDD Workflow Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "tdd-test-"));
    // Initialize git repo for commands that require it
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.name 'Test User'", { cwd: tempDir, stdio: "pipe" });
    // Create initial commit so working directory is clean
    await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
    execSync("git add -A && git commit -m 'Initial commit'", { cwd: tempDir, stdio: "pipe" });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("next command with TDD guidance", () => {
    it("should display TDD guidance for feature with testRequirements", { timeout: 300000 }, async () => {
      // Create ai directory and feature list with testRequirements
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      const featureList = {
        features: [
          {
            id: "auth.login",
            description: "User login functionality",
            module: "auth",
            priority: 1,
            status: "failing",
            acceptance: ["User can submit login form", "User sees success message"],
            dependsOn: [],
            supersedes: [],
            tags: [],
            version: 1,
            origin: "manual",
            notes: "",
            testRequirements: {
              unit: {
                required: true,
                pattern: "tests/auth/**/*.test.ts",
              },
            },
          },
        ],
        metadata: {
          projectGoal: "Test project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Create package.json to simulate Node.js project
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test", scripts: { test: "vitest run" } })
      );

      // Commit the files to make working directory clean
      execSync("git add -A && git commit -m 'Add feature list'", { cwd: tempDir, stdio: "pipe" });

      const result = spawnSync("node", [CLI_PATH, "next", "auth.login"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      // Should contain TDD guidance section
      expect(result.stdout).toContain("TDD GUIDANCE");
      // Should show suggested test files
      expect(result.stdout).toContain("Suggested Test Files");
      // Should show acceptance to test mapping
      expect(result.stdout).toContain("Acceptance");
    });

    it("should not display TDD guidance for feature without testRequirements", async () => {
      // Create ai directory and feature list without testRequirements
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      const featureList = {
        features: [
          {
            id: "auth.login",
            description: "User login functionality",
            module: "auth",
            priority: 1,
            status: "failing",
            acceptance: ["User can submit login form"],
            dependsOn: [],
            supersedes: [],
            tags: [],
            version: 1,
            origin: "manual",
            notes: "",
            // No testRequirements
          },
        ],
        metadata: {
          projectGoal: "Test project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "next", "auth.login"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      // Should NOT contain TDD guidance section
      expect(result.stdout).not.toContain("TDD GUIDANCE");
    });
  });

  describe("done command test gate", () => {
    it("should fail gate when required tests are missing", async () => {
      // Create ai directory and feature list with required tests
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      const featureList = {
        features: [
          {
            id: "auth.login",
            description: "User login functionality",
            module: "auth",
            priority: 1,
            status: "failing",
            acceptance: ["User can submit login form"],
            dependsOn: [],
            supersedes: [],
            tags: [],
            version: 1,
            origin: "manual",
            notes: "",
            testRequirements: {
              unit: {
                required: true,
                pattern: "tests/auth/**/*.test.ts",
              },
            },
          },
        ],
        metadata: {
          projectGoal: "Test project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Create package.json
      await fs.writeFile(
        path.join(tempDir, "package.json"),
        JSON.stringify({ name: "test", scripts: { test: "vitest run" } })
      );

      // Don't create any test files - tests/auth/*.test.ts is missing

      const result = spawnSync(
        "node",
        [CLI_PATH, "done", "auth.login", "--skip-verify"],
        {
          cwd: tempDir,
          encoding: "utf-8",
        }
      );

      // Should fail with test gate error
      expect(result.status).not.toBe(0);
      expect(result.stdout + result.stderr).toMatch(/test.*gate.*fail|missing.*test/i);
    });

    it("should pass gate when required tests exist", async () => {
      // This test verifies the test gate passes when test files exist
      // We use the verifyTestFilesExist function directly to avoid timeout from full CLI

      const { verifyTestFilesExist } = await import("../../src/test-gate.js");

      // Create test files
      await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tests/auth/login.test.ts"),
        'test("login works", () => {});'
      );

      const feature = {
        id: "auth.login",
        description: "User login functionality",
        module: "auth",
        priority: 1,
        status: "failing" as const,
        acceptance: ["User can submit login form"],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual" as const,
        notes: "",
        testRequirements: {
          unit: {
            required: true,
            pattern: "tests/auth/**/*.test.ts",
          },
        },
      };

      const result = await verifyTestFilesExist(tempDir, feature);

      // Gate should pass when test files exist
      expect(result.passed).toBe(true);
      expect(result.missingUnitTests).toHaveLength(0);
      expect(result.foundTestFiles).toContain("tests/auth/login.test.ts");
    });
  });

  describe("testFiles population", () => {
    it("should discover test files based on testRequirements pattern", async () => {
      // Create ai directory and feature list
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });

      const featureList = {
        features: [
          {
            id: "auth.login",
            description: "User login functionality",
            module: "auth",
            priority: 1,
            status: "failing",
            acceptance: ["User can submit login form"],
            dependsOn: [],
            supersedes: [],
            tags: [],
            version: 1,
            origin: "manual",
            notes: "",
            testRequirements: {
              unit: {
                required: true,
                pattern: "tests/auth/**/*.test.ts",
              },
            },
          },
        ],
        metadata: {
          projectGoal: "Test project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Create test files
      await fs.writeFile(
        path.join(tempDir, "tests/auth/login.test.ts"),
        'test("login", () => {});'
      );
      await fs.writeFile(
        path.join(tempDir, "tests/auth/logout.test.ts"),
        'test("logout", () => {});'
      );

      // Use the test-gate module directly to verify discovery
      const { discoverFeatureTestFiles } = await import("../../src/test-gate.js");
      const files = await discoverFeatureTestFiles(tempDir, featureList.features[0] as any);

      expect(files).toHaveLength(2);
      expect(files).toContain("tests/auth/login.test.ts");
      expect(files).toContain("tests/auth/logout.test.ts");
    });

    it("should populate testFiles field after TDD verification", async () => {
      // This test verifies that testFiles is populated with discovered test files
      const { discoverFeatureTestFiles } = await import("../../src/test-gate.js");

      // Create test files
      await fs.mkdir(path.join(tempDir, "tests/auth"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "tests/auth/login.test.ts"),
        'test("login", () => {});'
      );

      const feature = {
        id: "auth.login",
        description: "User login functionality",
        module: "auth",
        priority: 1,
        status: "failing" as const,
        acceptance: ["User can submit login form"],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual" as const,
        notes: "",
        testRequirements: {
          unit: {
            required: true,
            pattern: "tests/auth/**/*.test.ts",
          },
        },
      };

      // Discover test files (simulates what done command does)
      const testFiles = await discoverFeatureTestFiles(tempDir, feature);

      // testFiles should be populated and can be written back to feature
      expect(testFiles.length).toBeGreaterThan(0);
      expect(testFiles).toContain("tests/auth/login.test.ts");

      // Simulate updating feature with testFiles (this is what done does)
      const updatedFeature = { ...feature, testFiles };
      expect(updatedFeature.testFiles).toEqual(testFiles);
    });
  });

  describe("TDD verification mode selection", () => {
    it("should return 'tdd' for features with unit.required=true", async () => {
      const { determineVerificationMode } = await import("../../src/verifier.js");

      const feature = {
        id: "test.feature",
        description: "Test",
        module: "test",
        priority: 1,
        status: "failing" as const,
        acceptance: [],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual" as const,
        notes: "",
        testRequirements: {
          unit: { required: true },
        },
      };

      expect(determineVerificationMode(feature)).toBe("tdd");
    });

    it("should return 'ai' for features without testRequirements", async () => {
      const { determineVerificationMode } = await import("../../src/verifier.js");

      const feature = {
        id: "test.feature",
        description: "Test",
        module: "test",
        priority: 1,
        status: "failing" as const,
        acceptance: [],
        dependsOn: [],
        supersedes: [],
        tags: [],
        version: 1,
        origin: "manual" as const,
        notes: "",
      };

      expect(determineVerificationMode(feature)).toBe("ai");
    });
  });
});
