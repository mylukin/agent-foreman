/**
 * Integration-style tests for runStepsDirectory multi-attempt progress reporting.
 *
 * These tests exercise the run flow against a real filesystem (temporary steps
 * directory) while mocking AI calls, to verify that run-progress.md reflects
 * the final attempt status for a step that fails multiple times before success.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { runStepsDirectory } from "../../src/run.js";

vi.mock("../../src/agents.js", () => ({
  callAnyAvailableAgent: vi.fn(),
}));

import { callAnyAvailableAgent } from "../../src/agents.js";

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function writeStep(
  dir: string,
  index: number,
  slug: string,
  overrides: Partial<{
    id: string;
    description: string;
    status: string;
  }> = {},
): Promise<string> {
  const stepIndex = String(index).padStart(3, "0");
  const fileName = `${stepIndex}-${slug}.json`;
  const filePath = path.join(dir, fileName);

  const step = {
    id: overrides.id ?? `step-${stepIndex}`,
    description: overrides.description ?? `Step ${stepIndex} description`,
    status: (overrides.status as any) ?? "🔴 待完成",
    verification: [
      {
        type: "integration",
        description: `Integration verification for step ${stepIndex}`,
      },
    ],
  };

  await fs.writeFile(filePath, JSON.stringify(step, null, 2), "utf-8");
  return fileName;
}

async function readRunProgressContent(dir: string): Promise<string | undefined> {
  const files = await fs.readdir(dir);
  const progressFiles = files.filter(
    (f) => f.startsWith("run-progress") && f.endsWith(".md"),
  );
  if (progressFiles.length === 0) {
    return undefined;
  }
  const filePath = path.join(dir, progressFiles[0]);
  return fs.readFile(filePath, "utf-8");
}

function getRowCells(
  content: string,
  fileName: string,
): string[] | undefined {
  const lines = content.split("\n");
  const row = lines.find((line) => line.includes(`| ${fileName} |`));
  if (!row) return undefined;
  return row.split("|").map((c) => c.trim());
}

describe("runStepsDirectory multi-attempt progress (integration)", () => {
  const tmpDirs: string[] = [];

  beforeEach(() => {
    vi.mocked(callAnyAvailableAgent).mockReset();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).exitCode = undefined;
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

  it("[integration] run-progress aggregates multi-attempt failures into final success", async () => {
    const dir = await createTempDir("run-multi-attempt-progress-");
    tmpDirs.push(dir);

    const firstFile = await writeStep(dir, 1, "first");
    const secondFile = await writeStep(dir, 2, "second");

    let callCount = 0;
    vi.mocked(callAnyAvailableAgent).mockImplementation(async () => {
      callCount += 1;

      // Attempts 1-3: implementation for step 1 fails
      if (callCount <= 3) {
        return {
          success: false,
          output: "",
          error: `AI failure attempt ${callCount}`,
        };
      }

      // Attempt 4: implementation for step 1 succeeds
      if (callCount === 4) {
        return {
          success: true,
          output: "ok",
          agentUsed: "gemini",
        };
      }

      // Subsequent calls (validation for step 1 and both calls for step 2) succeed
      return {
        success: true,
        output: "validation ok",
        agentUsed: "gemini",
      };
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    // We expect at least: 3 failing implementations + 1 successful implementation
    // + 1 validation for step 1 + 2 calls for step 2.
    expect(callCount).toBeGreaterThanOrEqual(7);
    expect(process.exitCode).toBeUndefined();

    const reportContent = await readRunProgressContent(dir);
    expect(reportContent).toBeTruthy();
    if (!reportContent) return;

    // Overall summary should treat both steps as successful
    expect(reportContent).toContain("- 总步骤数: 2");
    expect(reportContent).toContain("- 成功步骤数: 2");
    expect(reportContent).toContain("- 失败步骤数: 0");

    const firstRowCells = getRowCells(reportContent, firstFile);
    const secondRowCells = getRowCells(reportContent, secondFile);

    expect(firstRowCells).toBeDefined();
    expect(secondRowCells).toBeDefined();

    if (firstRowCells) {
      // cells: ["", "顺序", "文件名", "步骤 ID", "执行前状态", "执行后状态", "结果", "摘要", "错误信息", ""]
      expect(firstRowCells[5]).toBe("🟢 已完成");
      expect(firstRowCells[6]).toBe("成功");
      // Error summary for the multi-attempt step should be empty in the final report
      expect(firstRowCells[8]).toBe("");
    }

    if (secondRowCells) {
      expect(secondRowCells[5]).toBe("🟢 已完成");
      expect(secondRowCells[6]).toBe("成功");
      expect(secondRowCells[8]).toBe("");
    }
  });
}
);

