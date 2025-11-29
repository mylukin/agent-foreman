/**
 * Shared file utilities
 * Provides common file operations with proper error handling and security
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";

/**
 * Check if a target path is within the base directory
 * Prevents path traversal attacks by ensuring resolved paths stay within bounds
 *
 * @param basePath - The base directory path (must be absolute)
 * @param targetPath - The target path to validate (can be relative or absolute)
 * @returns true if targetPath is within basePath, false otherwise
 *
 * @example
 * isPathWithinRoot('/project', '/project/src/file.ts') // true
 * isPathWithinRoot('/project', '/project/../etc/passwd') // false
 * isPathWithinRoot('/project', 'src/file.ts') // true (relative to cwd)
 */
export function isPathWithinRoot(basePath: string, targetPath: string): boolean {
  // Resolve both paths to absolute paths
  const resolvedBase = path.resolve(basePath);
  const resolvedTarget = path.resolve(basePath, targetPath);

  // Normalize paths to handle different separators and resolve ..
  const normalizedBase = path.normalize(resolvedBase);
  const normalizedTarget = path.normalize(resolvedTarget);

  // Check if target starts with base path
  // Add separator to prevent /project matching /project2
  return (
    normalizedTarget === normalizedBase ||
    normalizedTarget.startsWith(normalizedBase + path.sep)
  );
}

/**
 * Safely join paths and validate the result stays within the base directory
 *
 * @param basePath - The base directory path
 * @param relativePath - The relative path to join
 * @returns The joined path if safe, null if it escapes the base directory
 */
export function safeJoinPath(
  basePath: string,
  relativePath: string
): string | null {
  const joined = path.join(basePath, relativePath);

  if (!isPathWithinRoot(basePath, joined)) {
    return null;
  }

  return joined;
}

/**
 * Check if a file exists
 *
 * @param filePath - Path to check
 * @returns true if file exists, false otherwise
 */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Safely read a file with path validation
 *
 * @param basePath - The base directory (project root)
 * @param relativePath - The relative file path
 * @returns File content or null if path is invalid or file doesn't exist
 */
export async function safeReadFile(
  basePath: string,
  relativePath: string
): Promise<string | null> {
  const safePath = safeJoinPath(basePath, relativePath);

  if (!safePath) {
    return null; // Path traversal attempt
  }

  try {
    return await fs.readFile(safePath, "utf-8");
  } catch {
    return null; // File doesn't exist or can't be read
  }
}

/**
 * Find files matching patterns in a directory
 *
 * @param cwd - Current working directory
 * @param patterns - File patterns to match
 * @returns Array of matching file paths (relative to cwd)
 */
export async function findFiles(
  cwd: string,
  patterns: string[]
): Promise<string[]> {
  const found: string[] = [];

  for (const pattern of patterns) {
    const filePath = path.join(cwd, pattern);
    try {
      await fs.access(filePath);
      found.push(pattern);
    } catch {
      // File doesn't exist, skip
    }
  }

  return found;
}

/**
 * Read file with proper error handling
 * Returns null instead of throwing on errors
 *
 * @param filePath - Absolute path to the file
 * @returns File content or null on error
 */
export async function readFileOrNull(filePath: string): Promise<string | null> {
  try {
    return await fs.readFile(filePath, "utf-8");
  } catch {
    return null;
  }
}

/**
 * Check if a path is a directory
 *
 * @param dirPath - Path to check
 * @returns true if path is a directory, false otherwise
 */
export async function isDirectory(dirPath: string): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    return stat.isDirectory();
  } catch {
    return false;
  }
}
