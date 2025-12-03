/**
 * Centralized timeout configuration for AI agent operations
 * Supports customization via environment variables and .env files
 */
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Default timeout values in milliseconds
 *
 * IMPORTANT: Most operations use `undefined` (no timeout) to ensure completion.
 * AI agents can take unpredictable time depending on:
 * - Project size and complexity
 * - AI model response time
 * - Network conditions
 *
 * Only bounded operations (document merging) have timeouts.
 * Users can override via environment variables if needed.
 */
export const DEFAULT_TIMEOUTS: Record<string, number | undefined> = {
  /**
   * Project survey/scan operation - AI explores entire codebase
   * No timeout: Must complete - critical initialization operation.
   * Large monorepos may take 15+ minutes.
   */
  AI_SCAN_PROJECT: undefined, // No timeout - wait for completion

  /**
   * Generate features from existing analyze document
   * No timeout: Same critical path as SCAN, must complete.
   */
  AI_GENERATE_FROM_ANALYZE: undefined, // No timeout - wait for completion

  /**
   * Generate features from goal description for empty projects
   * No timeout: Same critical path as SCAN, must complete.
   */
  AI_GENERATE_FROM_GOAL: undefined, // No timeout - wait for completion

  /**
   * Merge init.sh script with AI
   * Bounded operation: Script merging has predictable scope.
   */
  AI_MERGE_INIT_SCRIPT: 300000, // 5 minutes

  /**
   * Merge CLAUDE.md with AI
   * Bounded operation: Document merging has predictable scope.
   */
  AI_MERGE_CLAUDE_MD: 300000, // 5 minutes

  /**
   * AI verification of feature completion
   * No timeout: Includes running tests/builds which can take very long.
   */
  AI_VERIFICATION: undefined, // No timeout - wait for completion

  /**
   * AI capability discovery
   * No timeout: Must complete for correct project detection.
   */
  AI_CAPABILITY_DISCOVERY: undefined, // No timeout - wait for completion

  /**
   * Default timeout for any AI agent call
   * No timeout: Safe fallback - let operations complete.
   */
  AI_DEFAULT: undefined, // No timeout - wait for completion
};

/**
 * Environment variable names for timeout configuration
 */
export const TIMEOUT_ENV_VARS = {
  AI_SCAN_PROJECT: "AGENT_FOREMAN_TIMEOUT_SCAN",
  AI_GENERATE_FROM_ANALYZE: "AGENT_FOREMAN_TIMEOUT_ANALYZE",
  AI_GENERATE_FROM_GOAL: "AGENT_FOREMAN_TIMEOUT_GOAL",
  AI_MERGE_INIT_SCRIPT: "AGENT_FOREMAN_TIMEOUT_MERGE_INIT",
  AI_MERGE_CLAUDE_MD: "AGENT_FOREMAN_TIMEOUT_MERGE_CLAUDE",
  AI_VERIFICATION: "AGENT_FOREMAN_TIMEOUT_VERIFY",
  AI_CAPABILITY_DISCOVERY: "AGENT_FOREMAN_TIMEOUT_CAPABILITY",
  AI_DEFAULT: "AGENT_FOREMAN_TIMEOUT_DEFAULT",
} as const;

export type TimeoutKey = keyof typeof TIMEOUT_ENV_VARS;

/**
 * Environment variable name for agent configuration
 */
export const AGENT_ENV_VAR = "AGENT_FOREMAN_AGENTS";

/**
 * Default agent priority order
 * First agent has highest priority, agents are tried in order until one succeeds
 */
export const DEFAULT_AGENT_PRIORITY = ["codex", "gemini", "claude"] as const;

/**
 * Valid agent names that can be configured
 */
export const VALID_AGENT_NAMES = ["claude", "gemini", "codex"] as const;
export type ValidAgentName = (typeof VALID_AGENT_NAMES)[number];

/**
 * Load .env file if it exists (simple implementation without external dependencies)
 */
function loadEnvFile(): void {
  // Try current directory first, then home directory
  const envPaths = [
    path.join(process.cwd(), ".env"),
    path.join(process.env.HOME || "", ".agent-foreman.env"),
  ];

  for (const envPath of envPaths) {
    try {
      const content = fs.readFileSync(envPath, "utf-8");
      const lines = content.split("\n");

      for (const line of lines) {
        const trimmed = line.trim();
        // Skip comments and empty lines
        if (!trimmed || trimmed.startsWith("#")) continue;

        const match = trimmed.match(/^([^=]+)=(.*)$/);
        if (match) {
          const key = match[1].trim();
          let value = match[2].trim();
          // Remove surrounding quotes if present
          if ((value.startsWith('"') && value.endsWith('"')) ||
              (value.startsWith("'") && value.endsWith("'"))) {
            value = value.slice(1, -1);
          }
          // Only set if not already set in environment
          if (!process.env[key]) {
            process.env[key] = value;
          }
        }
      }
    } catch {
      // File doesn't exist or can't be read, continue
    }
  }
}

