/**
 * CLI command definitions for yargs
 * Defines all command handlers with their options
 */
import type { Argv } from "yargs";
import { printAgentStatus } from "../agents.js";
import type { InitMode, TaskType } from "../types/index.js";

import { detectProjectGoal } from "./utils.js";
import { runInit, type InitOptions } from "./init.js";
import { runNext } from "./next.js";
import { runStatus } from "./status.js";
import { runImpact } from "./impact.js";
import { runCheck } from "./check.js";
import { runDone } from "./done.js";
import { runFail } from "./fail.js";
import { runTDD } from "./tdd.js";
import { runInstall } from "./install.js";
import { runUninstall } from "./uninstall.js";
import { runOpencodeInstall } from "../opencode-installer.js";
// Note: migrate is internal only, auto-executed when loading features

/**
 * Register the 'init' command
 */
export function registerInitCommand(yargs: Argv): Argv {
  return yargs.command(
    "init [goal]",
    "Initialize or upgrade the long-task harness",
    (y) =>
      y
        .positional("goal", {
          describe: "Project goal description (auto-detected if not provided)",
          type: "string",
        })
        .option("mode", {
          alias: "m",
          describe: "Init mode: merge, new, or scan",
          type: "string",
          default: "merge",
          choices: ["merge", "new", "scan"] as const,
        })
        .option("task-type", {
          alias: "t",
          describe: "Default verification type for tasks:\n" +
            "  code   - Software development tasks (unit tests, build)\n" +
            "  ops    - Operational tasks (manual checklist verification)\n" +
            "  data   - Data processing tasks (output validation)\n" +
            "  infra  - Infrastructure tasks (resource state checks)\n" +
            "  manual - Manual verification only (no automation)",
          type: "string",
          choices: ["code", "ops", "data", "infra", "manual"] as const,
        })
        .option("verbose", {
          alias: "v",
          type: "boolean",
          default: false,
        })
        // Standalone operation flags
        .option("analyze", {
          type: "boolean",
          default: false,
          describe: "Generate ARCHITECTURE.md only (skip harness setup)",
        })
        .option("analyze-output", {
          type: "string",
          default: "docs/ARCHITECTURE.md",
          describe: "Output path for --analyze mode",
        })
        .option("scan", {
          type: "boolean",
          default: false,
          describe: "Detect verification capabilities only (skip harness setup)",
        })
        .option("scan-force", {
          alias: "f",
          type: "boolean",
          default: false,
          describe: "Force re-detection in --scan mode (ignore cache)",
        })
        // Conflict check
        .check((argv) => {
          if (argv.analyze && argv.scan) {
            throw new Error("Cannot use --analyze and --scan together. Choose one.");
          }
          return true;
        }),
    async (argv) => {
      const options: InitOptions = {
        analyzeOnly: argv.analyze,
        analyzeOutput: argv.analyzeOutput,
        scanOnly: argv.scan,
        scanForce: argv.scanForce,
      };

      // For analyze/scan only modes, goal is not needed
      const goal = (argv.analyze || argv.scan)
        ? ""
        : (argv.goal || (await detectProjectGoal(process.cwd())));

      await runInit(goal, argv.mode as InitMode, argv.verbose, argv.taskType as TaskType | undefined, options);
    }
  );
}

/**
 * Register the 'next' command
 */
export function registerNextCommand(yargs: Argv): Argv {
  return yargs.command(
    "next [feature_id]",
    "Show next task/feature to work on or specific task details",
    (y) =>
      y
        .positional("feature_id", {
          describe: "Specific task/feature ID to work on",
          type: "string",
        })
        .option("dry-run", { alias: "d", type: "boolean", default: false, describe: "Show plan without making changes" })
        .option("check", { alias: "c", type: "boolean", default: false, describe: "Run basic tests before showing next task" })
        .option("allow-dirty", { type: "boolean", default: false, describe: "Allow running with uncommitted changes" })
        .option("json", { type: "boolean", default: false, describe: "Output as JSON for scripting" })
        .option("quiet", { alias: "q", type: "boolean", default: false, describe: "Suppress decorative output" })
        .option("refresh-guidance", { type: "boolean", default: false, describe: "Force regenerate TDD guidance (ignore cache)" }),
    async (argv) => {
      await runNext(argv.feature_id, argv.dryRun, argv.check, argv.allowDirty, argv.json, argv.quiet, argv.refreshGuidance);
    }
  );
}

/**
 * Register the 'status' command
 */
export function registerStatusCommand(yargs: Argv): Argv {
  return yargs.command(
    "status",
    "Show current task/feature harness status",
    (y) =>
      y
        .option("json", { type: "boolean", default: false, describe: "Output as JSON for scripting" })
        .option("quiet", { alias: "q", type: "boolean", default: false, describe: "Suppress decorative output" }),
    async (argv) => {
      await runStatus(argv.json, argv.quiet);
    }
  );
}

/**
 * Register the 'impact' command
 */
export function registerImpactCommand(yargs: Argv): Argv {
  return yargs.command(
    "impact <feature_id>",
    "Analyze impact of changes to a task/feature",
    (y) =>
      y.positional("feature_id", {
        describe: "Task/feature ID to analyze",
        type: "string",
        demandOption: true,
      }),
    async (argv) => {
      await runImpact(argv.feature_id!);
    }
  );
}

/**
 * Register the 'done' command
 */
