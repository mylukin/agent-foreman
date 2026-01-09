/**
 * Shared utilities for progress indicators
 */

/**
 * Check if output is a TTY (interactive terminal)
 * Also checks for plain mode requested via environment or flag
 */
export function isTTY(): boolean {
  // If plain mode is explicitly requested, return false
  if (process.env.AGENT_FOREMAN_PLAIN === "true") {
    return false;
  }

  // Common environment indicators for dumb/restricted terminals
  if (process.env.TERM === "dumb" || process.env.CI === "true" || process.env.OPENCODE === "1") {
    return false;
  }

  return process.stdout.isTTY === true && process.stdin.isTTY === true;
}

/**
 * Spinner characters for TTY output
 */
export const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
