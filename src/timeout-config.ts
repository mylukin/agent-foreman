/**
 * Centralized timeout configuration for AI agent operations
 * Supports customization via environment variables and .env files
 */
import * as fs from "node:fs";
import * as path from "node:path";

/**
 * Default timeout values in milliseconds
 *
 * These defaults are designed to cover 95%+ of projects:
 * - Small projects (< 10k LOC): typically complete in seconds
 * - Medium projects (10k-100k LOC): typically complete in 1-3 minutes
 * - Large projects (100k+ LOC, monorepos): may need up to 10 minutes
 *
 * Users can customize via environment variables if needed.
 */
export const DEFAULT_TIMEOUTS = {
  /**
   * Project survey/scan operation - AI explores entire codebase
   * This is the most intensive operation, exploring all source files.
   * Large monorepos may need the full 10 minutes.
   */
  AI_SCAN_PROJECT: 600000, // 10 minutes

  /**
   * Generate features from existing survey document
   * Text-to-JSON conversion, typically fast (< 1 min)
   */
  AI_GENERATE_FROM_SURVEY: 180000, // 3 minutes

  /**
   * Generate features from goal description for empty projects
   * Text-to-JSON conversion, typically fast (< 1 min)
   */
  AI_GENERATE_FROM_GOAL: 180000, // 3 minutes

  /**
   * Merge init.sh script with AI
   * Simple text merge, very fast
   */
  AI_MERGE_INIT_SCRIPT: 120000, // 2 minutes

  /**
   * Merge CLAUDE.md with AI
   * Simple text merge, very fast
   */
  AI_MERGE_CLAUDE_MD: 120000, // 2 minutes

  /**
   * AI verification of feature completion
   * Includes running tests/builds + AI analysis
   * May take longer for projects with slow test suites
   */
  AI_VERIFICATION: 300000, // 5 minutes

  /**
   * AI capability discovery
   * Analyzes project structure to detect test/build commands
   */
  AI_CAPABILITY_DISCOVERY: 120000, // 2 minutes

  /**
   * Default timeout for any AI agent call
   * Used as fallback when no specific timeout is configured
   */
  AI_DEFAULT: 300000, // 5 minutes
} as const;

/**
 * Environment variable names for timeout configuration
 */
export const TIMEOUT_ENV_VARS = {
  AI_SCAN_PROJECT: "AGENT_FOREMAN_TIMEOUT_SCAN",
  AI_GENERATE_FROM_SURVEY: "AGENT_FOREMAN_TIMEOUT_SURVEY",
  AI_GENERATE_FROM_GOAL: "AGENT_FOREMAN_TIMEOUT_GOAL",
  AI_MERGE_INIT_SCRIPT: "AGENT_FOREMAN_TIMEOUT_MERGE_INIT",
  AI_MERGE_CLAUDE_MD: "AGENT_FOREMAN_TIMEOUT_MERGE_CLAUDE",
  AI_VERIFICATION: "AGENT_FOREMAN_TIMEOUT_VERIFY",
  AI_CAPABILITY_DISCOVERY: "AGENT_FOREMAN_TIMEOUT_CAPABILITY",
  AI_DEFAULT: "AGENT_FOREMAN_TIMEOUT_DEFAULT",
} as const;

export type TimeoutKey = keyof typeof DEFAULT_TIMEOUTS;

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
 * @returns Timeout in milliseconds
 */
export function getTimeout(key: TimeoutKey): number {
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

  // Check for global default override
  const globalDefault = process.env[TIMEOUT_ENV_VARS.AI_DEFAULT];
  if (globalDefault && key !== "AI_DEFAULT") {
    const parsed = parseInt(globalDefault, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }

  return DEFAULT_TIMEOUTS[key];
}

/**
 * Get all current timeout configurations
 * Useful for debugging and status display
 */
export function getAllTimeouts(): Record<TimeoutKey, { value: number; source: "env" | "default" }> {
  if (!envLoaded) {
    loadEnvFile();
    envLoaded = true;
  }

  const result: Record<string, { value: number; source: "env" | "default" }> = {};

  for (const key of Object.keys(DEFAULT_TIMEOUTS) as TimeoutKey[]) {
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

  return result as Record<TimeoutKey, { value: number; source: "env" | "default" }>;
}

/**
 * Format timeout value for display (e.g., "5m", "2m 30s")
 */
export function formatTimeout(ms: number): string {
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