// Load .env file on module initialization
let envLoaded = false;

/**
 * Get timeout value for a specific operation
 * Priority: environment variable > default value
 *
 * @param key - The timeout key (e.g., "AI_SCAN_PROJECT")
 * @returns Timeout in milliseconds, or undefined for no timeout (wait indefinitely)
 */
export function getTimeout(key: TimeoutKey): number | undefined {
  // Load .env file once
  if (!envLoaded) {
    loadEnvFile();
    envLoaded = true;
  }

  const envVar = TIMEOUT_ENV_VARS[key];
  const envValue = process.env[envVar];

  if (envValue) {
    const parsed = parseInt(envValue, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  // Return the default (which may be undefined for no timeout)
  return DEFAULT_TIMEOUTS[key];
}

/**
 * Get all current timeout configurations
 * Useful for debugging and status display
 */
export function getAllTimeouts(): Record<TimeoutKey, { value: number | undefined; source: "env" | "default" }> {
  if (!envLoaded) {
    loadEnvFile();
    envLoaded = true;
  }

  const result: Record<string, { value: number | undefined; source: "env" | "default" }> = {};

  for (const key of Object.keys(TIMEOUT_ENV_VARS) as TimeoutKey[]) {
    const envVar = TIMEOUT_ENV_VARS[key];
    const envValue = process.env[envVar];

    if (envValue) {
      const parsed = parseInt(envValue, 10);
      if (!isNaN(parsed) && parsed > 0) {
        result[key] = { value: parsed, source: "env" };
        continue;
      }
    }

    result[key] = { value: DEFAULT_TIMEOUTS[key], source: "default" };
  }

  return result as Record<TimeoutKey, { value: number | undefined; source: "env" | "default" }>;
}

/**
 * Format timeout value for display (e.g., "5m", "2m 30s", "∞")
 */
export function formatTimeout(ms: number | undefined): string {
  if (ms === undefined) {
    return "∞"; // No timeout - wait indefinitely
  }

  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;

  if (minutes === 0) {
    return `${seconds}s`;
  } else if (remainingSeconds === 0) {
    return `${minutes}m`;
  } else {
    return `${minutes}m ${remainingSeconds}s`;
  }
}

/**
 * Get configured agent priority order
 *
 * Reads from AGENT_FOREMAN_AGENTS environment variable (comma-separated).
 * The order in the list determines priority (first = highest).
 * Only agents in the list are enabled/used.
 *
 * @returns Array of agent names in priority order
 *
 * @example
 * // With AGENT_FOREMAN_AGENTS=claude,gemini
 * getAgentPriority() // returns ["claude", "gemini"]
 *
 * // With no env var set
 * getAgentPriority() // returns ["codex", "gemini", "claude"]
 */
export function getAgentPriority(): string[] {
  // Load .env file once
  if (!envLoaded) {
    loadEnvFile();
    envLoaded = true;
  }

  const envValue = process.env[AGENT_ENV_VAR];

  if (!envValue || envValue.trim() === "") {
    return [...DEFAULT_AGENT_PRIORITY];
  }

  // Parse comma-separated list
  const configuredAgents = envValue
    .split(",")
    .map((name) => name.trim().toLowerCase())
    .filter((name) => name !== "");

  // Validate and filter agent names
  const validAgents: string[] = [];
  const invalidAgents: string[] = [];

  for (const name of configuredAgents) {
    if ((VALID_AGENT_NAMES as readonly string[]).includes(name)) {
      // Avoid duplicates
      if (!validAgents.includes(name)) {
        validAgents.push(name);
      }
    } else {
      invalidAgents.push(name);
    }
  }

  // Log warning for invalid agent names
  if (invalidAgents.length > 0) {
    console.warn(
      `[agent-foreman] Warning: Invalid agent names in ${AGENT_ENV_VAR}: ${invalidAgents.join(", ")}. ` +
        `Valid names are: ${VALID_AGENT_NAMES.join(", ")}`
    );
  }

  // Fall back to default if no valid agents configured
  if (validAgents.length === 0) {
    console.warn(
      `[agent-foreman] Warning: No valid agents in ${AGENT_ENV_VAR}, using defaults: ${DEFAULT_AGENT_PRIORITY.join(", ")}`
    );
    return [...DEFAULT_AGENT_PRIORITY];
  }

  return validAgents;
}
