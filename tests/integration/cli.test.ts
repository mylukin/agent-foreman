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

/**
 * Extract JSON from output that may contain non-JSON prefixes (like upgrade notifications)
 */
function extractJSON(output: string): unknown {
  // Try to find the start of JSON object or array
  const jsonStart = output.indexOf("{");
  const arrayStart = output.indexOf("[");

  let startIdx = -1;
  if (jsonStart >= 0 && arrayStart >= 0) {
    startIdx = Math.min(jsonStart, arrayStart);
  } else if (jsonStart >= 0) {
    startIdx = jsonStart;
  } else if (arrayStart >= 0) {
    startIdx = arrayStart;
  }

  if (startIdx === -1) {
    throw new Error(`No JSON found in output: ${output}`);
  }

  return JSON.parse(output.slice(startIdx));
}

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

      const output = extractJSON(result.stdout) as { error: string };
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

      const output = extractJSON(result.stdout) as { stats: { passing: number; total: number }; completion: number };
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

  describe("next command", () => {
    it("should show error when no feature list exists", () => {
      const result = spawnSync("node", [CLI_PATH, "next", "--allow-dirty"], {
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

      const result = spawnSync("node", [CLI_PATH, "next", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 180000, // 3 minutes for AI TDD guidance generation
      });

      const output = extractJSON(result.stdout) as { feature: { id: string; description: string; status: string } };
      expect(output.feature.id).toBe("test.feature1");
      expect(output.feature.description).toBe("First feature");
      expect(output.feature.status).toBe("failing");
    }, 200000); // 3.5 minute test timeout

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

      const result = spawnSync("node", [CLI_PATH, "next", "--allow-dirty"], {
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

      const result = spawnSync("node", [CLI_PATH, "next", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      const output = extractJSON(result.stdout) as { complete: boolean; message: string };
      expect(output.complete).toBe(true);
      expect(output.message).toContain("passing");
    });
  });

  describe("done command", () => {
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
      const result = spawnSync("node", [CLI_PATH, "done", "test.feature1", "--skip-verify", "--no-commit"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(result.stdout).toContain("Skipping verification");
      expect(result.stdout).toContain("Marked 'test.feature1' as passing");

      // Verify the feature was updated in the new modular storage format
      // After auto-migration, features are stored in ai/features/{module}/{id}.md
      const featureFile = path.join(tempDir, "ai/features/test/feature1.md");
      const featureContent = await fs.readFile(featureFile, "utf-8");
      expect(featureContent).toContain("status: passing");
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

      const result = spawnSync("node", [CLI_PATH, "done", "nonexistent"], {
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
      expect(result.stdout).toContain("next");
      expect(result.stdout).toContain("done");
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

  describe("modular storage format (ai/features/)", () => {
    /**
     * Helper to create modular format structure
     */
    async function createModularFormat() {
      const featuresDir = path.join(tempDir, "ai/features");
      await fs.mkdir(path.join(featuresDir, "test"), { recursive: true });

      // Create index.json
      const index = {
        version: "2.0.0",
        updatedAt: new Date().toISOString(),
        metadata: {
          projectGoal: "Test project",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
        features: {
          "test.feature1": {
            status: "failing",
            priority: 1,
            module: "test",
            description: "Test feature 1",
          },
          "test.feature2": {
            status: "passing",
            priority: 2,
            module: "test",
            description: "Test feature 2",
          },
        },
      };
      await fs.writeFile(
        path.join(featuresDir, "index.json"),
        JSON.stringify(index, null, 2)
      );

      // Create feature markdown files
      const feature1Md = `---
id: test.feature1
module: test
priority: 1
status: failing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---
# Test feature 1

## Acceptance Criteria

1. First criterion

## Notes

`;
      await fs.writeFile(path.join(featuresDir, "test/feature1.md"), feature1Md);

      const feature2Md = `---
id: test.feature2
module: test
priority: 2
status: passing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---
# Test feature 2

## Acceptance Criteria

1. Second criterion

## Notes

`;
      await fs.writeFile(path.join(featuresDir, "test/feature2.md"), feature2Md);
    }

    describe("status command with modular format", () => {
      it("should show statistics when ai/features/index.json exists", async () => {
        await createModularFormat();

        const result = spawnSync("node", [CLI_PATH, "status"], {
          cwd: tempDir,
          encoding: "utf-8",
        });

        expect(result.stdout).toContain("Passing: 1");
        expect(result.stdout).toContain("Failing: 1");
        expect(result.stdout).toContain("50%");
      });

      it("should output JSON with --json flag using modular format", async () => {
        await createModularFormat();

        const result = spawnSync("node", [CLI_PATH, "status", "--json"], {
          cwd: tempDir,
          encoding: "utf-8",
        });

        const output = extractJSON(result.stdout) as { stats: { passing: number; failing: number }; completion: number };
        expect(output.stats.passing).toBe(1);
        expect(output.stats.failing).toBe(1);
        expect(output.completion).toBe(50);
      });
    });

    describe("next command with modular format", () => {
      it("should select next feature from modular format", async () => {
        await createModularFormat();

        const result = spawnSync("node", [CLI_PATH, "next", "--json", "--allow-dirty", "--quiet"], {
          cwd: tempDir,
          encoding: "utf-8",
          timeout: 45000,
        });

        // Check if command timed out
        if (result.signal === "SIGTERM" || !result.stdout) {
          console.error("Command timed out or produced no output:", result.stderr);
        }

        const output = extractJSON(result.stdout) as { feature: { id: string; status: string } };
        expect(output.feature.id).toBe("test.feature1");
        expect(output.feature.status).toBe("failing");
      }, 90000);

      it("should show all complete when all passing in modular format", async () => {
        const featuresDir = path.join(tempDir, "ai/features");
        await fs.mkdir(path.join(featuresDir, "test"), { recursive: true });

        const index = {
          version: "2.0.0",
          updatedAt: new Date().toISOString(),
          metadata: {
            projectGoal: "Test",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            version: "1.0.0",
          },
          features: {
            "test.feature1": {
              status: "passing",
              priority: 1,
              module: "test",
              description: "Test",
            },
          },
        };
        await fs.writeFile(
          path.join(featuresDir, "index.json"),
          JSON.stringify(index, null, 2)
        );

        const featureMd = `---
id: test.feature1
module: test
priority: 1
status: passing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---
# Test

## Acceptance Criteria

1. Criterion
`;
        await fs.writeFile(path.join(featuresDir, "test/feature1.md"), featureMd);

        const result = spawnSync("node", [CLI_PATH, "next", "--allow-dirty"], {
          cwd: tempDir,
          encoding: "utf-8",
          timeout: 30000,
        });

        expect(result.stdout).toContain("All features are passing");
      }, 60000);
    });

    describe("done command with modular format", () => {
      it("should update feature status in modular format", async () => {
        await createModularFormat();

        // Make initial commit
        await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
        execSync("git add .", { cwd: tempDir, stdio: "pipe" });
        execSync('git commit -m "init"', { cwd: tempDir, stdio: "pipe" });

        const result = spawnSync("node", [CLI_PATH, "done", "test.feature1", "--skip-verify", "--no-commit"], {
          cwd: tempDir,
          encoding: "utf-8",
          timeout: 30000,
        });

        expect(result.stdout).toContain("Marked 'test.feature1' as passing");

        // Verify index.json was updated
        const indexContent = await fs.readFile(
          path.join(tempDir, "ai/features/index.json"),
          "utf-8"
        );
        const index = JSON.parse(indexContent);
        expect(index.features["test.feature1"].status).toBe("passing");

        // Verify feature markdown was updated
        const featureContent = await fs.readFile(
          path.join(tempDir, "ai/features/test/feature1.md"),
          "utf-8"
        );
        expect(featureContent).toContain("status: passing");
      });
    });

    describe("init command creates format", () => {
      it("should create feature list on init (legacy or modular)", async () => {
        // Create package.json for project detection
        await fs.writeFile(
          path.join(tempDir, "package.json"),
          JSON.stringify({ name: "test-project", version: "1.0.0" })
        );

        // Make initial commit
        await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
        execSync("git add .", { cwd: tempDir, stdio: "pipe" });
        execSync('git commit -m "init"', { cwd: tempDir, stdio: "pipe" });

        // Run init command with skip mode for speed
        spawnSync("node", [CLI_PATH, "init", "Test project goal", "--mode", "new"], {
          cwd: tempDir,
          encoding: "utf-8",
          timeout: 60000,
        });

        // Check that some format was created
        const indexExists = await fs.access(path.join(tempDir, "ai/features/index.json"))
          .then(() => true)
          .catch(() => false);
        const legacyExists = await fs.access(path.join(tempDir, "ai/feature_list.json"))
          .then(() => true)
          .catch(() => false);

        // Either format should be created
        expect(indexExists || legacyExists).toBe(true);

        // If modular format exists, verify structure
        if (indexExists) {
          const indexContent = await fs.readFile(
            path.join(tempDir, "ai/features/index.json"),
            "utf-8"
          );
          const index = JSON.parse(indexContent);
          expect(index.version).toBe("2.0.0");
          expect(index.metadata).toBeDefined();
        }
      }, 90000); // 90 second timeout for slow init
    });
  });
});
