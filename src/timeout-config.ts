/**
 * Centralized timeout configuration for AI agent operations
 * Supports customization via environment variables and .env files
 */

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
 * Load .env file if it exists (simple implementation without external dependencies)
 */
function loadEnvFile(): void {
  try {
    const fs = require("node:fs");
    const path = require("node:path");

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
  } catch {
    // Module loading failed, skip .env loading
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
