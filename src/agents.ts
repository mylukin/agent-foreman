/**
 * AI Agent subprocess management
 * Spawns Claude, Gemini, or Codex CLI tools for intelligent analysis
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import chalk from "chalk";

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
 */
export const DEFAULT_AGENTS: AgentConfig[] = [
  // Claude: --print for non-interactive, --dangerously-skip-permissions for full access
  {
    name: "claude",
    command: ["claude", "--print", "--output-format", "text", "--dangerously-skip-permissions"],
    promptViaStdin: true,
  },
  // Gemini: non-interactive text output with auto-approve all tools (yolo mode)
  {
    name: "gemini",
    command: ["gemini", "--output-format", "text", "--yolo"],
    promptViaStdin: true,
  },
  // Codex: exec mode with full-auto approval
  {
    name: "codex",
    command: ["codex", "exec", "--skip-git-repo-check", "--full-auto", "-"],
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
 */
export function getAvailableAgent(preferredOrder: string[] = ["codex", "gemini", "claude"]): AgentConfig | null {
  for (const name of preferredOrder) {
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
  const { timeoutMs = 120000, maxRetries = 2, verbose = false, cwd } = options;

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
 * Default priority: Codex > Gemini > Claude
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
  const { preferredOrder = ["codex", "gemini", "claude"], timeoutMs, verbose = false, cwd } = options;

  for (const name of preferredOrder) {
    const agent = DEFAULT_AGENTS.find((a) => a.name === name);
    if (!agent) continue;

    if (!commandExists(agent.command[0])) {
      if (verbose) {
        console.log(chalk.gray(`        ${name} not installed, skipping...`));
      }
      continue;
    }

    // Show which agent we're using
    process.stdout.write(chalk.blue(`        Using ${name}... `));
    const startTime = Date.now();

    // Show a spinner while waiting
    const spinner = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
    let spinnerIdx = 0;
    const spinnerInterval = setInterval(() => {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
      process.stdout.write(`\r        Using ${name}... ${chalk.cyan(spinner[spinnerIdx])} ${chalk.gray(`(${elapsed}s)`)}`);
      spinnerIdx = (spinnerIdx + 1) % spinner.length;
    }, 100);

    const result = await callAgent(agent, prompt, { timeoutMs, cwd });

    clearInterval(spinnerInterval);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    if (result.success) {
      console.log(`\r        Using ${name}... ${chalk.green("✓")} ${chalk.gray(`(${elapsed}s)`)}`);
      return { ...result, agentUsed: name };
    }

    console.log(`\r        Using ${name}... ${chalk.red("✗")} ${chalk.gray(`(${elapsed}s)`)}`);
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
