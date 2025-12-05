/**
 * Git operations for verification
 */

import { exec } from "node:child_process";
import { promisify } from "node:util";

const execAsync = promisify(exec);

/**
 * Get git diff and changed files for verification
 */
export async function getGitDiffForFeature(
  cwd: string
): Promise<{ diff: string; files: string[]; commitHash: string }> {
  try {
    // Get current commit hash
    const { stdout: commitHash } = await execAsync("git rev-parse HEAD", {
      cwd,
    });

    // Get diff of uncommitted changes + last commit
    // This captures both staged and unstaged changes
    const { stdout: diffOutput } = await execAsync(
      "git diff HEAD~1 HEAD && git diff HEAD",
      { cwd, maxBuffer: 10 * 1024 * 1024 }
    );

    // Get list of changed files
    const { stdout: filesOutput } = await execAsync(
      "git diff HEAD~1 HEAD --name-only && git diff HEAD --name-only",
      { cwd }
    );

    const files = [
      ...new Set(
        filesOutput
          .trim()
          .split("\n")
          .filter((f) => f.length > 0)
      ),
    ];

    return {
      diff: diffOutput || "No changes detected",
      files,
      commitHash: commitHash.trim(),
    };
  } catch (error) {
    // Fallback: just get uncommitted changes
    try {
      const { stdout: diffOutput } = await execAsync("git diff HEAD", {
        cwd,
        maxBuffer: 10 * 1024 * 1024,
      });
      const { stdout: filesOutput } = await execAsync(
        "git diff HEAD --name-only",
        { cwd }
      );
      const { stdout: commitHash } = await execAsync("git rev-parse HEAD", {
        cwd,
      });

      const files = filesOutput
        .trim()
        .split("\n")
        .filter((f) => f.length > 0);

      return {
        diff: diffOutput || "No changes detected",
        files,
        commitHash: commitHash.trim(),
      };
    } catch {
      return {
        diff: "Unable to get git diff",
        files: [],
        commitHash: "unknown",
      };
    }
  }
}

/**
 * Get current git commit hash
 */
export async function getGitCommitHash(cwd: string): Promise<string> {
  try {
    const { stdout } = await execAsync("git rev-parse HEAD", { cwd });
    return stdout.trim();
  } catch {
    return "unknown";
  }
}