export function registerDoneCommand(yargs: Argv): Argv {
  return yargs.command(
    "done <feature_id>",
    "Verify and mark a task/feature as complete",
    (y) =>
      y
        .positional("feature_id", { describe: "Task/feature ID to mark complete", type: "string", demandOption: true })
        .option("notes", { alias: "n", type: "string", describe: "Additional notes" })
        .option("no-commit", { type: "boolean", default: false, describe: "Skip automatic git commit" })
        .option("skip-check", { type: "boolean", default: true, describe: "Skip verification (default: true, use --no-skip-check to run verification)" })
        .option("verbose", { alias: "v", type: "boolean", default: false, describe: "Show detailed verification output" })
        .option("ai", { type: "boolean", default: false, describe: "Enable AI autonomous exploration for verification" })
        .option("quick", { type: "boolean", default: true, describe: "Run only related tests (selective test execution, default)" })
        .option("full", { type: "boolean", default: false, describe: "Force full test suite" })
        .option("test-pattern", { type: "string", describe: "Explicit test pattern to use" })
        .option("skip-e2e", { type: "boolean", default: false, describe: "Skip E2E tests entirely" })
        .option("loop", { type: "boolean", default: true, describe: "Loop mode enabled by default (use --no-loop to disable)" }),
    async (argv) => {
      const testMode = argv.full ? "full" : "quick";
      const e2eMode = argv.skipE2e ? "skip" : argv.full ? "full" : undefined;
      await runDone(argv.feature_id!, argv.notes, !argv.noCommit, argv.skipCheck, argv.verbose, argv.ai, testMode, argv.testPattern, argv.skipE2e, e2eMode, argv.loop);
    }
  );
}

/**
 * Register the 'fail' command
 */
export function registerFailCommand(yargs: Argv): Argv {
  return yargs.command(
    "fail <feature_id>",
    "Mark a task/feature as failed",
    (y) =>
      y
        .positional("feature_id", { describe: "Task/feature ID to mark as failed", type: "string", demandOption: true })
        .option("reason", { alias: "r", type: "string", describe: "Reason for failure" })
        .option("loop", { type: "boolean", default: true, describe: "Show next task instruction (use --no-loop to disable)" }),
    async (argv) => {
      await runFail(argv.feature_id!, argv.reason, argv.loop);
    }
  );
}

/**
 * Register the 'tdd' command
 */
export function registerTDDCommand(yargs: Argv): Argv {
  return yargs.command(
    "tdd [mode]",
    "View or change TDD mode configuration",
    (y) =>
      y.positional("mode", {
        describe: "TDD mode to set",
        type: "string",
        choices: ["strict", "recommended", "disabled"] as const,
      }),
    async (argv) => {
      await runTDD(argv.mode);
    }
  );
}

/**
 * Register the 'check' command
 *
 * Modes:
 * - Fast (default, no args): git diff → selective tests + task impact notification
 * - AI (--ai): Enables AI verification (for fast mode: affected tasks, for task mode: autonomous exploration)
 * - Full (--full): All tests + build + E2E
 */
export function registerCheckCommand(yargs: Argv): Argv {
  return yargs.command(
    "check [feature_id]",
    "Verify code changes (fast mode) or task completion",
    (y) =>
      y
        .positional("feature_id", { describe: "Task/feature ID for task verification (omit for fast mode)", type: "string" })
        .option("full", { type: "boolean", default: false, describe: "Run full verification (all tests + build + E2E)" })
        .option("ai", { type: "boolean", default: false, describe: "Enable AI verification (autonomous exploration for tasks)" })
        .option("verbose", { alias: "v", type: "boolean", default: false, describe: "Show detailed output" })
        .option("skip-checks", { alias: "s", type: "boolean", default: false, describe: "Skip automated checks, AI only" })
        .option("quick", { type: "boolean", default: true, describe: "Run only related tests (for task mode)" })
        .option("test-pattern", { type: "string", describe: "Explicit test pattern to use" })
        .option("skip-e2e", { type: "boolean", default: false, describe: "Skip E2E tests entirely" }),
    async (argv) => {
      // Determine test mode based on flags
      const testMode = argv.full ? "full" : "quick";
      const e2eMode = argv.skipE2e ? "skip" : argv.full ? "full" : undefined;
      await runCheck(
        argv.feature_id,
        argv.verbose,
        argv.skipChecks,
        argv.ai,
        testMode,
        argv.testPattern,
        argv.skipE2e,
        e2eMode,
        argv.full
      );
    }
  );
}

/**
 * Register utility commands
 */
export function registerUtilityCommands(yargs: Argv): Argv {
  return yargs
    .command("agents", "Show available AI agents status", {}, async () => {
      printAgentStatus();
    });
}

/**
 * Register the 'install' command
 */
export function registerInstallCommand(yargs: Argv): Argv {
  return yargs.command(
    "install",
    "Install plugin (Claude Code by default, or --opencode for OpenCode)",
    (y) =>
      y
        .option("force", {
          alias: "f",
          type: "boolean",
          default: false,
          describe: "Force reinstall even if already installed",
        })
        .option("opencode", {
          type: "boolean",
          default: false,
          describe: "Install OpenCode plugin to current project (.opencode/)",
        }),
    async (argv) => {
      if (argv.opencode) {
        await runOpencodeInstall(argv.force);
      } else {
        await runInstall(argv.force);
      }
    }
  );
}

/**
 * Register the 'uninstall' command
 */
export function registerUninstallCommand(yargs: Argv): Argv {
  return yargs.command(
    "uninstall",
    "Uninstall agent-foreman Claude Code plugin",
    {},
    async () => {
      await runUninstall();
    }
  );
}

