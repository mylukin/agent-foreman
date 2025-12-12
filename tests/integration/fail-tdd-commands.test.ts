/**
 * Integration tests for fail and tdd CLI commands
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync, execSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Path to the built CLI
const CLI_PATH = path.resolve(process.cwd(), "dist/index.js");

describe("fail command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foreman-fail-test-"));
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.name 'Test User'", { cwd: tempDir, stdio: "pipe" });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should show error when no feature list exists", () => {
    const result = spawnSync("node", [CLI_PATH, "fail", "test.feature"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("No feature list found");
    expect(result.status).toBe(1);
  });

  it("should show error when feature not found", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature",
          module: "test",
          priority: 1,
          status: "failing",
          acceptance: ["Criterion 1"],
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "fail", "nonexistent.feature"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("not found");
    expect(result.status).toBe(1);
  });

  it("should mark feature as failed", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature",
          module: "test",
          priority: 1,
          status: "failing",
          acceptance: ["Criterion 1"],
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "fail", "test.feature1", "--no-loop"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("Marked 'test.feature1' as failed");
    expect(result.status).toBe(0);

    // Verify feature list was updated
    const updatedContent = await fs.readFile(
      path.join(tempDir, "ai", "feature_list.json"),
      "utf-8"
    );
    const updated = JSON.parse(updatedContent);
    expect(updated.features[0].status).toBe("failed");
    expect(updated.features[0].notes).toContain("Marked as failed");
  });

  it("should mark feature as failed with reason", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature",
          module: "test",
          priority: 1,
          status: "failing",
          acceptance: ["Criterion 1"],
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync(
      "node",
      [CLI_PATH, "fail", "test.feature1", "--reason", "Tests failed", "--no-loop"],
      {
        cwd: tempDir,
        encoding: "utf-8",
      }
    );

    expect(result.stdout).toContain("Marked 'test.feature1' as failed");
    expect(result.stdout).toContain("Reason: Tests failed");
    expect(result.status).toBe(0);

    // Verify notes contain reason
    const updatedContent = await fs.readFile(
      path.join(tempDir, "ai", "feature_list.json"),
      "utf-8"
    );
    const updated = JSON.parse(updatedContent);
    expect(updated.features[0].notes).toContain("Failed: Tests failed");
  });

  it("should show warning when feature already failed", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature",
          module: "test",
          priority: 1,
          status: "failed",
          acceptance: ["Criterion 1"],
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "fail", "test.feature1"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("already marked as failed");
    expect(result.status).toBe(0);
  });

  it("should show next feature after marking as failed", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature 1",
          module: "test",
          priority: 1,
          status: "failing",
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "fail", "test.feature1", "--no-loop"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("Next up: test.feature2");
    expect(result.status).toBe(0);
  });

  it("should show loop continuation guidance in loop mode", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature 1",
          module: "test",
          priority: 1,
          status: "failing",
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "fail", "test.feature1"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("CONTINUE TO NEXT FEATURE");
    expect(result.stdout).toContain("NEXT STEPS");
    expect(result.stdout).toContain("agent-foreman next");
    expect(result.status).toBe(0);
  });

  it("should show completion summary when all features processed", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature 1",
          module: "test",
          priority: 1,
          status: "failing",
          acceptance: ["Criterion 1"],
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "fail", "test.feature1"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("ALL FEATURES PROCESSED");
    expect(result.stdout).toContain("Summary");
    expect(result.status).toBe(0);
  });

  it("should update progress log", async () => {
    const featureList = {
      features: [
        {
          id: "test.feature1",
          description: "Test feature",
          module: "test",
          priority: 1,
          status: "failing",
          acceptance: ["Criterion 1"],
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
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );
    await fs.writeFile(path.join(tempDir, "ai", "progress.log"), "");

    const result = spawnSync("node", [CLI_PATH, "fail", "test.feature1", "--no-loop"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);

    const progressLog = await fs.readFile(
      path.join(tempDir, "ai", "progress.log"),
      "utf-8"
    );
    expect(progressLog).toContain("VERIFY");
    expect(progressLog).toContain("test.feature1");
    expect(progressLog).toContain("fail");
  });
});

describe("tdd command", () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "foreman-tdd-test-"));
    execSync("git init", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.email 'test@test.com'", { cwd: tempDir, stdio: "pipe" });
    execSync("git config user.name 'Test User'", { cwd: tempDir, stdio: "pipe" });
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should show error when no feature list exists", () => {
    const result = spawnSync("node", [CLI_PATH, "tdd"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("No feature list found");
    expect(result.status).toBe(1);
  });

  it("should show current TDD mode when no argument provided", async () => {
    const featureList = {
      features: [],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
        tddMode: "recommended",
      },
    };

    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "tdd"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("TDD Configuration");
    expect(result.stdout).toContain("Current mode");
    expect(result.stdout).toContain("Available modes");
    expect(result.status).toBe(0);
  });

  it("should show error for invalid TDD mode", async () => {
    const featureList = {
      features: [],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
      },
    };

    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "tdd", "invalid"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    // Yargs validates choices and outputs error to stderr
    expect(result.stderr).toContain("Invalid values");
    expect(result.stderr).toContain("invalid");
    expect(result.stderr).toContain("strict, recommended, disabled");
    expect(result.status).toBe(1);
  });

  it("should change TDD mode to strict", async () => {
    const featureList = {
      features: [],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
        tddMode: "recommended",
      },
    };

    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "tdd", "strict"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("TDD mode changed");
    expect(result.stdout).toContain("STRICT MODE ACTIVE");
    expect(result.stdout).toContain("Tests are REQUIRED");
    expect(result.status).toBe(0);

    // Verify feature list was updated
    const updatedContent = await fs.readFile(
      path.join(tempDir, "ai", "feature_list.json"),
      "utf-8"
    );
    const updated = JSON.parse(updatedContent);
    expect(updated.metadata.tddMode).toBe("strict");
  });

  it("should change TDD mode to disabled", async () => {
    const featureList = {
      features: [],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
        tddMode: "recommended",
      },
    };

    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "tdd", "disabled"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("TDD mode changed");
    expect(result.stdout).toContain("TDD DISABLED");
    expect(result.stdout).toContain("No TDD guidance shown");
    expect(result.status).toBe(0);

    // Verify feature list was updated
    const updatedContent = await fs.readFile(
      path.join(tempDir, "ai", "feature_list.json"),
      "utf-8"
    );
    const updated = JSON.parse(updatedContent);
    expect(updated.metadata.tddMode).toBe("disabled");
  });

  it("should show warning when mode is already set", async () => {
    const featureList = {
      features: [],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
        tddMode: "strict",
      },
    };

    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "tdd", "strict"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("already 'strict'");
    expect(result.status).toBe(0);
  });

  it("should update progress log when mode changes", async () => {
    const featureList = {
      features: [],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
        tddMode: "recommended",
      },
    };

    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );
    await fs.writeFile(path.join(tempDir, "ai", "progress.log"), "");

    const result = spawnSync("node", [CLI_PATH, "tdd", "strict"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.status).toBe(0);

    const progressLog = await fs.readFile(
      path.join(tempDir, "ai", "progress.log"),
      "utf-8"
    );
    expect(progressLog).toContain("CHANGE");
    expect(progressLog).toContain("tdd-mode");
    expect(progressLog).toContain("recommended");
    expect(progressLog).toContain("strict");
  });

  it("should default to recommended when no tddMode in metadata", async () => {
    const featureList = {
      features: [],
      metadata: {
        projectGoal: "Test project",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: "1.0.0",
        // No tddMode specified
      },
    };

    await fs.mkdir(path.join(tempDir, "ai"), { recursive: true });
    await fs.writeFile(
      path.join(tempDir, "ai", "feature_list.json"),
      JSON.stringify(featureList, null, 2)
    );

    const result = spawnSync("node", [CLI_PATH, "tdd"], {
      cwd: tempDir,
      encoding: "utf-8",
    });

    expect(result.stdout).toContain("Current mode");
    expect(result.stdout).toContain("recommended");
    expect(result.status).toBe(0);
  });
});
