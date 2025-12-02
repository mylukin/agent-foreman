/**
 * Tests for src/run.ts - implementation of `run` command
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  runStepsDirectory,
  extractUnitTestFromOutput,
  loadStepEntries,
} from "../src/run.js";

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

  function getResultFromProgress(
    content: string,
    fileName: string,
  ): string | undefined {
    const lines = content.split("\n");
    const row = lines.find((line) => line.includes(`| ${fileName} |`));
    if (!row) return undefined;
    const cells = row.split("|").map((c) => c.trim());
    // cells: ["", "顺序", "文件名", "步骤 ID", "执行前状态", "执行后状态", "结果", "摘要", "错误信息", ""]
    return cells[6];
  }

  function getStatusAndErrorFromProgress(
    content: string,
    fileName: string,
  ): { afterStatus?: string; result?: string; error?: string } {
    const lines = content.split("\n");
    const row = lines.find((line) => line.includes(`| ${fileName} |`));
    if (!row) return {};
    const cells = row.split("|").map((c) => c.trim());
    return {
      afterStatus: cells[5],
      result: cells[6],
      error: cells[8],
    };
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
      unit_test: {
        command: string;
        files?: string[];
        notes?: string;
      };
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
      unit_test: overrides.unit_test,
    };

    await fs.writeFile(filePath, JSON.stringify(step, null, 2), "utf-8");
    return fileName;
  }

  beforeEach(() => {
    vi.mocked(callAnyAvailableAgent).mockReset();
    // Reset exitCode before each test to avoid cross-test leakage
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

  describe("extractUnitTestFromOutput", () => {
    it("returns undefined when no JSON object is present", () => {
      const output = "Some plain text output without braces or JSON.";
      const unitTest = extractUnitTestFromOutput(output);
      expect(unitTest).toBeUndefined();
    });

    it("returns undefined when JSON is invalid", () => {
      const output = '{"unit_test": {"command": "npm test"'; // missing closing braces
      const unitTest = extractUnitTestFromOutput(output);
      expect(unitTest).toBeUndefined();
    });

    it("returns undefined when unit_test field is missing or not an object", () => {
      const noUnitTest = extractUnitTestFromOutput('{"foo": 1}');
      const nonObjectUnitTest = extractUnitTestFromOutput(
        '{"unit_test": "not-an-object"}',
      );
      expect(noUnitTest).toBeUndefined();
      expect(nonObjectUnitTest).toBeUndefined();
    });

    it("returns undefined when command is missing or not a non-empty string", () => {
      const missingCommand = extractUnitTestFromOutput(
        '{"unit_test": {}}',
      );
      const emptyCommand = extractUnitTestFromOutput(
        '{"unit_test": {"command": "   "}}',
      );
      const nonStringCommand = extractUnitTestFromOutput(
        '{"unit_test": {"command": 123}}',
      );

      expect(missingCommand).toBeUndefined();
      expect(emptyCommand).toBeUndefined();
      expect(nonStringCommand).toBeUndefined();
    });

    it("parses valid unit_test object and trims fields", () => {
      const output =
        '{"unit_test": {"command": "  npm test -- tests/run-command.test.ts  ", "files": [" tests/run-command.test.ts ", "", 123], "notes": "  some notes  "}}';

      const unitTest = extractUnitTestFromOutput(output);
      expect(unitTest).toBeDefined();
      if (!unitTest) return;
      expect(unitTest.command).toBe(
        "npm test -- tests/run-command.test.ts",
      );
      // files are filtered to valid non-empty strings but not trimmed
      expect(unitTest.files).toEqual([" tests/run-command.test.ts "]);
      expect(unitTest.notes).toBe("some notes");
    });

    it("parses unit_test from JSON inside a code block", () => {
      const output = [
        "Implementation details...",
        "```json",
        '{ "unit_test": { "command": "npm test -- tests/run-command.test.ts" } }',
        "```",
        "End of output.",
      ].join("\n");

      const unitTest = extractUnitTestFromOutput(output);
      expect(unitTest).toEqual({
        command: "npm test -- tests/run-command.test.ts",
        files: undefined,
        notes: undefined,
      });
    });
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

    // Should have generated a progress markdown file in the steps directory
    const progressFiles = stepFiles.filter(
      (f) => f.startsWith("run-progress") && f.endsWith(".md"),
    );
    expect(progressFiles.length).toBe(1);
  });

  it("marks step as completed with success and no unit_test in minimal run flow", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "minimal");

    let callCount = 0;
    vi.mocked(callAnyAvailableAgent).mockImplementation(async () => {
      callCount += 1;
      return {
        success: true,
        output: callCount === 1 ? "implementation ok" : "validation ok",
        agentUsed: "test-agent",
      };
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    expect(stepContent.status).toBe("🟢 已完成");
    expect(stepContent.unit_test).toBeUndefined();

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const row = getStatusAndErrorFromProgress(progressContent, fileName);
      expect(row.afterStatus).toBe("🟢 已完成");
      expect(row.result).toBe("成功");
      expect(row.error).toBe("");
    }

    // One AI call for implementation and one for verification
    expect(callAnyAvailableAgent).toHaveBeenCalledTimes(2);
  });

  it("retries implementation up to MAX_ATTEMPTS and stops run after final failure", async () => {
    const dir = await createTempDir();
    const firstFile = await writeStep(dir, 1, "first");
    const secondFile = await writeStep(dir, 2, "second");

    // All attempts fail at implementation stage
    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: false,
      output: "",
      error: "AI failure",
    });

    const logs: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((...args: any[]) => {
        logs.push(args.map((a) => String(a)).join(" "));
      });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
      logSpy.mockRestore();
    }

    const firstContent = JSON.parse(
      await fs.readFile(path.join(dir, firstFile), "utf-8"),
    );
    const secondContent = JSON.parse(
      await fs.readFile(path.join(dir, secondFile), "utf-8"),
    );

    expect(firstContent.status).toBe("🔴 待完成");
    // Second step should never be executed when the first step exhausts all attempts
    expect(secondContent.status).toBe("🔴 待完成");

    // Should call AI exactly MAX_ATTEMPTS times (5) for the first step only
    expect(callAnyAvailableAgent).toHaveBeenCalledTimes(5);
    // Run should be marked as failed
    expect(process.exitCode).toBe(1);

    const output = logs.join("\n");
    // Final summary should clearly report the first failing step
    expect(output).toContain("✗ 第一个失败的步骤：001-first.json");
    expect(output).toContain("step-001");

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const firstResult = getResultFromProgress(
        progressContent,
        "001-first.json",
      );
      const secondResult = getResultFromProgress(
        progressContent,
        "002-second.json",
      );
      expect(firstResult).toBe("失败");
      // Second step should be recorded as not executed
      expect(secondResult).toBe("未执行");
    }
  });

  it("sets step back to pending and records unit test failure when tests fail after successful implementation", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "unit-test-fail", {
      unit_test: {
        // Force unit tests to fail by running node with a non-zero exit code
        command: `${process.execPath} -e "process.exit(1)"`,
      },
    });

    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: true,
      output: "implementation ok",
      agentUsed: "test-agent",
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    // Final status should be set back to pending after repeated unit test failures
    expect(stepContent.status).toBe("🔴 待完成");
    expect(process.exitCode).toBe(1);

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const row = getStatusAndErrorFromProgress(progressContent, fileName);
      expect(row.afterStatus).toBe("🔴 待完成");
      expect(row.result).toBe("失败");
      expect(row.error).toContain("单元测试失败");
    }
  });

  it("sets step back to pending and records verification failure when verification fails after passing unit tests", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "verification-fail", {
      unit_test: {
        // Unit tests should pass so that failures come from verification
        command: `${process.execPath} -e "process.exit(0)"`,
      },
    });

    let callCount = 0;
    vi.mocked(callAnyAvailableAgent).mockImplementation(async () => {
      callCount += 1;
      // Odd calls: implementation succeeds; even calls: verification fails
      if (callCount % 2 === 1) {
        return {
          success: true,
          output: "implementation ok",
          agentUsed: "test-agent",
        };
      }
      return {
        success: false,
        output: "",
        error: "verification failed",
      };
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    // Final status should be pending because verification never succeeds
    expect(stepContent.status).toBe("🔴 待完成");
    expect(process.exitCode).toBe(1);

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const row = getStatusAndErrorFromProgress(progressContent, fileName);
      expect(row.afterStatus).toBe("🔴 待完成");
      expect(row.result).toBe("失败");
      expect(row.error).toContain("verification failed");
    }
  });

  it("allows multi-attempt recovery across implementation and unit test failures and still runs later steps", async () => {
    const dir = await createTempDir();

    // Flaky unit test script: fails once, then succeeds on subsequent runs.
    const unitTestScriptPath = path.join(dir, "flaky-unit-test.js");
    const unitTestScriptContent = `
const fs = require("fs");
const path = require("path");
const counterFile = path.join(process.cwd(), "flaky-unit-test-attempts.txt");
let count = 0;
if (fs.existsSync(counterFile)) {
  const raw = fs.readFileSync(counterFile, "utf8");
  const parsed = parseInt(raw, 10);
  if (!Number.isNaN(parsed)) {
    count = parsed;
  }
}
count += 1;
fs.writeFileSync(counterFile, String(count), "utf8");
// Fail the first run, succeed afterwards
if (count < 2) {
  process.exit(1);
}
process.exit(0);
`;
    await fs.writeFile(unitTestScriptPath, unitTestScriptContent, "utf-8");

    const firstFile = await writeStep(dir, 1, "flaky-first", {
      unit_test: {
        command: `${process.execPath} ${unitTestScriptPath}`,
      },
    });
    const secondFile = await writeStep(dir, 2, "second");

    let callCount = 0;
    vi.mocked(callAnyAvailableAgent).mockImplementation(async () => {
      callCount += 1;

      // Attempt 1 implementation for step 1 fails
      if (callCount === 1) {
        return {
          success: false,
          output: "",
          error: "implementation failed on attempt 1",
        };
      }

      // Implementations for subsequent attempts and later steps succeed
      if (
        callCount === 2 || // attempt 2 implementation for step 1
        callCount === 3 || // attempt 3 implementation for step 1
        callCount === 5 // implementation for step 2
      ) {
        return {
          success: true,
          output: "implementation ok",
          agentUsed: "test-agent",
        };
      }

      // Verification calls for successful attempts also succeed
      return {
        success: true,
        output: "verification ok",
        agentUsed: "test-agent",
      };
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    // We expect multiple implementation attempts for the first step plus verification and second step processing
    expect(callCount).toBeGreaterThanOrEqual(6);
    expect(process.exitCode).toBeUndefined();

    const firstContent = JSON.parse(
      await fs.readFile(path.join(dir, firstFile), "utf-8"),
    );
    const secondContent = JSON.parse(
      await fs.readFile(path.join(dir, secondFile), "utf-8"),
    );

    // Both steps should end up marked as completed after recovery
    expect(firstContent.status).toBe("🟢 已完成");
    expect(secondContent.status).toBe("🟢 已完成");

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const firstRow = getStatusAndErrorFromProgress(
        progressContent,
        firstFile,
      );
      const secondRow = getStatusAndErrorFromProgress(
        progressContent,
        secondFile,
      );
      expect(firstRow.afterStatus).toBe("🟢 已完成");
      expect(firstRow.result).toBe("成功");
      expect(firstRow.error).toBe("");
      expect(secondRow.afterStatus).toBe("🟢 已完成");
      expect(secondRow.result).toBe("成功");
      expect(secondRow.error).toBe("");
    }
  });

  it("updates run-progress after each failed attempt and final success for the same step", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "first");

    let callCount = 0;
    vi.mocked(callAnyAvailableAgent).mockImplementation(async () => {
      callCount += 1;
      if (callCount <= 3) {
        return {
          success: false,
          output: "",
          error: `AI failure attempt ${callCount}`,
        };
      }

      if (callCount === 4) {
        return {
          success: true,
          output: "ok",
          agentUsed: "gemini",
        };
      }

      // Subsequent calls (e.g. verification) succeed
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

    // There should be multiple attempts (3 failures + 1 success) and at least
    // one validation call after the final success.
    expect(callCount).toBeGreaterThanOrEqual(5);

    // Final on-disk report should reflect the last attempt: success with no error summary.
    const finalContent = await readRunProgressContent(dir);
    expect(finalContent).toBeTruthy();
    if (finalContent) {
      const finalRow = getStatusAndErrorFromProgress(finalContent, fileName);
      expect(finalRow.afterStatus).toBe("🟢 已完成");
      expect(finalRow.result).toBe("成功");
      expect(finalRow.error).toBe("");
    }
  });

  it("should only run validation for completed steps when fullVerify is enabled and keep status when tests pass", async () => {
    const dir = await createTempDir();
    await writeStep(dir, 1, "first", { status: "🟢 已完成" });

    // First call: validation succeeds
    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: true,
      output: "ok",
      agentUsed: "gemini",
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".", { fullVerify: true });
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, "001-first.json"), "utf-8"),
    );

    // 状态保持为已完成
    expect(stepContent.status).toBe("🟢 已完成");

    // 仅调用一次 AI（验证），不进入实现阶段
    expect(callAnyAvailableAgent).toHaveBeenCalledTimes(1);
  });

  it("in fullVerify mode, completed step with unit_test only runs tests and validation and keeps completed status", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "fullverify-completed-with-tests", {
      status: "🟢 已完成",
      unit_test: {
        command: `${process.execPath} -e "process.exit(0)"`,
      },
    });

    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: true,
      output: "validation ok",
      agentUsed: "test-agent",
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".", { fullVerify: true });
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    // Status remains completed
    expect(stepContent.status).toBe("🟢 已完成");
    expect(process.exitCode).toBeUndefined();

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const row = getStatusAndErrorFromProgress(progressContent, fileName);
      expect(row.afterStatus).toBe("🟢 已完成");
      expect(row.result).toBe("成功");
      expect(row.error).toBe("");
    }

    // Only a single AI call for validation, implementation should not be invoked
    expect(callAnyAvailableAgent).toHaveBeenCalledTimes(1);
  });

  it("should reopen completed steps when validation fails and then run implementation when fullVerify is enabled", async () => {
    const dir = await createTempDir();
    await writeStep(dir, 1, "first", { status: "🟢 已完成" });

    // First call: validation fails, second call: implementation succeeds
    vi.mocked(callAnyAvailableAgent)
      .mockResolvedValueOnce({
        success: false,
        output: "",
        error: "tests failed",
      })
      .mockResolvedValueOnce({
        success: true,
        output: "ok",
        agentUsed: "gemini",
      });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".", { fullVerify: true });
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, "001-first.json"), "utf-8"),
    );

    // 最终状态应为已完成
    expect(stepContent.status).toBe("🟢 已完成");

    // 调用了两次 AI：一次验证 + 一次实现
    expect(callAnyAvailableAgent).toHaveBeenCalledTimes(2);
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
    const progressFiles = files.filter(
      (f) => f.startsWith("run-progress") && f.endsWith(".md"),
    );
    expect(progressFiles.length).toBe(1);
  });

  it("allows a step to succeed after a failed attempt and continues with later steps", async () => {
    const dir = await createTempDir();
    await writeStep(dir, 1, "first");
    await writeStep(dir, 2, "second");

    // First implementation attempt for step 1 fails, all subsequent AI calls succeed
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

    // Step 1 should eventually complete successfully after retry
    expect(firstContent.status).toBe("🟢 已完成");
    // Subsequent step should also be executed
    expect(secondContent.status).toBe("🟢 已完成");

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const firstResult = getResultFromProgress(
        progressContent,
        "001-first.json",
      );
      const secondResult = getResultFromProgress(
        progressContent,
        "002-second.json",
      );
      expect(firstResult).toBe("成功");
      expect(secondResult).toBe("成功");
    }
  });

  it("prints attempt markers, failure summary, and final success summary for multi-attempt verification failure", async () => {
    const dir = await createTempDir();
    await writeStep(dir, 1, "first");

    let callCount = 0;
    vi.mocked(callAnyAvailableAgent).mockImplementation(async () => {
      callCount += 1;

      // Attempt 1: implementation succeeds, verification fails
      if (callCount === 1) {
        return {
          success: true,
          output: "implementation ok (attempt 1)",
          agentUsed: "test-agent",
        };
      }

      if (callCount === 2) {
        return {
          success: false,
          output: "",
          error: "verification failed in attempt 1",
        };
      }

      // Attempt 2: implementation and verification both succeed
      if (callCount === 3) {
        return {
          success: true,
          output: "implementation ok (attempt 2)",
          agentUsed: "test-agent",
        };
      }

      return {
        success: true,
        output: "validation ok",
        agentUsed: "test-agent",
      };
    });

    const logs: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((...args: any[]) => {
        logs.push(args.map((a) => String(a)).join(" "));
      });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
      logSpy.mockRestore();
    }

    const output = logs.join("\n");

    // Each attempt should be clearly marked with attempt number and step order
    expect(output).toContain("🔁 [1/1] 第 1/5 次尝试执行该步骤");
    expect(output).toContain("🔁 [1/1] 第 2/5 次尝试执行该步骤");

    // Verification failure should emit a short failure summary that matches the context
    expect(output).toContain("本轮失败摘要");
    expect(output).toContain("verification 验证失败");

    // Final success should report which attempt finally passed all tests and verification
    expect(output).toContain("✓ 第 2 次尝试后步骤已通过所有测试与验证");
  });

  it("prints failure summary when unit tests fail during multi-attempt retries", async () => {
    const dir = await createTempDir();
    await writeStep(dir, 1, "first-with-unit-test", {
      unit_test: {
        // A simple command that always fails
        command: `${process.execPath} -e "process.exit(1)"`,
      },
    });

    // Implementation itself always succeeds; retries are driven by unit test failures
    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: true,
      output: "implementation ok",
      agentUsed: "test-agent",
    });

    const logs: string[] = [];
    const logSpy = vi
      .spyOn(console, "log")
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockImplementation((...args: any[]) => {
        logs.push(args.map((a) => String(a)).join(" "));
      });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
      logSpy.mockRestore();
    }

    const output = logs.join("\n");

    // There should be at least one failure summary that mentions unit tests
    expect(output).toContain("本轮失败摘要");
    expect(output).toContain("单元测试命令");
    expect(process.exitCode).toBe(1);
  });

  it("loads unit_test field when present and remains compatible with steps without it", async () => {
    const dir = await createTempDir();

    const fileWithUnitTest = await writeStep(
      dir,
      1,
      "with-unit-test",
      {
        unit_test: {
          command: "npm test -- tests/sample.test.ts",
          files: ["tests/sample.test.ts"],
          notes: "sample notes",
        },
      },
    );
    const fileWithoutUnitTest = await writeStep(dir, 2, "without-unit-test");

    const { entries, hasParseError } = await loadStepEntries(dir, [
      fileWithUnitTest,
      fileWithoutUnitTest,
    ]);

    expect(hasParseError).toBe(false);
    expect(entries.length).toBe(2);

    const withUnit = entries.find(
      (e) => e.fileName === fileWithUnitTest,
    );
    const withoutUnit = entries.find(
      (e) => e.fileName === fileWithoutUnitTest,
    );

    expect(withUnit).toBeDefined();
    expect(withoutUnit).toBeDefined();

    if (!withUnit || !withoutUnit) {
      throw new Error("Expected entries for both step files");
    }

    expect(withUnit.unitTest).toEqual({
      command: "npm test -- tests/sample.test.ts",
      files: ["tests/sample.test.ts"],
      notes: "sample notes",
    });
    expect(withoutUnit.unitTest).toBeUndefined();
  });

  it("extracts unit_test from AI output, writes it to step JSON, and uses it for unit test execution", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "unit-test-step");

    const unitTestSpec = {
      command: `${process.execPath} -e "process.exit(0)"`,
      files: ["tests/run-command.test.ts"],
    };

    const aiOutput = [
      "Implementation complete.",
      JSON.stringify({ unit_test: unitTestSpec }),
      "End of output.",
    ].join("\n");

    vi.mocked(callAnyAvailableAgent)
      .mockResolvedValueOnce({
        success: true,
        output: aiOutput,
        agentUsed: "test-agent",
      })
      .mockResolvedValue({
        success: true,
        output: "validation ok",
        agentUsed: "test-agent",
      });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".");
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    expect(stepContent.unit_test).toEqual({
      command: unitTestSpec.command,
      files: unitTestSpec.files,
    });
  });

  it("in verifyOnly mode, runs unit tests and AI verification without re-implementation and keeps status when all pass", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "verify-only-mode", {
      status: "🟢 已完成",
      unit_test: {
        command: `${process.execPath} -e "process.exit(0)"`,
      },
    });

    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: true,
      output: "validation ok",
      agentUsed: "test-agent",
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".", { verifyOnly: true });
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    // Status should remain completed
    expect(stepContent.status).toBe("🟢 已完成");

    // Should call AI exactly once for verification, not for implementation
    expect(callAnyAvailableAgent).toHaveBeenCalledTimes(1);

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const row = getStatusAndErrorFromProgress(progressContent, fileName);
      expect(row.afterStatus).toBe("🟢 已完成");
      expect(row.result).toBe("成功");
      expect(row.error).toBe("");
    }
  });

  it("in verifyUnitTestOnly mode, runs only unit tests and fails when unit_test is missing", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "verify-unittest-only-missing-unit");

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".", { verifyUnitTestOnly: true });
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    // Status should remain pending but result is failure because no unit_test
    expect(stepContent.status).toBe("🔴 待完成");
    expect(process.exitCode).toBe(1);

    // AI should never be called in unit-test-only mode
    expect(callAnyAvailableAgent).not.toHaveBeenCalled();

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const row = getStatusAndErrorFromProgress(progressContent, fileName);
      expect(row.afterStatus).toBe("🔴 待完成");
      expect(row.result).toBe("失败");
      expect(row.error).toContain("unit_test");
    }
  });

  it("in verifyGenerateUnitTest mode, generates unit_test when missing and writes it back", async () => {
    const dir = await createTempDir();
    const fileName = await writeStep(dir, 1, "verify-generate-unit", {
      status: "🔴 待完成",
    });

    const unitTestSpec = {
      command: `${process.execPath} -e "process.exit(0)"`,
      files: ["tests/sample.test.ts"],
    };

    const aiOutput = [
      "Only generating tests.",
      JSON.stringify({ unit_test: unitTestSpec }),
      "Done.",
    ].join("\n");

    vi.mocked(callAnyAvailableAgent).mockResolvedValue({
      success: true,
      output: aiOutput,
      agentUsed: "test-agent",
    });

    const cwd = process.cwd();
    try {
      process.chdir(dir);
      await runStepsDirectory(".", { verifyGenerateUnitTest: true });
    } finally {
      process.chdir(cwd);
    }

    const stepContent = JSON.parse(
      await fs.readFile(path.join(dir, fileName), "utf-8"),
    );

    expect(stepContent.unit_test).toEqual({
      command: unitTestSpec.command,
      files: unitTestSpec.files,
    });
    // Status is not changed by generate-unittest mode
    expect(stepContent.status).toBe("🔴 待完成");

    const progressContent = await readRunProgressContent(dir);
    expect(progressContent).toBeTruthy();
    if (progressContent) {
      const row = getStatusAndErrorFromProgress(progressContent, fileName);
      expect(row.afterStatus).toBe("🔴 待完成");
      expect(row.result).toBe("成功");
      expect(row.error).toBe("");
    }
  });
});
