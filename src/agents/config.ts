/**
 * AI Agent Configuration
 */

import type { AgentConfig } from "./types.js";

/**
 * OpenCode configuration helpers
 *
 * NOTE: `opencode run` accepts the prompt as a positional argument (NOT stdin).
 * Model and agent are configurable ONLY via environment variables:
 * - AGENT_FOREMAN_OPENCODE_MODEL / OPENCODE_MODEL (optional)
 * - AGENT_FOREMAN_OPENCODE_AGENT / OPENCODE_AGENT (optional)
 *
 * No default model is hardcoded - OpenCode uses its own configured defaults.
 */
const OPENCODE_MODEL_ENV_VARS = ["AGENT_FOREMAN_OPENCODE_MODEL", "OPENCODE_MODEL"] as const;
const OPENCODE_AGENT_ENV_VARS = ["AGENT_FOREMAN_OPENCODE_AGENT", "OPENCODE_AGENT"] as const;

function firstNonEmptyEnv(names: readonly string[]): string | undefined {
  for (const name of names) {
    const v = process.env[name];
    if (v && v.trim()) return v.trim();
  }
  return undefined;
}

function defaultOpencodeAgent(): string {
  // Keep output minimal/structured for JSON-only prompts used by agent-foreman scanners.
  // Note: Upstream uses "summary", but the agent file must exist or OPENCODE_AGENT must be set.
  return firstNonEmptyEnv(OPENCODE_AGENT_ENV_VARS) ?? "summary";
}

function defaultOpencodeModel(): string | undefined {
  const configured = firstNonEmptyEnv(OPENCODE_MODEL_ENV_VARS);
  if (configured) return configured;

  // No heuristic - let OpenCode use its own default (or configured) model
  return undefined;
}

function buildOpencodeCommand(): string[] {
  const agent = defaultOpencodeAgent();
  const model = defaultOpencodeModel();

  // Base command: opencode run --format default
  const cmd = ["opencode", "run", "--format", "default", "--agent", agent];

  // Only include --model if explicitly configured via env
  if (model) cmd.push("--model", model);

  return cmd;
}

/**
 * Default AI agents configuration
 * All agents use highest permission mode for automated scanning without human intervention
 * Priority order: Claude > Codex > Gemini > OpenCode (configurable via AGENT_FOREMAN_AGENTS)
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  // Claude: --print for non-interactive, --permission-mode bypassPermissions for full access (highest priority)
  // Note: Using --permission-mode bypassPermissions instead of --dangerously-skip-permissions
  // because the latter is blocked when running as root user
  // Note: "-" at the end indicates stdin input (fixes Claude Code v2.0.67+ stdin validation issue)
  {
    name: "claude",
    command: ["claude", "--print", "--output-format", "text", "--permission-mode", "bypassPermissions", "-"],
    promptViaStdin: true,
  },
  // Codex: exec mode with full-auto approval
  {
    name: "codex",
    command: ["codex", "exec", "--skip-git-repo-check", "--full-auto", "-"],
    promptViaStdin: true,
  },
  // Gemini: non-interactive text output with auto-approve all tools (yolo mode)
  {
    name: "gemini",
    command: ["gemini", "--output-format", "text", "--yolo"],
    promptViaStdin: true,
  },
  // OpenCode: non-interactive mode via `opencode run`
  // Prompt is passed as a positional argument (NOT stdin, NOT @file).
  // Model/agent are only included if explicitly configured via env:
  // - AGENT_FOREMAN_OPENCODE_MODEL / OPENCODE_MODEL (optional)
  // - AGENT_FOREMAN_OPENCODE_AGENT / OPENCODE_AGENT (optional)
  {
    name: "opencode",
    command: buildOpencodeCommand(),
    promptViaStdin: false,
    promptViaFile: false,
    env: {
      // Auto-approve all permissions for non-interactive execution
      OPENCODE_PERMISSION: JSON.stringify({
        bash: "allow",
        edit: "allow",
        webfetch: "allow",
        doom_loop: "allow",
        external_directory: "allow",
      }),
    },
  },
];
