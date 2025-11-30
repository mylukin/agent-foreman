/**
 * Progress log operations for ai/progress.log
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ProgressLogEntry, ProgressLogType, FeatureStatus } from "./types.js";

/** Default path for progress log file */
export const PROGRESS_LOG_PATH = "ai/progress.log";

/**
 * Format a progress log entry as a single line
 */
export function formatLogEntry(entry: ProgressLogEntry): string {
  const parts = [entry.type, entry.timestamp];

  if (entry.goal) parts.push(`goal="${escapeQuotes(entry.goal)}"`);
  if (entry.feature) parts.push(`feature=${entry.feature}`);
  if (entry.status) parts.push(`status=${entry.status}`);
  if (entry.action) parts.push(`action=${entry.action}`);
  if (entry.reason) parts.push(`reason="${escapeQuotes(entry.reason)}"`);
  if (entry.tests) parts.push(`tests="${escapeQuotes(entry.tests)}"`);
  if (entry.note) parts.push(`note="${escapeQuotes(entry.note)}"`);

  parts.push(`summary="${escapeQuotes(entry.summary)}"`);

  return parts.join(" ");
}

/**
 * Escape double quotes in strings
 */
function escapeQuotes(str: string): string {
  return str.replace(/"/g, '\\"');
}

/**
 * Unescape double quotes in strings
 */
function unescapeQuotes(str: string): string {
  return str.replace(/\\"/g, '"');
}

/**
 * Parse a progress log entry from a line
 */
export function parseLogEntry(line: string): ProgressLogEntry | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  // Match type and timestamp at the beginning
  const match = trimmed.match(/^(INIT|STEP|CHANGE|REPLAN|VERIFY)\s+(\S+)/);
  if (!match) return null;

  const type = match[1] as ProgressLogType;
  const timestamp = match[2];

  // Extract quoted fields
  const extractQuotedField = (name: string): string | undefined => {
    const fieldMatch = trimmed.match(new RegExp(`${name}="((?:[^"\\\\]|\\\\.)*)"`));
    return fieldMatch ? unescapeQuotes(fieldMatch[1]) : undefined;
  };

  // Extract simple fields (no quotes)
  const extractSimpleField = (name: string): string | undefined => {
    const fieldMatch = trimmed.match(new RegExp(`${name}=([^\\s"]+)`));
    return fieldMatch ? fieldMatch[1] : undefined;
  };

  return {
    type,
    timestamp,
    goal: extractQuotedField("goal"),
    feature: extractSimpleField("feature"),
    status: extractSimpleField("status") as FeatureStatus | undefined,
    action: extractSimpleField("action"),
    reason: extractQuotedField("reason"),
    tests: extractQuotedField("tests"),
    note: extractQuotedField("note"),
    summary: extractQuotedField("summary") || "",
  };
}

/**
 * Append an entry to the progress log
 */
export async function appendProgressLog(
  basePath: string,
  entry: ProgressLogEntry
): Promise<void> {
  const filePath = path.join(basePath, PROGRESS_LOG_PATH);
  await fs.mkdir(path.dirname(filePath), { recursive: true });

  const line = formatLogEntry(entry) + "\n\n";
  await fs.appendFile(filePath, line);
}

/**
 * Read all entries from the progress log
 */
export async function readProgressLog(basePath: string): Promise<ProgressLogEntry[]> {
  const filePath = path.join(basePath, PROGRESS_LOG_PATH);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const lines = content.split("\n").filter((l) => l.trim());
    return lines.map(parseLogEntry).filter((e): e is ProgressLogEntry => e !== null);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw err;
  }
}

/**
 * Check if progress log exists
 */
export async function progressLogExists(basePath: string): Promise<boolean> {
  const filePath = path.join(basePath, PROGRESS_LOG_PATH);
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the most recent entries from the log
 */
export async function getRecentEntries(
  basePath: string,
  count: number = 5
): Promise<ProgressLogEntry[]> {
  const entries = await readProgressLog(basePath);
  return entries.slice(-count);
}

// ============================================================================
// Entry Creators
// ============================================================================

/**
 * Create an INIT entry
 */
export function createInitEntry(goal: string, note: string): ProgressLogEntry {
  return {
    type: "INIT",
    timestamp: new Date().toISOString(),
    goal,
    note,
    summary: "Created long-task harness",
  };
}

/**
 * Create a STEP entry for feature work
 */
export function createStepEntry(
  featureId: string,
  status: FeatureStatus,
  tests: string,
  summary: string
): ProgressLogEntry {
  return {
    type: "STEP",
    timestamp: new Date().toISOString(),
    feature: featureId,
    status,
    tests,
    summary,
  };
}

/**
 * Create a CHANGE entry for feature modification
 */
export function createChangeEntry(
  featureId: string,
  action: string,
  reason: string
): ProgressLogEntry {
  return {
    type: "CHANGE",
    timestamp: new Date().toISOString(),
    feature: featureId,
    action,
    reason,
    summary: `${action} on ${featureId}`,
  };
}

/**
 * Create a REPLAN entry for major replanning
 */
export function createReplanEntry(summary: string, note: string): ProgressLogEntry {
  return {
    type: "REPLAN",
    timestamp: new Date().toISOString(),
    note,
    summary,
  };
}

/**
 * Create a VERIFY entry for feature verification
 */
export function createVerifyEntry(
  featureId: string,
  verdict: string,
  summary: string
): ProgressLogEntry {
  return {
    type: "VERIFY",
    timestamp: new Date().toISOString(),
    feature: featureId,
    action: verdict,
    summary,
  };
}

/**
 * Format entries as human-readable text
 */
export function formatEntriesForDisplay(entries: ProgressLogEntry[]): string {
  return entries
    .map((e) => {
      const parts = [`[${e.type}] ${e.timestamp}`];
      if (e.feature) parts.push(`Feature: ${e.feature}`);
      if (e.status) parts.push(`Status: ${e.status}`);
      parts.push(`Summary: ${e.summary}`);
      return parts.join("\n  ");
    })
    .join("\n\n");
}
