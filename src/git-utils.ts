/**
 * Git utility functions for auto-commit functionality
 */

import { spawnSync } from "node:child_process";

export interface GitResult {
  success: boolean;
  error?: string;
}

export interface GitCommitResult extends GitResult {
  commitHash?: string;
}

/**
 * Check if the directory is a git repository
 */
export function isGitRepo(cwd: string): boolean {
  const result = spawnSync("git", ["rev-parse", "--is-inside-work-tree"], {
    cwd,
    encoding: "utf-8",
  });
  return result.status === 0 && result.stdout.trim() === "true";
}

/**
 * Check if there are uncommitted changes (staged or unstaged)
 */
export function hasUncommittedChanges(cwd: string): boolean {
  // Check for staged changes
  const staged = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
    encoding: "utf-8",
  });

  // Check for unstaged changes
  const unstaged = spawnSync("git", ["diff", "--quiet"], {
    cwd,
    encoding: "utf-8",
  });

  // Check for untracked files
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    {
      cwd,
      encoding: "utf-8",
    }
  );

  // If any of these have changes, return true
  return (
    staged.status !== 0 ||
    unstaged.status !== 0 ||
    (untracked.status === 0 && untracked.stdout.trim().length > 0)
  );
}

/**
 * Get list of changed files (staged, unstaged, and untracked)
 */
export function getChangedFiles(cwd: string): string[] {
  const files: Set<string> = new Set();

  // Staged files
  const staged = spawnSync("git", ["diff", "--cached", "--name-only"], {
    cwd,
    encoding: "utf-8",
  });
  if (staged.status === 0 && staged.stdout.trim()) {
    staged.stdout
      .trim()
      .split("\n")
      .forEach((f) => files.add(f));
  }

  // Unstaged files
  const unstaged = spawnSync("git", ["diff", "--name-only"], {
    cwd,
    encoding: "utf-8",
  });
  if (unstaged.status === 0 && unstaged.stdout.trim()) {
    unstaged.stdout
      .trim()
      .split("\n")
      .forEach((f) => files.add(f));
  }

  // Untracked files
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    {
      cwd,
      encoding: "utf-8",
    }
  );
  if (untracked.status === 0 && untracked.stdout.trim()) {
    untracked.stdout
      .trim()
      .split("\n")
      .forEach((f) => files.add(f));
  }

  return Array.from(files);
}

/**
 * Stage files for commit
 * @param paths - Array of file paths or "all" to stage all changes (-A)
 */
export function gitAdd(cwd: string, paths: string[] | "all"): GitResult {
  try {
    const args = paths === "all" ? ["add", "-A"] : ["add", ...paths];

    const result = spawnSync("git", args, {
      cwd,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      return {
        success: false,
        error: result.stderr || "Failed to stage files",
      };
    }

    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Unknown error during git add",
    };
  }
}

/**
 * Create a git commit with the given message
 * @returns The commit hash on success
 */
export function gitCommit(cwd: string, message: string): GitCommitResult {
  try {
    const result = spawnSync("git", ["commit", "-m", message], {
      cwd,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      // Check if it's "nothing to commit"
      if (
        result.stdout?.includes("nothing to commit") ||
        result.stderr?.includes("nothing to commit")
      ) {
        return {
          success: false,
          error: "Nothing to commit",
        };
      }
      return {
        success: false,
        error: result.stderr || result.stdout || "Failed to create commit",
      };
    }

    // Get the commit hash
    const hashResult = spawnSync("git", ["rev-parse", "HEAD"], {
      cwd,
      encoding: "utf-8",
    });

    const commitHash =
      hashResult.status === 0 ? hashResult.stdout.trim() : undefined;

    return {
      success: true,
      commitHash,
    };
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error ? err.message : "Unknown error during git commit",
    };
  }
}

/**
 * Get the current branch name
 */
export function getCurrentBranch(cwd: string): string | null {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd,
    encoding: "utf-8",
  });

  if (result.status === 0 && result.stdout.trim()) {
    return result.stdout.trim();
  }

  return null;
}

/**
 * Check if there are staged changes ready to commit
 */
export function hasStagedChanges(cwd: string): boolean {
  const result = spawnSync("git", ["diff", "--cached", "--quiet"], {
    cwd,
    encoding: "utf-8",
  });
  return result.status !== 0;
}
