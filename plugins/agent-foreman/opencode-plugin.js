import { tool } from "@opencode-ai/plugin";

/**
 * Agent Foreman OpenCode Plugin
 *
 * Exposes agent-foreman CLI commands as OpenCode tools.
 *
 * Docs:
 * - https://opencode.ai/docs/plugins/
 */
export const AgentForemanPlugin = async ({ $, directory, worktree }) => {
  const cwd = worktree || directory;

  const ensurePlainArgs = (args) => {
    const list = Array.isArray(args) ? [...args] : [args];

    // Force non-interactive, non-TTY output for OpenCode.
    if (!list.includes("--plain")) list.push("--plain");

    return list;
  };

  const stripAnsiAndControl = (input) => {
    if (!input) return "";

    let text = String(input);

    // OSC (Operating System Command) sequences: ESC ] ... BEL or ESC \
    text = text.replace(/\u001B\][^\u0007]*(?:\u0007|\u001B\\)/g, "");

    // CSI + other ANSI escape sequences.
    // Adapted from commonly-used "strip-ansi" patterns.
    text = text.replace(
      /[\u001B\u009B][[\]()#;?]*(?:(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]|(?:[a-zA-Z\d]*(?:;[a-zA-Z\d]*)*)?\u0007)/g,
      ""
    );

    // Drop remaining control chars that can confuse renderers.
    // Keep: \n, \r, \t
    text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");

    return text;
  };

  const runForeman = async (args) => {
    const finalArgs = ensurePlainArgs(args);

    const plainEnv = {
      ...process.env, // Inherit current environment (PATH, etc.)
      AGENT_FOREMAN_PLAIN: "true",
      OPENCODE: "1",
      NO_COLOR: "1",
      CLICOLOR: "0",
      FORCE_COLOR: "0",
      TERM: "dumb",
    };

    // Prefer setting env via the runner API (avoids shell assumptions).
    const base = $`agent-foreman ${finalArgs}`.cwd(cwd).nothrow();
    const cmd = typeof base.env === "function" ? base.env(plainEnv) : base;

    const result = await cmd;

    const stdout = stripAnsiAndControl((result.stdout ?? "").toString());
    const stderr = stripAnsiAndControl((result.stderr ?? "").toString());
    const exitCode = Number(result.exitCode ?? 0);

    const parts = [];
    if (stdout.trim()) parts.push(stdout.trimEnd());
    if (stderr.trim()) parts.push(`(stderr)\n${stderr.trimEnd()}`);
    parts.push(`(exit ${exitCode})`);
    return parts.join("\n\n");
  };

  return {
    tool: {
      foreman_spec: tool({
        description: "Transform requirements into tasks (Expert Council)",
        args: {
          requirement: tool.schema.string().describe("Requirement description"),
        },
        async execute({ requirement }) {
          return `Please call the skill "foreman-spec" to process this requirement: ${requirement}\n\n[tool_call: skill { name: "foreman-spec" }]`;
        },
      }),

      foreman_status: tool({
        description: "Show current project status with feature completion and recent activity",
        args: {
          json: tool.schema.boolean().optional().describe("Output as JSON"),
          quiet: tool.schema.boolean().optional().describe("Minimal output"),
        },
        async execute({ json, quiet }) {
          const args = ["status"];
          if (json) args.push("--json");
          if (quiet) args.push("--quiet");
          return await runForeman(args);
        },
      }),

      foreman_next: tool({
        description: "Get next/specific feature to work on",
        args: {
          featureId: tool.schema.string().optional().describe("Specific feature ID to work on"),
          check: tool.schema.boolean().optional().describe("Run tests before showing feature"),
          dryRun: tool.schema.boolean().optional().describe("Preview without changes"),
          json: tool.schema.boolean().optional().describe("Output as JSON"),
          allowDirty: tool.schema.boolean().optional().describe("Allow with uncommitted changes"),
        },
        async execute({ featureId, check, dryRun, json, allowDirty }) {
          const args = ["next"];
          if (featureId) args.push(featureId);
          if (check) args.push("--check");
          if (dryRun) args.push("--dry-run");
          if (json) args.push("--json");
          if (allowDirty) args.push("--allow-dirty");
          return await runForeman(args);
        },
      }),

      foreman_check: tool({
        description: "Verify implementation of a feature",
        args: {
          featureId: tool.schema.string().optional().describe("Feature ID to check"),
          verbose: tool.schema.boolean().optional().describe("Show detailed output"),
          ai: tool.schema.boolean().optional().describe("Enable AI autonomous exploration"),
          full: tool.schema.boolean().optional().describe("Run full verification"),
        },
        async execute({ featureId, verbose, ai, full }) {
          const args = ["check"];
          if (featureId) args.push(featureId);
          if (verbose) args.push("--verbose");
          if (ai) args.push("--ai");
          if (full) args.push("--full");
          return await runForeman(args);
        },
      }),

      foreman_done: tool({
        description: "Mark complete + auto-commit",
        args: {
          featureId: tool.schema.string().describe("Feature ID to mark as done"),
          notes: tool.schema.string().optional().describe("Additional notes"),
          noCommit: tool.schema.boolean().optional().describe("Skip auto-commit"),
          skipCheck: tool.schema.boolean().optional().describe("Skip verification"),
        },
        async execute({ featureId, notes, noCommit, skipCheck }) {
          const args = ["done", featureId];
          if (notes) args.push("-m", notes);
          if (noCommit) args.push("--no-commit");
          if (skipCheck) args.push("--skip-check");
          return await runForeman(args);
        },
      }),

      foreman_fail: tool({
        description: "Mark as failed and continue to next",
        args: {
          featureId: tool.schema.string().describe("Feature ID to mark as failed"),
          reason: tool.schema.string().describe("Reason for failure"),
        },
        async execute({ featureId, reason }) {
          const args = ["fail", featureId, "-r", reason];
          return await runForeman(args);
        },
      }),

      foreman_impact: tool({
        description: "Analyze impact of changes",
        args: {
          featureId: tool.schema.string().describe("Feature ID"),
        },
        async execute({ featureId }) {
          return await runForeman(["impact", featureId]);
        },
      }),

      foreman_init: tool({
        description: "Initialize harness",
        args: {
          goal: tool.schema.string().optional().describe("Project goal"),
        },
        async execute({ goal }) {
          const args = ["init"];
          if (goal) args.push(goal);
          return await runForeman(args);
        },
      }),

      foreman_analyze: tool({
        description: "Generate AI-powered project analysis",
        args: {
          output: tool.schema.string().optional().describe("Output file path"),
          verbose: tool.schema.boolean().optional().describe("Verbose output"),
        },
        async execute({ output, verbose }) {
          const args = ["init", "--analyze"];
          if (output) args.push("--analyze-output", output);
          if (verbose) args.push("--verbose");
          return await runForeman(args);
        },
      }),

      foreman_scan: tool({
        description: "Scan project verification capabilities",
        args: {},
        async execute() {
          return await runForeman(["init", "--scan"]);
        },
      }),

      foreman_run: tool({
        description:
          "Return strict system instructions for autonomous batch processing (equivalent to Claude plugin /run).",
        args: {},
        async execute() {
          return `
Feature Run Mode - SYSTEM INSTRUCTION

UNATTENDED MODE ACTIVE
- No questions
- No stopping for errors
- Must complete all features

Loop:
1) Run foreman_status (note pending count)
2) While pending > 0:
   - Run foreman_next
   - Implement
   - Run foreman_check <id>
   - Run foreman_done <id>
   - If failure: foreman_fail <id> -r "reason"
3) Exit only when pending == 0
`.trim();
        },
      }),
    },
  };
};
