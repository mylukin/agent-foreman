/**
 * Integration tests for CLI commands
 * Tests end-to-end behavior with real file system operations
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Path to the built CLI
const CLI_PATH = path.resolve(process.cwd(), "dist/index.js");

describe("CLI Integration", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foreman-test-"));
    // Initialize git repo for commands that require it
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.name 'Test User'", { cwd: tempDir, stdio: "pipe" });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("status command", () => {
    it("should show error when no feature list exists", () => {
      const result = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("No feature list found");
    });

    it("should show JSON error when no feature list exists with --json flag", () => {
      const result = spawnSync("node", [CLI_PATH, "status", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      const output = JSON.parse(result.stdout);
      expect(output.error).toBe("No feature list found");
    });

    it("should show statistics when feature list exists", async () => {
      // Create a minimal feature list
      const featureList = {
        features: [
          {
            id: "test.feature1",
            description: "Test feature 1",
            module: "test",
            priority: 1,
            status: "passing",
            acceptance: ["Criterion 1"],
            version: 1,
            origin: "manual",
          },
          {
            id: "test.feature2",
            description: "Test feature 2",
            module: "test",
            priority: 2,
            status: "failing",
            acceptance: ["Criterion 2"],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("Passing: 1");
      expect(result.stdout).toContain("Failing: 1");
      expect(result.stdout).toContain("50%"); // 1 of 2 passing
    });

    it("should output JSON with --json flag", async () => {
      const featureList = {
        features: [
          {
            id: "test.feature1",
            description: "Test",
            module: "test",
            priority: 1,
            status: "passing",
            acceptance: ["Criterion"],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "status", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      const output = JSON.parse(result.stdout);
      expect(output.stats).toBeDefined();
      expect(output.stats.passing).toBe(1);
      expect(output.stats.total).toBe(1);
      expect(output.completion).toBe(100);
    });

    it("should output quiet format with --quiet flag", async () => {
      const featureList = {
        features: [
          {
            id: "test.feature1",
            description: "Test",
            module: "test",
            priority: 1,
            status: "passing",
            acceptance: ["Criterion"],
            version: 1,
            origin: "manual",
          },
          {
            id: "test.feature2",
            description: "Test",
            module: "test",
            priority: 2,
            status: "failing",
            acceptance: ["Criterion"],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "status", "--quiet"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      // Quiet format: "50% complete | 1/2 passing"
      expect(result.stdout).toMatch(/\d+% complete \| \d+\/\d+ passing/);
      expect(result.stdout).toContain("Next:");
    });
  });

  describe("step command", () => {
    it("should show error when no feature list exists", () => {
      const result = spawnSync("node", [CLI_PATH, "step", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("No feature list found");
    });

    it("should select next feature with --json flag", async () => {
      const featureList = {
        features: [
          {
            id: "test.feature1",
            description: "First feature",
            module: "test",
            priority: 1,
            status: "failing",
            acceptance: ["Criterion 1"],
            dependsOn: [],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "step", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      const output = JSON.parse(result.stdout);
      expect(output.feature.id).toBe("test.feature1");
      expect(output.feature.description).toBe("First feature");
      expect(output.feature.status).toBe("failing");
    });

    it("should show all features complete when all passing", async () => {
      const featureList = {
        features: [
          {
            id: "test.feature1",
            description: "Test",
            module: "test",
            priority: 1,
            status: "passing",
            acceptance: ["Criterion"],
            dependsOn: [],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "step", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("All features are passing");
    });

    it("should output complete message in JSON format", async () => {
      const featureList = {
        features: [
          {
            id: "test.feature1",
            description: "Test",
            module: "test",
            priority: 1,
            status: "passing",
            acceptance: ["Criterion"],
            dependsOn: [],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "step", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      const output = JSON.parse(result.stdout);
      expect(output.complete).toBe(true);
      expect(output.message).toContain("passing");
    });
  });

  describe("complete command", () => {
    it("should update feature status to passing", async () => {
      const featureList = {
        features: [
          {
            id: "test.feature1",
            description: "Test",
            module: "test",
            priority: 1,
            status: "failing",
            acceptance: ["Criterion"],
            dependsOn: [],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Make an initial commit so we can commit the feature completion
      await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
      execSync("git add .", { cwd: tempDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tempDir, stdio: "pipe" });

      // Use --skip-verify --no-commit to avoid verification and git commit (for fast testing)
      const result = spawnSync("node", [CLI_PATH, "complete", "test.feature1", "--skip-verify", "--no-commit"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toContain("Skipping verification");
      expect(result.stdout).toContain("Marked 'test.feature1' as passing");

      // Verify the file was updated
      const updatedContent = await fs.readFile(
        path.join(tempDir, "ai/feature_list.json"),
        "utf-8"
      );
      const updated = JSON.parse(updatedContent);
      expect(updated.features[0].status).toBe("passing");
    });

    it("should show error for non-existent feature", async () => {
      const featureList = {
        features: [],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "complete", "nonexistent"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("not found");
    });
  });

  describe("help command", () => {
    it("should display help information", () => {
      const result = spawnSync("node", [CLI_PATH, "--help"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("agent-foreman");
      expect(result.stdout).toContain("init");
      expect(result.stdout).toContain("status");
      expect(result.stdout).toContain("step");
      expect(result.stdout).toContain("complete");
    });
  });

  describe("version command", () => {
    it("should display version information", () => {
      const result = spawnSync("node", [CLI_PATH, "--version"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      // Should contain a version number pattern
      expect(result.stdout).toMatch(/\d+\.\d+\.\d+/);
    });
  });
});
