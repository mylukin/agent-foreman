/**
 * AI Agent subprocess management
 * Spawns Claude, Gemini, or Codex CLI tools for intelligent analysis
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import chalk from "chalk";
import { isTTY } from "./progress.js";
import { getTimeout, getAgentPriority } from "./timeout-config.js";

/**
 * Agent configuration
 */
export interface AgentConfig {
  name: string;
  command: string[];
  promptViaStdin?: boolean;
}

/**
 * Agent execution state
 */
export interface AgentState {
  config: AgentConfig;
  status: "pending" | "running" | "completed" | "error" | "killed" | "timeout";
  stdout: string[];
  stderr: string[];
  startTime?: number;
  endTime?: number;
  exitCode?: number | null;
  errorMessage?: string;
  process?: ChildProcess;
  timeoutHandle?: NodeJS.Timeout;
}

/**
 * Default AI agents configuration
 * All agents use highest permission mode for automated scanning without human intervention
 * Priority order: Claude > Codex > Gemini (configurable via AGENT_FOREMAN_AGENTS env var)
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
];

/**
 * Detect the current platform
 */
export function getPlatform(): "windows" | "unix" {
  return process.platform === "win32" ? "windows" : "unix";
}

/**
 * Check if a command exists in PATH (cross-platform)
 * Uses 'where' on Windows and 'which' on Unix-like systems
 */
export function commandExists(cmd: string): boolean {
  const isWindows = getPlatform() === "windows";
  const checkCmd = isWindows ? "where" : "which";
  const result = spawnSync(checkCmd, [cmd], { stdio: "pipe", shell: isWindows });
  return result.status === 0;
}

/**
 * Get the first available AI agent
 * Uses AGENT_FOREMAN_AGENTS env var for priority order if set
 */
export function getAvailableAgent(preferredOrder?: string[]): AgentConfig | null {
  const order = preferredOrder ?? getAgentPriority();
  for (const name of order) {
    const agent = DEFAULT_AGENTS.find((a) => a.name === name);
    if (agent && commandExists(agent.command[0])) {
      return agent;
    }
  }
  return null;
}

/**
 * Filter agents to only include those with available commands
 */
export function filterAvailableAgents(agents: AgentConfig[]): {
  available: AgentConfig[];
  unavailable: Array<{ name: string; command: string }>;
} {
  const available: AgentConfig[] = [];
  const unavailable: Array<{ name: string; command: string }> = [];

  for (const agent of agents) {
    const cmd = agent.command[0];
    if (commandExists(cmd)) {
      available.push(agent);
    } else {
      unavailable.push({ name: agent.name, command: cmd });
    }
  }

  return { available, unavailable };
}

/**
 * Options for calling an AI agent
 */
export interface CallAgentOptions {
  timeoutMs?: number;
  cwd?: string; // Working directory for the agent
}

/**
 * Call an AI agent with a prompt
 */
export async function callAgent(
  config: AgentConfig,
  prompt: string,
  options: CallAgentOptions = {}
): Promise<{ success: boolean; output: string; error?: string }> {
  const { timeoutMs, cwd } = options;

  const state: AgentState = {
    config,
    status: "pending",
    stdout: [],
    stderr: [],
  };

  const useStdin = config.promptViaStdin !== false;
  state.startTime = Date.now();
  state.status = "running";

  let child: ChildProcess;
  try {
    child = useStdin
      ? spawn(config.command[0], config.command.slice(1), {
          stdio: ["pipe", "pipe", "pipe"],
          cwd,
        })
      : spawn(config.command[0], [...config.command.slice(1), prompt], {
          stdio: ["ignore", "pipe", "pipe"],
          cwd,
        });
  } catch (err) {
    return {
      success: false,
      output: "",
      error: err instanceof Error ? err.message : String(err),
    };
  }

  state.process = child;

  if (useStdin && child.stdin) {
    child.stdin.write(prompt);
    child.stdin.end();
  }

  child.stdout?.on("data", (chunk) => {
    state.stdout.push(chunk.toString());
  });

  child.stderr?.on("data", (chunk) => {
    state.stderr.push(chunk.toString());
  });

  const completion = new Promise<AgentState>((resolve) => {
    child.on("close", (code) => {
      state.exitCode = code;
      state.endTime = Date.now();
      if (state.status === "killed" || state.status === "timeout") {
        return resolve(state);
      }
      state.status = code === 0 ? "completed" : "error";
      resolve(state);
    });

    child.on("error", (err) => {
      state.endTime = Date.now();
      state.status = "error";
      state.errorMessage = err instanceof Error ? err.message : String(err);
      resolve(state);
    });
  });

  // Set timeout if specified
  if (timeoutMs && timeoutMs > 0) {
    state.timeoutHandle = setTimeout(() => {
      if (state.process && state.status === "running") {
        state.status = "timeout";
        state.endTime = Date.now();
        state.process.kill("SIGTERM");
      }
    }, timeoutMs);
  }

  const result = await completion;
  if (state.timeoutHandle) clearTimeout(state.timeoutHandle);

  const output = result.stdout.join("");
  const errorOutput = result.stderr.join("");

  if (result.status === "completed") {
    return { success: true, output };
  } else if (result.status === "timeout") {
    return { success: false, output, error: "Agent timed out" };
  } else {
    return {
      success: false,
      output,
      error: result.errorMessage || errorOutput || "Unknown error",
    };
  }
}

