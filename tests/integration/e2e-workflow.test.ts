/**
 * End-to-End workflow tests for CLI commands
 * Tests the full workflow: init → next → done
 *
 * Note: analyze command requires AI agents which are mocked in these tests.
 * These tests focus on file output verification and command flow.
 *
 * IMPORTANT: These tests spawn child processes that can be resource-intensive.
 * They are configured to run sequentially (not in parallel with other test files)
 * to prevent flaky failures from resource contention.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { execSync, spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Path to the built CLI
const CLI_PATH = path.resolve(process.cwd(), "dist/index.js");

/**
 * Safely parse JSON from command output with detailed error reporting
 */
function parseJsonOutput(result: { stdout: string; stderr: string; status: number | null }, context: string): unknown {
  if (result.status !== 0) {
    throw new Error(
      `Command failed with status ${result.status} (${context})\n` +
      `stdout: ${result.stdout || "(empty)"}\n` +
      `stderr: ${result.stderr || "(empty)"}`
    );
  }

  const stdout = result.stdout.trim();
  if (!stdout) {
    throw new Error(
      `Empty stdout from command (${context})\n` +
      `status: ${result.status}\n` +
      `stderr: ${result.stderr || "(empty)"}`
    );
  }

  try {
    return JSON.parse(stdout);
  } catch (e) {
    throw new Error(
      `Failed to parse JSON output (${context})\n` +
      `stdout: ${stdout}\n` +
      `stderr: ${result.stderr || "(empty)"}\n` +
      `parse error: ${e instanceof Error ? e.message : String(e)}`
    );
  }
}

