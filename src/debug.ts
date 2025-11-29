/**
 * Debug logging utility
 * Supports DEBUG environment variable for conditional logging
 *
 * Usage:
 *   DEBUG=agent-foreman:* agent-foreman step  # Enable all debug logs
 *   DEBUG=agent-foreman:cache agent-foreman step  # Enable only cache logs
 *   DEBUG=agent-foreman:scanner,agent-foreman:detector agent-foreman step  # Multiple namespaces
 */

type DebugNamespace =
  | "scanner"
  | "detector"
  | "cache"
  | "discovery"
  | "verifier"
  | "agents"
  | "git"
  | "progress"
  | "feature"
  | "init";

/**
 * Check if a namespace is enabled for debugging
 */
function isEnabled(namespace: DebugNamespace): boolean {
  const debugEnv = process.env.DEBUG || "";

  if (!debugEnv) {
    return false;
  }

  const patterns = debugEnv.split(",").map((p) => p.trim());

  for (const pattern of patterns) {
    // Match agent-foreman:* for all namespaces
    if (pattern === "agent-foreman:*" || pattern === "*") {
      return true;
    }

    // Match specific namespace
    if (pattern === `agent-foreman:${namespace}`) {
      return true;
    }
  }

  return false;
}

/**
 * Create a debug logger for a specific namespace
 *
 * @example
 * const debug = createDebug('scanner');
 * debug('Scanning directory %s', cwd);
 * debug.error('Failed to read file', error);
 */
export function createDebug(namespace: DebugNamespace) {
  const prefix = `[agent-foreman:${namespace}]`;

  const debug = (message: string, ...args: unknown[]) => {
    if (isEnabled(namespace)) {
      const timestamp = new Date().toISOString();
      console.error(`${timestamp} ${prefix} ${message}`, ...args);
    }
  };

  /**
   * Log an error with stack trace
   * Always logs to stderr, but only includes stack trace when DEBUG is enabled
   */
  debug.error = (message: string, error?: unknown) => {
    if (isEnabled(namespace)) {
      const timestamp = new Date().toISOString();
      console.error(`${timestamp} ${prefix} ERROR: ${message}`);
      if (error instanceof Error) {
        console.error(`${timestamp} ${prefix}   ${error.message}`);
        if (error.stack) {
          console.error(`${timestamp} ${prefix}   ${error.stack}`);
        }
      } else if (error !== undefined) {
        console.error(`${timestamp} ${prefix}   ${String(error)}`);
      }
    }
  };

  /**
   * Log a warning
   */
  debug.warn = (message: string, ...args: unknown[]) => {
    if (isEnabled(namespace)) {
      const timestamp = new Date().toISOString();
      console.error(`${timestamp} ${prefix} WARN: ${message}`, ...args);
    }
  };

  return debug;
}

// Pre-created loggers for common namespaces
export const debugScanner = createDebug("scanner");
export const debugDetector = createDebug("detector");
export const debugCache = createDebug("cache");
export const debugDiscovery = createDebug("discovery");
export const debugVerifier = createDebug("verifier");
export const debugAgents = createDebug("agents");
export const debugGit = createDebug("git");
export const debugProgress = createDebug("progress");
export const debugFeature = createDebug("feature");
export const debugInit = createDebug("init");