/**
 * Call AI agent with retry logic
 */
export async function callAgentWithRetry(
  config: AgentConfig,
  prompt: string,
  options: {
    timeoutMs?: number;
    maxRetries?: number;
    verbose?: boolean;
    cwd?: string;
  } = {}
): Promise<{ success: boolean; output: string; error?: string }> {
  const { timeoutMs = getTimeout("AI_DEFAULT"), maxRetries = 2, verbose = false, cwd } = options;

  let lastError: string | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    if (verbose && attempt > 1) {
      console.log(chalk.yellow(`  Retry attempt ${attempt}/${maxRetries}...`));
    }

    const result = await callAgent(config, prompt, { timeoutMs, cwd });

    if (result.success) {
      return result;
    }

    lastError = result.error;

    if (attempt < maxRetries) {
      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  return {
    success: false,
    output: "",
    error: lastError || "All retry attempts failed",
  };
}

/**
 * Try multiple agents in order until one succeeds
 * Uses AGENT_FOREMAN_AGENTS env var for priority order if set
 * Default priority: Claude > Codex > Gemini
 * No timeout by default - let the AI agent complete
 */
export async function callAnyAvailableAgent(
  prompt: string,
  options: {
    preferredOrder?: string[];
    timeoutMs?: number;
    verbose?: boolean;
    cwd?: string;
  } = {}
): Promise<{ success: boolean; output: string; agentUsed?: string; error?: string }> {
  const { preferredOrder, timeoutMs, verbose = false, cwd } = options;
  const agentOrder = preferredOrder ?? getAgentPriority();

  for (const name of agentOrder) {
    const agent = DEFAULT_AGENTS.find((a) => a.name === name);
    if (!agent) continue;

    if (!commandExists(agent.command[0])) {
      if (verbose) {
        console.log(chalk.gray(`        ${name} not installed, skipping...`));
      }
      continue;
    }

    // Show which agent we're using with animated spinner
    const startTime = Date.now();
    const spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let spinnerIdx = 0;
    let spinnerInterval: NodeJS.Timeout | null = null;

    // Only use animated spinner in TTY mode to avoid conflicts
    if (isTTY()) {
      // Print initial message without newline
      process.stdout.write(chalk.blue(`        Using ${name}...`));
      spinnerInterval = setInterval(() => {
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
        // Clear just this line and rewrite (don't use \r from column 0 to avoid parent spinner conflicts)
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
        process.stdout.write(chalk.blue(`        Using ${name}... ${chalk.cyan(spinnerFrames[spinnerIdx])} ${chalk.gray(`(${elapsed}s)`)}`));
        spinnerIdx = (spinnerIdx + 1) % spinnerFrames.length;
      }, 100);
    } else {
      console.log(`        Using ${name}...`);
    }

    const result = await callAgent(agent, prompt, { timeoutMs, cwd });

    if (spinnerInterval) {
      clearInterval(spinnerInterval);
    }
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      if (isTTY()) {
        process.stdout.clearLine(0);
        process.stdout.cursorTo(0);
      }
      console.log(`        Using ${name}... ${chalk.green("✓")} ${chalk.gray(`(${elapsed}s)`)}`);
      return { ...result, agentUsed: name };
    }

    if (isTTY()) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
    }
    console.log(`        Using ${name}... ${chalk.red("✗")} ${chalk.gray(`(${elapsed}s)`)}`);
    if (verbose) {
      console.log(chalk.yellow(`        Error: ${result.error}`));
    }
  }

  return {
    success: false,
    output: "",
    error: "No AI agents available or all failed",
  };
}

/**
 * Check which AI agents are available
 */
export function checkAvailableAgents(): { name: string; available: boolean }[] {
  return DEFAULT_AGENTS.map((agent) => ({
    name: agent.name,
    available: commandExists(agent.command[0]),
  }));
}

/**
 * Print available agents status
 */
export function printAgentStatus(): void {
  const agents = checkAvailableAgents();
  console.log(chalk.bold("AI Agents Status:"));
  for (const agent of agents) {
    const status = agent.available ? chalk.green("✓ available") : chalk.red("✗ not found");
    console.log(`  ${agent.name}: ${status}`);
  }
}

/**
 * Get formatted string of agent priority order
 * Returns format like "Claude > Codex > Gemini" with proper capitalization
 */
export function getAgentPriorityString(): string {
  const priority = getAgentPriority();
  // Capitalize first letter of each agent name
  const capitalized = priority.map((name) => name.charAt(0).toUpperCase() + name.slice(1));
  return capitalized.join(" > ");
}