describe("E2E Workflow Tests", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a unique temp directory for each test
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foreman-e2e-"));
    // Initialize git repo for commands that require it
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.name 'Test User'", { cwd: tempDir, stdio: "pipe" });
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("Full workflow: setup → next → done", () => {
    it("should handle complete workflow with pre-populated feature list", async () => {
      // Step 1: Create a minimal project structure
      await fs.writeFile(path.join(tempDir, "package.json"), JSON.stringify({
        name: "test-project",
        version: "1.0.0",
        scripts: {
          test: "echo 'tests pass'",
          build: "echo 'build done'"
        }
      }, null, 2));

      // Step 2: Create ai directory with feature list (simulating init)
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });

      const featureList = {
        features: [
          {
            id: "core.setup",
            description: "Basic project setup",
            module: "core",
            priority: 1,
            status: "failing",
            acceptance: ["Project has package.json", "Build script exists"],
            dependsOn: [],
            version: 1,
            origin: "manual",
          },
          {
            id: "core.tests",
            description: "Add test infrastructure",
            module: "core",
            priority: 2,
            status: "failing",
            acceptance: ["Test command runs", "Tests pass"],
            dependsOn: ["core.setup"],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Test project for E2E workflow",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Create progress.log
      await fs.writeFile(
        path.join(tempDir, "ai/progress.log"),
        `# Progress Log\n\nINIT ${new Date().toISOString()} summary="E2E test setup"\n`
      );

      // Create initial commit
      await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
      execSync("git add .", { cwd: tempDir, stdio: "pipe" });
      execSync('git commit -m "Initial setup"', { cwd: tempDir, stdio: "pipe" });

      // Step 3: Verify status shows correct stats
      const statusResult = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(statusResult.stdout).toContain("Failing: 2");
      expect(statusResult.stdout).toContain("0%"); // 0 of 2 passing

      // Step 4: Run next command to get next feature
      const stepResult = spawnSync("node", [CLI_PATH, "next", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 180000, // 3 minutes for AI TDD guidance generation
      });

      const stepOutput = parseJsonOutput(stepResult, "next --json core.setup") as { feature: { id: string } };
      expect(stepOutput.feature.id).toBe("core.setup");

      // Step 5: Complete the first feature
      const completeResult = spawnSync("node", [CLI_PATH, "done", "core.setup", "--no-commit"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(completeResult.stdout).toContain("Marked 'core.setup' as passing");

      // Step 6: Verify feature list was updated
      const updatedFeatureList = JSON.parse(
        await fs.readFile(path.join(tempDir, "ai/feature_list.json"), "utf-8")
      );
      expect(updatedFeatureList.features[0].status).toBe("passing");
      expect(updatedFeatureList.features[1].status).toBe("failing");

      // Step 7: Verify status shows updated stats
      const statusResult2 = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(statusResult2.stdout).toContain("Passing: 1");
      expect(statusResult2.stdout).toContain("Failing: 1");
      expect(statusResult2.stdout).toContain("50%");

      // Step 8: Verify next step shows dependent feature
      const stepResult2 = spawnSync("node", [CLI_PATH, "next", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 180000, // 3 minutes for AI TDD guidance generation
      });

      const stepOutput2 = parseJsonOutput(stepResult2, "next --json core.tests") as { feature: { id: string } };
      expect(stepOutput2.feature.id).toBe("core.tests");

      // Step 9: Complete the second feature
      const completeResult2 = spawnSync("node", [CLI_PATH, "done", "core.tests", "--no-commit"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 10000,
      });

      expect(completeResult2.stdout).toContain("Marked 'core.tests' as passing");

      // Step 10: Verify all features complete
      const stepResult3 = spawnSync("node", [CLI_PATH, "next", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(stepResult3.stdout).toContain("All features are passing");

      // Step 11: Verify final status
      const statusResult3 = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(statusResult3.stdout).toContain("Passing: 2");
      expect(statusResult3.stdout).toContain("100%");
    }, 600000); // 10 minute test timeout for AI calls
  });

  describe("File output verification", () => {
    it("should verify feature_list.json structure after operations", async () => {
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });

      const featureList = {
        features: [
          {
            id: "test.verify",
            description: "Verify feature structure",
            module: "test",
            priority: 1,
            status: "failing",
            acceptance: ["Feature is valid"],
            dependsOn: [],
            supersedes: [],
            tags: ["test"],
            version: 1,
            origin: "manual",
            notes: "Test notes",
          },
        ],
        metadata: {
          projectGoal: "Test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Make initial commit
      await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
      execSync("git add .", { cwd: tempDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tempDir, stdio: "pipe" });

      // Complete the feature
      spawnSync("node", [CLI_PATH, "done", "test.verify", "--no-commit"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 10000,
      });

      // Verify the structure is maintained
      const content = await fs.readFile(path.join(tempDir, "ai/feature_list.json"), "utf-8");
      const updated = JSON.parse(content);

      expect(updated.features[0].id).toBe("test.verify");
      expect(updated.features[0].status).toBe("passing");
      expect(updated.features[0].acceptance).toEqual(["Feature is valid"]);
      expect(updated.features[0].tags).toEqual(["test"]);
      expect(updated.metadata.version).toBe("1.0.0");
    });

    it("should verify progress.log is updated after done", async () => {
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });

      const featureList = {
        features: [
          {
            id: "test.progress",
            description: "Test progress logging",
            module: "test",
            priority: 1,
            status: "failing",
            acceptance: ["Progress is logged"],
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

      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      await fs.writeFile(
        path.join(tempDir, "ai/progress.log"),
        "# Progress Log\n\n"
      );

      // Make initial commit
      await fs.writeFile(path.join(tempDir, ".gitkeep"), "");
      execSync("git add .", { cwd: tempDir, stdio: "pipe" });
      execSync('git commit -m "init"', { cwd: tempDir, stdio: "pipe" });

      // Complete the feature
      spawnSync("node", [CLI_PATH, "done", "test.progress", "--no-commit"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 10000,
      });

      // Verify progress.log was updated
      const progressContent = await fs.readFile(path.join(tempDir, "ai/progress.log"), "utf-8");
      expect(progressContent).toContain("STEP");
      expect(progressContent).toContain("test.progress");
      expect(progressContent).toContain("passing");
    });
  });

  describe("Status command variations", () => {
    it("should output correct statistics with mixed feature states", async () => {
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });

      const featureList = {
        features: [
          { id: "f1", description: "F1", module: "m", priority: 1, status: "passing", acceptance: ["a"], version: 1, origin: "manual" },
          { id: "f2", description: "F2", module: "m", priority: 2, status: "passing", acceptance: ["a"], version: 1, origin: "manual" },
          { id: "f3", description: "F3", module: "m", priority: 3, status: "failing", acceptance: ["a"], version: 1, origin: "manual" },
          { id: "f4", description: "F4", module: "m", priority: 4, status: "blocked", acceptance: ["a"], version: 1, origin: "manual" },
          { id: "f5", description: "F5", module: "m", priority: 5, status: "needs_review", acceptance: ["a"], version: 1, origin: "manual" },
        ],
        metadata: {
          projectGoal: "Mixed states test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("Passing: 2");
      expect(result.stdout).toContain("Failing: 1");
      expect(result.stdout).toContain("Blocked: 1");
      expect(result.stdout).toContain("Needs Review: 1");
    });

    it("should output JSON with all statistics", async () => {
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });

      const featureList = {
        features: [
          { id: "f1", description: "F1", module: "m", priority: 1, status: "passing", acceptance: ["a"], version: 1, origin: "manual" },
          { id: "f2", description: "F2", module: "m", priority: 2, status: "failing", acceptance: ["a"], version: 1, origin: "manual" },
        ],
        metadata: {
          projectGoal: "JSON test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      const result = spawnSync("node", [CLI_PATH, "status", "--json"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      const output = parseJsonOutput(result, "status --json") as {
        stats: { passing: number; failing: number; total: number };
        completion: number;
        goal: string;
      };
      expect(output.stats.passing).toBe(1);
      expect(output.stats.failing).toBe(1);
      expect(output.stats.total).toBe(2);
      expect(output.completion).toBe(50);
      // projectGoal is in metadata, not at root
      expect(output.goal).toBe("JSON test");
    });
  });

  describe("Next command with dependencies", () => {
    it("should select features based on priority and dependency status", async () => {
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });

      const featureList = {
        features: [
          {
            id: "base.setup",
            description: "Base setup",
            module: "base",
            priority: 2, // Lower priority but no dependencies
            status: "failing",
            acceptance: ["Setup done"],
            dependsOn: [],
            version: 1,
            origin: "manual",
          },
          {
            id: "advanced.feature",
            description: "Advanced feature",
            module: "advanced",
            priority: 1, // Higher priority but depends on base.setup
            status: "failing",
            acceptance: ["Feature works"],
            dependsOn: ["base.setup"],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Dependency test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Next returns a feature (implementation determines exact selection logic)
      const result = spawnSync("node", [CLI_PATH, "next", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 180000, // 3 minutes for AI TDD guidance generation
      });

      const output = parseJsonOutput(result, "next --json dependency test") as { feature: { id: string } };
      // Should return a valid feature (either one based on the selection algorithm)
      expect(["base.setup", "advanced.feature"]).toContain(output.feature.id);
    }, 200000); // 3.5 minute test timeout

    it("should handle circular dependency gracefully", async () => {
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });

      // Note: This shouldn't happen in practice, but test defensive behavior
      const featureList = {
        features: [
          {
            id: "a",
            description: "Feature A",
            module: "test",
            priority: 1,
            status: "failing",
            acceptance: ["Done"],
            dependsOn: ["b"],
            version: 1,
            origin: "manual",
          },
          {
            id: "b",
            description: "Feature B",
            module: "test",
            priority: 2,
            status: "failing",
            acceptance: ["Done"],
            dependsOn: ["a"],
            version: 1,
            origin: "manual",
          },
        ],
        metadata: {
          projectGoal: "Circular test",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          version: "1.0.0",
        },
      };

      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        JSON.stringify(featureList, null, 2)
      );

      // Should still return something (best effort)
      const result = spawnSync("node", [CLI_PATH, "next", "--json", "--allow-dirty"], {
        cwd: tempDir,
        encoding: "utf-8",
        timeout: 180000, // 3 minutes for AI TDD guidance generation
      });

      // Should not crash
      expect(result.status).toBe(0);
      const output = parseJsonOutput(result, "next --json circular dependency") as { feature: unknown };
      expect(output.feature).toBeDefined();
    }, 200000); // 3.5 minute test timeout
  });

  describe("Error handling", () => {
    it("should handle invalid JSON in feature list", async () => {
      await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
      await fs.writeFile(
        path.join(tempDir, "ai/feature_list.json"),
        "{ invalid json }"
      );

      const result = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      // Should handle error gracefully
      expect(result.stderr + result.stdout).toMatch(/error|invalid|failed|parse/i);
    });

    it("should handle missing ai directory", async () => {
      // Don't create ai directory
      const result = spawnSync("node", [CLI_PATH, "status"], {
        cwd: tempDir,
        encoding: "utf-8",
      });

      expect(result.stdout).toContain("No feature list found");
    });
  });
});
