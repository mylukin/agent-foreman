/**
 * Tests for src/run.ts - implementation of `run` command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runStepsDirectory } from "../src/run.js";

// Mock agents module so we don't actually call external AI tools
vi.mock("../src/agents.js", () => ({
  callAnyAvailableAgent: vi.fn(),
}));

import { callAnyAvailableAgent } from "../src/agents.js";

describe("run.ts", () => {
  const tmpDirs: string[] = [];

  async function createTempDir(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "run-command-test-"));
    tmpDirs.push(dir);
    return dir;
  }

  async function writeStep(
    dir: string,
    index: number,
    slug: string,
    overrides: Partial<{
      id: string;
      description: string;
      status: string;
      verification: Array<{ type: string; description: string }>;
    }> = {},
  ): Promise<string> {
    const stepIndex = String(index).padStart(3, "0");
    const fileName = `${stepIndex}-${slug}.json`;
    const filePath = path.join(dir, fileName);

    const step = {
      id: overrides.id ?? `step-${stepIndex}`,
      description: overrides.description ?? `Step ${stepIndex} description`,
      status: (overrides.status as any) ?? "🔴 待完成",
      verification:
        overrides.verification ??
        [
          {
            type: "unit",
            description: `Unit test for step ${stepIndex}`,
          },
        ],
    };

    await fs.writeFile(filePath, JSON.stringify(step, null, 2), "utf-8");
    return fileName;
  }

  beforeEach(() => {
    vi.mocked(callAnyAvailableAgent).mockReset();
  });

  afterEach(async () => {
    for (const dir of tmpDirs) {
      try {
        const entries = await fs.readdir(dir);
        for (const entry of entries) {
          await fs.rm(path.join(dir, entry), { recursive: true, force: true });
        }
        await fs.rmdir(dir);
      } catch {
        // ignore cleanup errors
      }
    }
    tmpDirs.length = 0;
  });

  it("should report error when steps directory does not exist", async () => {
    await runStepsDirectory("non-existent-dir");
    // The function should set a non-zero exitCode but not throw
    expect(process.exitCode).toBe(1);
  });

  it("should execute steps in sorted order and mark them completed on success", async () => {
    const dir = await createTempDir();
    await writeStep(dir, 2, "second");
    await writeStep(dir, 1, "first");

    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: true,
      output: "ok",
      agentUsed: "gemini",
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    const stepFiles = await fs.readdir(dir);
    expect(stepFiles).toContain("001-first.json");
    expect(stepFiles).toContain("002-second.json");

    const firstContent = JSON.parse(
      await fs.readFile(path.join(dir, "001-first.json"), "utf-8"),
    );
    const secondContent = JSON.parse(
      await fs.readFile(path.join(dir, "002-second.json"), "utf-8"),
    );

    expect(firstContent.status).toBe("🟢 已完成");
    expect(secondContent.status).toBe("🟢 已完成");

    // Should have generated a progress markdown file
    const progressFiles = stepFiles.filter((f) =>
      f.startsWith("run-progress-") && f.endsWith(".md"),
    );
    expect(progressFiles.length).toBe(1);
  });

  it("should stop execution when an AI step fails and leave later steps untouched", async () => {
    const dir = await createTempDir();
    await writeStep(dir, 1, "first");
    await writeStep(dir, 2, "second");

    vi.mocked(callAnyAvailableAgent)
      .mockResolvedValueOnce({
        success: false,
        output: "",
        error: "AI failure",
      })
      .mockResolvedValue({
        success: true,
        output: "ok",
        agentUsed: "gemini",
      });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    const firstContent = JSON.parse(
      await fs.readFile(path.join(dir, "001-first.json"), "utf-8"),
    );
    const secondContent = JSON.parse(
      await fs.readFile(path.join(dir, "002-second.json"), "utf-8"),
    );

    expect(firstContent.status).toBe("🔴 待完成");
    expect(secondContent.status).toBe("🔴 待完成");
  });

  it("should fail fast when step JSON structure is invalid", async () => {
    const dir = await createTempDir();
    const filePath = path.join(dir, "001-invalid.json");
    await fs.writeFile(filePath, '{"not":"a step"}', "utf-8");

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    // Should set a non-zero exit code
    expect(process.exitCode).toBe(1);

    // Should generate a progress markdown file describing the failure
    const files = await fs.readdir(dir);
    const progressFiles = files.filter((f) =>
      f.startsWith("run-progress-") && f.endsWith(".md"),
    );
    expect(progressFiles.length).toBe(1);
  });
});

