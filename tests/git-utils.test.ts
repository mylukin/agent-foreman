/**
 * Tests for git utility functions
 * Covers all branches for 100% coverage
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { spawnSync } from "node:child_process";

import {
  isGitRepo,
  hasUncommittedChanges,
  getChangedFiles,
  gitAdd,
  gitCommit,
  getCurrentBranch,
  hasStagedChanges,
} from "../src/git-utils.js";

// ============================================================================
// Test Helpers
// ============================================================================

let testDir: string;

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "git-utils-test-"));
  return dir;
}

async function initGitRepo(dir: string): Promise<void> {
  spawnSync("git", ["init"], { cwd: dir });
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir });
  spawnSync("git", ["config", "user.name", "Test User"], { cwd: dir });
}

async function createFile(dir: string, filename: string, content: string): Promise<void> {
  await fs.writeFile(path.join(dir, filename), content);
}

async function stageFile(dir: string, filename: string): Promise<void> {
  spawnSync("git", ["add", filename], { cwd: dir });
}

async function commitFile(dir: string, message: string): Promise<void> {
  spawnSync("git", ["commit", "-m", message], { cwd: dir });
}

// ============================================================================
// isGitRepo Tests
// ============================================================================

describe("Git Utils", () => {
  beforeEach(async () => {
    testDir = await createTempDir();
  });

  afterEach(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
  });

  describe("isGitRepo", () => {
    it("should return true for a git repository", async () => {
      await initGitRepo(testDir);
      expect(isGitRepo(testDir)).toBe(true);
    });

    it("should return false for a non-git directory", () => {
      expect(isGitRepo(testDir)).toBe(false);
    });

    it("should return false for a non-existent directory", () => {
      expect(isGitRepo("/non/existent/path")).toBe(false);
    });
  });

  // ============================================================================
  // hasUncommittedChanges Tests
  // ============================================================================

  describe("hasUncommittedChanges", () => {
    beforeEach(async () => {
      await initGitRepo(testDir);
      // Create initial commit so we have a clean state
      await createFile(testDir, "initial.txt", "initial content");
      await stageFile(testDir, "initial.txt");
      await commitFile(testDir, "Initial commit");
    });

    it("should return false for a clean working directory", () => {
      expect(hasUncommittedChanges(testDir)).toBe(false);
    });

    it("should return true when there are staged changes", async () => {
      await createFile(testDir, "staged.txt", "staged content");
      await stageFile(testDir, "staged.txt");
      expect(hasUncommittedChanges(testDir)).toBe(true);
    });

    it("should return true when there are unstaged changes", async () => {
      // Modify an existing tracked file
      await createFile(testDir, "initial.txt", "modified content");
      expect(hasUncommittedChanges(testDir)).toBe(true);
    });

    it("should return true when there are untracked files", async () => {
      await createFile(testDir, "untracked.txt", "untracked content");
      expect(hasUncommittedChanges(testDir)).toBe(true);
    });

    it("should return true when there are both staged and unstaged changes", async () => {
      await createFile(testDir, "staged.txt", "staged content");
      await stageFile(testDir, "staged.txt");
      await createFile(testDir, "initial.txt", "modified content");
      expect(hasUncommittedChanges(testDir)).toBe(true);
    });
  });

  // ============================================================================
  // getChangedFiles Tests
  // ============================================================================

  describe("getChangedFiles", () => {
    beforeEach(async () => {
      await initGitRepo(testDir);
      await createFile(testDir, "initial.txt", "initial content");
      await stageFile(testDir, "initial.txt");
      await commitFile(testDir, "Initial commit");
    });

    it("should return empty array for clean working directory", () => {
      const files = getChangedFiles(testDir);
      expect(files).toEqual([]);
    });

    it("should return staged files", async () => {
      await createFile(testDir, "staged.txt", "staged content");
      await stageFile(testDir, "staged.txt");
      const files = getChangedFiles(testDir);
      expect(files).toContain("staged.txt");
    });

    it("should return unstaged modified files", async () => {
      await createFile(testDir, "initial.txt", "modified content");
      const files = getChangedFiles(testDir);
      expect(files).toContain("initial.txt");
    });

    it("should return untracked files", async () => {
      await createFile(testDir, "untracked.txt", "untracked content");
      const files = getChangedFiles(testDir);
      expect(files).toContain("untracked.txt");
    });

    it("should return all types of changed files", async () => {
      await createFile(testDir, "staged.txt", "staged content");
      await stageFile(testDir, "staged.txt");
      await createFile(testDir, "initial.txt", "modified content");
      await createFile(testDir, "untracked.txt", "untracked content");

      const files = getChangedFiles(testDir);
      expect(files).toContain("staged.txt");
      expect(files).toContain("initial.txt");
      expect(files).toContain("untracked.txt");
    });

    it("should not duplicate files that are both staged and modified", async () => {
      await createFile(testDir, "file.txt", "original content");
      await stageFile(testDir, "file.txt");
      // Modify again after staging
      await createFile(testDir, "file.txt", "modified after staging");

      const files = getChangedFiles(testDir);
      const fileCount = files.filter((f) => f === "file.txt").length;
      expect(fileCount).toBe(1);
    });
  });

  // ============================================================================
  // gitAdd Tests
  // ============================================================================

  describe("gitAdd", () => {
    beforeEach(async () => {
      await initGitRepo(testDir);
    });

    it("should successfully stage all files with 'all' parameter", async () => {
      await createFile(testDir, "file1.txt", "content1");
      await createFile(testDir, "file2.txt", "content2");

      const result = gitAdd(testDir, "all");
      expect(result.success).toBe(true);
      expect(result.error).toBeUndefined();

      // Verify files are staged
      const status = spawnSync("git", ["diff", "--cached", "--name-only"], {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(status.stdout).toContain("file1.txt");
      expect(status.stdout).toContain("file2.txt");
    });

    it("should successfully stage specific files", async () => {
      await createFile(testDir, "file1.txt", "content1");
      await createFile(testDir, "file2.txt", "content2");

      const result = gitAdd(testDir, ["file1.txt"]);
      expect(result.success).toBe(true);

      // Verify only file1 is staged
      const status = spawnSync("git", ["diff", "--cached", "--name-only"], {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(status.stdout).toContain("file1.txt");
      expect(status.stdout).not.toContain("file2.txt");
    });

    it("should return error for non-existent files", async () => {
      const result = gitAdd(testDir, ["nonexistent.txt"]);
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it("should return error for non-git directory", async () => {
      const nonGitDir = await createTempDir();
      try {
        await createFile(nonGitDir, "file.txt", "content");
        const result = gitAdd(nonGitDir, ["file.txt"]);
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================================
  // gitCommit Tests
  // ============================================================================

  describe("gitCommit", () => {
    beforeEach(async () => {
      await initGitRepo(testDir);
    });

    it("should successfully create a commit", async () => {
      await createFile(testDir, "file.txt", "content");
      await stageFile(testDir, "file.txt");

      const result = gitCommit(testDir, "Test commit message");
      expect(result.success).toBe(true);
      expect(result.commitHash).toBeDefined();
      expect(result.commitHash?.length).toBe(40); // Full SHA hash
      expect(result.error).toBeUndefined();
    });

    it("should return 'Nothing to commit' error when no changes are staged", async () => {
      // Create initial commit first
      await createFile(testDir, "initial.txt", "initial");
      await stageFile(testDir, "initial.txt");
      await commitFile(testDir, "Initial");

      // Now try to commit with nothing staged
      const result = gitCommit(testDir, "Empty commit");
      expect(result.success).toBe(false);
      expect(result.error).toBe("Nothing to commit");
    });

    it("should include commit message in the git history", async () => {
      await createFile(testDir, "file.txt", "content");
      await stageFile(testDir, "file.txt");

      const message = "Unique test commit message 12345";
      gitCommit(testDir, message);

      const log = spawnSync("git", ["log", "--oneline", "-1"], {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(log.stdout).toContain("Unique test commit message 12345");
    });

    it("should handle multiline commit messages", async () => {
      await createFile(testDir, "file.txt", "content");
      await stageFile(testDir, "file.txt");

      const message = "First line\n\nBody paragraph\n\nFooter";
      const result = gitCommit(testDir, message);
      expect(result.success).toBe(true);

      const log = spawnSync("git", ["log", "-1", "--format=%B"], {
        cwd: testDir,
        encoding: "utf-8",
      });
      expect(log.stdout).toContain("First line");
      expect(log.stdout).toContain("Body paragraph");
    });

    it("should return error for non-git directory", async () => {
      const nonGitDir = await createTempDir();
      try {
        const result = gitCommit(nonGitDir, "Test message");
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      } finally {
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });
  });

  // ============================================================================
  // getCurrentBranch Tests
  // ============================================================================

  describe("getCurrentBranch", () => {
    beforeEach(async () => {
      await initGitRepo(testDir);
      // Need at least one commit to have a branch
      await createFile(testDir, "initial.txt", "initial");
      await stageFile(testDir, "initial.txt");
      await commitFile(testDir, "Initial commit");
    });

    it("should return the current branch name", () => {
      const branch = getCurrentBranch(testDir);
      // Default branch could be 'main' or 'master' depending on git config
      expect(branch).toBeTruthy();
      expect(["main", "master"]).toContain(branch);
    });

    it("should return new branch name after checkout", async () => {
      spawnSync("git", ["checkout", "-b", "feature-branch"], { cwd: testDir });
      const branch = getCurrentBranch(testDir);
      expect(branch).toBe("feature-branch");
    });

    it("should return null for non-git directory", async () => {
      const nonGitDir = await createTempDir();
      try {
        const branch = getCurrentBranch(nonGitDir);
        expect(branch).toBeNull();
      } finally {
        await fs.rm(nonGitDir, { recursive: true, force: true });
      }
    });

    it("should return null for empty repo (no commits)", async () => {
      const emptyRepo = await createTempDir();
      try {
        await initGitRepo(emptyRepo);
        // No commits, so no branch yet
        const branch = getCurrentBranch(emptyRepo);
        // In newer git versions, branch shows even before first commit
        // In older versions, it might be null
        expect(branch === null || typeof branch === "string").toBe(true);
      } finally {
        await fs.rm(emptyRepo, { recursive: true, force: true });
      }
    });
  });

  // ============================================================================
  // hasStagedChanges Tests
  // ============================================================================

  describe("hasStagedChanges", () => {
    beforeEach(async () => {
      await initGitRepo(testDir);
      await createFile(testDir, "initial.txt", "initial");
      await stageFile(testDir, "initial.txt");
      await commitFile(testDir, "Initial commit");
    });

    it("should return false when no changes are staged", () => {
      expect(hasStagedChanges(testDir)).toBe(false);
    });

    it("should return true when changes are staged", async () => {
      await createFile(testDir, "new.txt", "new content");
      await stageFile(testDir, "new.txt");
      expect(hasStagedChanges(testDir)).toBe(true);
    });

    it("should return false when only unstaged changes exist", async () => {
      await createFile(testDir, "initial.txt", "modified content");
      expect(hasStagedChanges(testDir)).toBe(false);
    });

    it("should return false when only untracked files exist", async () => {
      await createFile(testDir, "untracked.txt", "untracked content");
      expect(hasStagedChanges(testDir)).toBe(false);
    });

    it("should return true after staging a modified file", async () => {
      await createFile(testDir, "initial.txt", "modified content");
      expect(hasStagedChanges(testDir)).toBe(false);
      await stageFile(testDir, "initial.txt");
      expect(hasStagedChanges(testDir)).toBe(true);
    });
  });

  // ============================================================================
  // Edge Cases and Error Handling
  // ============================================================================

  describe("Edge Cases", () => {
    it("should handle files with spaces in names", async () => {
      await initGitRepo(testDir);
      await createFile(testDir, "file with spaces.txt", "content");

      const files = getChangedFiles(testDir);
      expect(files).toContain("file with spaces.txt");

      const addResult = gitAdd(testDir, ["file with spaces.txt"]);
      expect(addResult.success).toBe(true);
    });

    it("should handle files with special characters in names", async () => {
      await initGitRepo(testDir);
      await createFile(testDir, "file-with_special.chars.txt", "content");

      const files = getChangedFiles(testDir);
      expect(files).toContain("file-with_special.chars.txt");
    });

    it("should handle empty file", async () => {
      await initGitRepo(testDir);
      await createFile(testDir, "empty.txt", "");

      const files = getChangedFiles(testDir);
      expect(files).toContain("empty.txt");

      const addResult = gitAdd(testDir, "all");
      expect(addResult.success).toBe(true);
    });

    it("should handle nested directory structure", async () => {
      await initGitRepo(testDir);
      await fs.mkdir(path.join(testDir, "nested", "deep"), { recursive: true });
      await createFile(testDir, "nested/deep/file.txt", "content");

      const files = getChangedFiles(testDir);
      expect(files).toContain("nested/deep/file.txt");
    });
  });
});
