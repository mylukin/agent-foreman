/**
 * Integration tests for CLI `run` command
 *
 * These tests exercise the built CLI (dist/index.js) end-to-end,
 * using real filesystem operations and a fake AI agent process.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

// Path to the built CLI entrypoint
const CLI_PATH = path.resolve(process.cwd(), "dist/index.js");

// On Windows we skip these tests because the fake agent script is POSIX-only
const isWindows = process.platform === "win32";
const testOrSkip = isWindows ? it.skip : it;

async function createTempDir(prefix: string): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

async function createStepsDir(): Promise<{ rootDir: string; stepsDir: string }> {
  const rootDir = await createTempDir("foreman-run-cli-");
  const stepsDir = path.join(rootDir, "steps");
  await fs.mkdir(stepsDir, { recursive: true });
  return { rootDir, stepsDir };
}

async function writeStepFile(
  stepsDir: string,
  index: number,
  slug: string,
  overrides: Partial<{
    id: string;
    description: string;
    status: string;
  }> = {},
): Promise<string> {
  const prefix = String(index).padStart(3, "0");
  const fileName = `${prefix}-${slug}.json`;
  const filePath = path.join(stepsDir, fileName);

  const step = {
    id: overrides.id ?? `step-${prefix}`,
    description: overrides.description ?? `Step ${prefix} description`,
    status: (overrides.status as any) ?? "🔴 待完成",
    verification: [
      {
        type: "integration",
        description: `Integration check for step ${prefix}`,
      },
    ],
  };

  await fs.writeFile(filePath, JSON.stringify(step, null, 2), "utf-8");
  return fileName;
}

async function createFakeAgentScript(
  binDir: string,
  options: { exitCode: number },
): Promise<string> {
  const scriptPath = path.join(binDir, "codex");
  const scriptContent = [
    "#!/bin/sh",
    "# Fake codex agent used in integration tests.",
    "# It consumes stdin, prints a marker line, and exits with the requested code.",
    "cat >/dev/null || true",
    `echo \"FAKE_CODEX_EXIT_${options.exitCode}\"`,
    `exit ${options.exitCode}`,
    "",
  ].join("\n");

  await fs.writeFile(scriptPath, scriptContent, "utf-8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

async function createFlakyAgentScript(
  binDir: string,
  options: { failCountBeforeSuccess: number; stateFile: string },
): Promise<string> {
  const scriptPath = path.join(binDir, "codex");
  const escapedStateFile = options.stateFile.replace(/"/g, '\\"');
  const scriptContent = [
    "#!/bin/sh",
    "# Flaky fake codex agent used for multi-attempt integration tests.",
    `STATE_FILE="${escapedStateFile}"`,
    "if [ -f \"$STATE_FILE\" ]; then",
    "  IFS= read -r COUNT <\"$STATE_FILE\" 2>/dev/null || COUNT=0",
    "else",
    "  COUNT=0",
    "fi",
    "COUNT=$((COUNT + 1))",
    "echo \"$COUNT\" >\"$STATE_FILE\"",
    "# Consume stdin to mirror real agent behaviour",
    "cat >/dev/null 2>/dev/null || true",
    `if [ \"$COUNT\" -le ${options.failCountBeforeSuccess} ]; then`,
    "  echo \"FAKE_CODEX_EXIT_1_ATTEMPT_$COUNT\"",
    "  exit 1",
    "fi",
    "echo \"FAKE_CODEX_EXIT_0_ATTEMPT_$COUNT\"",
    "exit 0",
    "",
  ].join("\n");

  await fs.writeFile(scriptPath, scriptContent, "utf-8");
  await fs.chmod(scriptPath, 0o755);
  return scriptPath;
}

describe("CLI run command (integration)", () => {
  const tempRoots: string[] = [];

  beforeEach(() => {
    // Ensure we don't leak exitCode from previous runs
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (process as any).exitCode = undefined;
  });

  afterEach(async () => {
    // Best-effort cleanup of temporary directories
    for (const dir of tempRoots) {
      try {
        await fs.rm(dir, { recursive: true, force: true });
      } catch {
        // ignore cleanup errors
      }
    }
    tempRoots.length = 0;
  });

  testOrSkip("[integration] run succeeds with all steps completed", async () => {
    const { rootDir, stepsDir } = await createStepsDir();
    tempRoots.push(rootDir);

    // Two pending steps that should be executed by the fake agent
    const firstFile = await writeStepFile(stepsDir, 1, "first");
    const secondFile = await writeStepFile(stepsDir, 2, "second");

    const binDir = path.join(rootDir, "bin");
    await fs.mkdir(binDir, { recursive: true });
    await createFakeAgentScript(binDir, { exitCode: 0 });

    // Force the CLI to use the fake "codex" agent first
    const env = {
      ...process.env,
      AGENT_FOREMAN_AGENTS: "codex",
      // Ensure our fake agent is found before any real agents, and keep /usr/bin for `which`
      PATH: `${binDir}${path.delimiter}/usr/bin`,
    };

    const result = spawnSync(process.execPath, [CLI_PATH, "run", stepsDir], {
      cwd: rootDir,
      encoding: "utf-8",
      env,
    });

    // 1) Exit code should be zero when all steps succeed
    expect(result.status, result.stderr || result.stdout).toBe(0);

    // 2) Output should contain overall execution summary
    expect(result.stdout).toContain("📋 本次 run 执行结果：");

    // 3) Output should include per-step progress lines (file name + id)
    expect(result.stdout).toContain(firstFile);
    expect(result.stdout).toContain("step-001");
    expect(result.stdout).toContain(secondFile);
    expect(result.stdout).toContain("step-002");

    // 4) Steps directory should contain a run-progress markdown report
    const stepFiles = await fs.readdir(stepsDir);
    const progressFiles = stepFiles.filter(
      (f) => f.startsWith("run-progress") && f.endsWith(".md"),
    );
    expect(progressFiles.length).toBe(1);

    // 5) CLI output should mention the report path
    expect(result.stdout).toMatch(/执行进度报告已写入：.*run-progress.*\.md/);
  });

  testOrSkip(
    "[integration] run retries failing agent calls across multiple attempts and eventually succeeds",
    async () => {
      const { rootDir, stepsDir } = await createStepsDir();
      tempRoots.push(rootDir);

      const stepFile = await writeStepFile(stepsDir, 1, "flaky-agent");

      const binDir = path.join(rootDir, "bin");
      await fs.mkdir(binDir, { recursive: true });

      const stateFile = path.join(rootDir, "codex-attempt-count.txt");
      await createFlakyAgentScript(binDir, {
        failCountBeforeSuccess: 2,
        stateFile,
      });

      const env = {
        ...process.env,
        AGENT_FOREMAN_AGENTS: "codex",
        PATH: `${binDir}${path.delimiter}/usr/bin`,
      };

      const result = spawnSync(process.execPath, [CLI_PATH, "run", stepsDir], {
        cwd: rootDir,
        encoding: "utf-8",
        env,
      });

      // Run should eventually succeed after the flaky agent recovers
      expect(result.status, result.stderr || result.stdout).toBe(0);

      // Output should show multiple attempts for the single step
      expect(result.stdout).toContain("🔁 第 2/5 次尝试执行该步骤");
      expect(result.stdout).toContain("🔁 第 3/5 次尝试执行该步骤");

      // Final summary should report success for the only step
      expect(result.stdout).toContain(
        "📋 本次 run 执行结果：1/1 个步骤执行成功",
      );
      expect(result.stdout).toContain(stepFile);

      // The flaky agent script should have been invoked at least three times
      const stateRaw = await fs.readFile(stateFile, "utf-8");
      const count = parseInt(stateRaw.trim(), 10);
      expect(count).toBeGreaterThanOrEqual(3);
    },
  );

  testOrSkip("[integration] run --full-verify keeps completed step completed when tests and verification pass", async () => {
    const { rootDir, stepsDir } = await createStepsDir();
    tempRoots.push(rootDir);

    const fileName = "001-completed.json";
    const step = {
      id: "step-001",
      description: "Already completed step",
      status: "🟢 已完成",
      verification: [
        {
          type: "integration",
          description: "Regression verification for completed step",
        },
      ],
      unit_test: {
        command: `${process.execPath} -e "process.exit(0)"`,
      },
    };

    await fs.writeFile(
      path.join(stepsDir, fileName),
      JSON.stringify(step, null, 2),
      "utf-8",
    );

    const binDir = path.join(rootDir, "bin");
    await fs.mkdir(binDir, { recursive: true });
    await createFakeAgentScript(binDir, { exitCode: 0 });

    const env = {
      ...process.env,
      AGENT_FOREMAN_AGENTS: "codex",
      PATH: `${binDir}${path.delimiter}/usr/bin`,
    };

    const result = spawnSync(
      process.execPath,
      [CLI_PATH, "run", stepsDir, "--full-verify"],
      {
        cwd: rootDir,
        encoding: "utf-8",
        env,
      },
    );

    expect(result.status, result.stderr || result.stdout).toBe(0);

    // Output should mention regression verification for completed step
    expect(result.stdout).toContain(
      "当前步骤已标记为已完成，将仅重新运行测试进行回归验证...",
    );
    // Unit tests and verification should both pass
    expect(result.stdout).toContain("🧪 执行单元测试");
    expect(result.stdout).toContain("✓ 单元测试通过");
    expect(result.stdout).toContain("✓ 回归测试通过，保持状态为：🟢 已完成");
    // Implementation should not be invoked again for this step
    expect(result.stdout).not.toContain("正在调用命令行 AI 处理该步骤");

    const updatedStep = JSON.parse(
      await fs.readFile(path.join(stepsDir, fileName), "utf-8"),
    );
    expect(updatedStep.status).toBe("🟢 已完成");

    const stepFiles = await fs.readdir(stepsDir);
    const progressFiles = stepFiles.filter(
      (f) => f.startsWith("run-progress") && f.endsWith(".md"),
    );
    expect(progressFiles.length).toBe(1);

    const reportPath = path.join(stepsDir, progressFiles[0]);
    const reportContent = await fs.readFile(reportPath, "utf-8");
    const row = reportContent
      .split("\n")
      .find((line) => line.includes(`| ${fileName} |`));
    expect(row).toBeDefined();
    if (!row) return;

    const cells = row.split("|").map((c) => c.trim());
    // cells: ["", "顺序", "文件名", "步骤 ID", "执行前状态", "执行后状态", "结果", "摘要", "错误信息", ""]
    expect(cells[4]).toBe("🟢 已完成");
    expect(cells[5]).toBe("🟢 已完成");
    expect(cells[6]).toBe("成功");
    expect(cells[8]).toBe("");
  });

  testOrSkip("[integration] run reports first failing step when AI call fails", async () => {
    const { rootDir, stepsDir } = await createStepsDir();
    tempRoots.push(rootDir);

    const failingFile = await writeStepFile(stepsDir, 1, "failing");
    await writeStepFile(stepsDir, 2, "later");

    const binDir = path.join(rootDir, "bin");
    await fs.mkdir(binDir, { recursive: true });
    await createFakeAgentScript(binDir, { exitCode: 1 });

    const env = {
      ...process.env,
      AGENT_FOREMAN_AGENTS: "codex",
      PATH: `${binDir}${path.delimiter}/usr/bin`,
    };

    const result = spawnSync(process.execPath, [CLI_PATH, "run", stepsDir], {
      cwd: rootDir,
      encoding: "utf-8",
      env,
    });

    // 1) Non-zero exit code on failure
    expect(result.status, result.stderr || result.stdout).not.toBe(0);

    // 2) CLI output should mention the first failing step (file name + id)
    expect(result.stdout).toContain("✗ 第一个失败的步骤：");
    expect(result.stdout).toContain(failingFile);
    expect(result.stdout).toContain("step-001");

    // 3) A run-progress report should be generated
    const stepFiles = await fs.readdir(stepsDir);
    const progressFiles = stepFiles.filter(
      (f) => f.startsWith("run-progress") && f.endsWith(".md"),
    );
    expect(progressFiles.length).toBe(1);

    const reportPath = path.join(stepsDir, progressFiles[0]);
    const reportContent = await fs.readFile(reportPath, "utf-8");

    // 4) The corresponding row in the report should mark the step as failed
    const failingRow = reportContent
      .split("\n")
      .find((line) => line.includes(failingFile));
    expect(failingRow).toBeDefined();
    expect(failingRow as string).toContain("失败");
  });

  testOrSkip("[integration] run --full-verify reopens completed step and enters implementation when verification fails", async () => {
    const { rootDir, stepsDir } = await createStepsDir();
    tempRoots.push(rootDir);

    const completedFile = await writeStepFile(stepsDir, 1, "completed", {
      status: "🟢 已完成",
    });

    const binDir = path.join(rootDir, "bin");
    await fs.mkdir(binDir, { recursive: true });
    await createFakeAgentScript(binDir, { exitCode: 1 });

    const env = {
      ...process.env,
      AGENT_FOREMAN_AGENTS: "codex",
      PATH: `${binDir}${path.delimiter}/usr/bin`,
    };

    const result = spawnSync(
      process.execPath,
      [CLI_PATH, "run", stepsDir, "--full-verify"],
      {
        cwd: rootDir,
        encoding: "utf-8",
        env,
      },
    );

    // Overall run should fail because neither validation nor implementation succeeds
    expect(result.status, result.stderr || result.stdout).not.toBe(0);

    // Should first emit regression verification prompt for the completed step
    expect(result.stdout).toContain(
      "当前步骤已标记为已完成，将仅重新运行测试进行回归验证...",
    );
    expect(result.stdout).toContain("正在调用命令行 AI 进行回归测试验证...");
    expect(result.stdout).toContain("回归测试未通过或存在问题");

    // After validation failure, run should enter implementation phase
    expect(result.stdout).toContain("正在调用命令行 AI 处理该步骤");

    const updatedStep = JSON.parse(
      await fs.readFile(path.join(stepsDir, completedFile), "utf-8"),
    );
    // Step should eventually be reopened (marked as pending) after repeated failures
    expect(updatedStep.status).toBe("🔴 待完成");
  });
});
