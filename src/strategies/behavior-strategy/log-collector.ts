/**
 * Log Collector for Behavior Strategy
 * Collects logs from various sources for behavior analysis
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import type { LogCollectionResult, LogCollectionOptions, LogSource } from "./types.js";

/**
 * Collect logs from a specified source
 *
 * @param options - Collection options
 * @returns Collection result with log content
 */
export async function collectLogs(options: LogCollectionOptions): Promise<LogCollectionResult> {
  const { source, path, maxLines, encoding = "utf-8" } = options;

  switch (source) {
    case "file":
      return collectFromFile(path, maxLines, encoding);
    case "session":
      return collectFromSession(maxLines);
    case "stdin":
      return collectFromStdin(maxLines);
    default:
      return {
        success: false,
        error: `Unknown log source: ${source}`,
        source,
      };
  }
}

/**
 * Collect logs from a file
 */
async function collectFromFile(
  path: string | undefined,
  maxLines?: number,
  encoding: BufferEncoding = "utf-8"
): Promise<LogCollectionResult> {
  if (!path) {
    return {
      success: false,
      error: "File path is required when logSource is 'file'",
      source: "file",
    };
  }

  if (!existsSync(path)) {
    return {
      success: false,
      error: `Log file not found: ${path}`,
      source: "file",
      path,
    };
  }

  try {
    let content = await readFile(path, encoding);

    // Apply line limit if specified
    if (maxLines && maxLines > 0) {
      const lines = content.split("\n");
      content = lines.slice(0, maxLines).join("\n");
    }

    const lineCount = content.split("\n").length;

    return {
      success: true,
      content,
      source: "file",
      path,
      lineCount,
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to read log file: ${(error as Error).message}`,
      source: "file",
      path,
    };
  }
}

/**
 * Collect logs from current session
 * This is a placeholder - in practice, session logs would come from
 * the agent runtime or a shared log buffer
 */
async function collectFromSession(_maxLines?: number): Promise<LogCollectionResult> {
  // In a real implementation, this would connect to the session log buffer
  // For now, return empty content (no session logs available)
  return {
    success: true,
    content: "",
    source: "session",
    lineCount: 0,
  };
}

/**
 * Collect logs from stdin
 * This is a placeholder - would be used for piped input
 */
async function collectFromStdin(_maxLines?: number): Promise<LogCollectionResult> {
  // In a real implementation, this would read from stdin
  // For now, return empty content
  return {
    success: true,
    content: "",
    source: "stdin",
    lineCount: 0,
  };
}

/**
 * Get default log path based on project context
 *
 * @param cwd - Current working directory
 * @returns Default log file path
 */
export function getDefaultLogPath(cwd: string): string {
  return `${cwd}/ai/progress.log`;
}

/**
 * Check if logs are available from a source
 *
 * @param source - Log source to check
 * @param path - File path (for file source)
 * @returns True if logs are available
 */
export function hasLogsAvailable(source: LogSource, path?: string): boolean {
  switch (source) {
    case "file":
      return path ? existsSync(path) : false;
    case "session":
      // Session logs are always "available" (may be empty)
      return true;
    case "stdin":
      // Stdin is always "available" (may be empty)
      return true;
    default:
      return false;
  }
}
