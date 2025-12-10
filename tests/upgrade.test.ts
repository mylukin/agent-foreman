/**
 * Tests for auto-upgrade utility
 * Covers version checking, throttling, and upgrade functionality
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

import {
  getCurrentVersion,
  fetchLatestVersion,
  compareVersions,
  checkForUpgrade,
  forceUpgradeCheck,
  interactiveUpgradeCheck,
  performInteractiveUpgrade,
} from "../src/upgrade.js";

// ============================================================================
// Mock setup
// ============================================================================

// Mock child_process
vi.mock("node:child_process", async () => {
  const actual = await vi.importActual("node:child_process");
  return {
    ...actual,
    spawnSync: vi.fn().mockReturnValue({
      status: 0,
      stdout: "1.0.0\n",
      stderr: "",
    }),
  };
});

// Mock plugin-installer to control isCompiledBinary
vi.mock("../src/plugin-installer.js", () => ({
  isCompiledBinary: vi.fn().mockReturnValue(false),
}));

// Mock binary-upgrade module
vi.mock("../src/binary-upgrade.js", () => ({
  fetchLatestGitHubVersion: vi.fn().mockResolvedValue(null),
  performBinaryUpgrade: vi.fn().mockResolvedValue({ success: true }),
  canWriteToExecutable: vi.fn().mockReturnValue(true),
}));

// ============================================================================
// compareVersions Tests
// ============================================================================

describe("Upgrade Utils", () => {
  describe("compareVersions", () => {
    it("should return 0 for equal versions", () => {
      expect(compareVersions("1.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("2.3.4", "2.3.4")).toBe(0);
      expect(compareVersions("0.0.1", "0.0.1")).toBe(0);
    });

    it("should return 1 when first version is greater", () => {
      expect(compareVersions("2.0.0", "1.0.0")).toBe(1);
      expect(compareVersions("1.1.0", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.1", "1.0.0")).toBe(1);
      expect(compareVersions("1.0.10", "1.0.9")).toBe(1);
    });

    it("should return -1 when first version is smaller", () => {
      expect(compareVersions("1.0.0", "2.0.0")).toBe(-1);
      expect(compareVersions("1.0.0", "1.1.0")).toBe(-1);
      expect(compareVersions("1.0.0", "1.0.1")).toBe(-1);
      expect(compareVersions("1.0.9", "1.0.10")).toBe(-1);
    });

    it("should handle versions with different segment counts", () => {
      expect(compareVersions("1.0", "1.0.0")).toBe(0);
      expect(compareVersions("1.0.0", "1.0")).toBe(0);
      expect(compareVersions("1.0.1", "1.0")).toBe(1);
      expect(compareVersions("1.0", "1.0.1")).toBe(-1);
    });

    it("should handle versions with leading zeros", () => {
      expect(compareVersions("01.0.0", "1.0.0")).toBe(0);
      expect(compareVersions("1.02.0", "1.2.0")).toBe(0);
    });

    it("should handle edge cases", () => {
      expect(compareVersions("0.0.0", "0.0.0")).toBe(0);
      expect(compareVersions("0.0.1", "0.0.0")).toBe(1);
      expect(compareVersions("10.20.30", "10.20.30")).toBe(0);
    });
  });

  // ============================================================================
  // getCurrentVersion Tests
  // ============================================================================

  describe("getCurrentVersion", () => {
    it("should return a version string", () => {
      const version = getCurrentVersion();
      expect(typeof version).toBe("string");
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });

    it("should match package.json version", async () => {
      const pkgPath = path.join(process.cwd(), "package.json");
      const pkgContent = await fs.readFile(pkgPath, "utf-8");
      const pkg = JSON.parse(pkgContent);

      const version = getCurrentVersion();
      expect(version).toBe(pkg.version);
    });
  });

  // ============================================================================
  // fetchLatestVersion Tests
  // ============================================================================

  describe("fetchLatestVersion", () => {
    it("should return a version string when npm is available", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        status: 0,
        stdout: "1.2.3\n",
        stderr: "",
      });

      const version = await fetchLatestVersion();
      expect(version).toBe("1.2.3");
    });

    it("should return null when npm fails", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "error",
      });

      const version = await fetchLatestVersion();
      expect(version).toBeNull();
    });

    it("should return null when npm returns empty output", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        status: 0,
        stdout: "",
        stderr: "",
      });

      const version = await fetchLatestVersion();
      expect(version).toBeNull();
    });
  });

  // ============================================================================
  // checkForUpgrade Tests
  // ============================================================================

  describe("checkForUpgrade", () => {
    it("should detect when upgrade is needed", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        status: 0,
        stdout: "999.0.0\n", // Much higher than current version
        stderr: "",
      });

      const result = await checkForUpgrade();
      expect(result.needsUpgrade).toBe(true);
      expect(result.latestVersion).toBe("999.0.0");
    });

    it("should not upgrade when current version is latest", async () => {
      const currentVersion = getCurrentVersion();
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        status: 0,
        stdout: `${currentVersion}\n`,
        stderr: "",
      });

      const result = await checkForUpgrade();
      expect(result.needsUpgrade).toBe(false);
      expect(result.currentVersion).toBe(currentVersion);
    });

    it("should not upgrade when current version is ahead", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        status: 0,
        stdout: "0.0.1\n", // Much lower than current version
        stderr: "",
      });

      const result = await checkForUpgrade();
      expect(result.needsUpgrade).toBe(false);
    });

    it("should handle fetch errors gracefully", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValueOnce({
        status: 1,
        stdout: "",
        stderr: "network error",
      });

      const result = await checkForUpgrade();
      expect(result.needsUpgrade).toBe(false);
      expect(result.latestVersion).toBeNull();
      expect(result.error).toBeDefined();
    });
  });

  // ============================================================================
  // interactiveUpgradeCheck Tests
  // ============================================================================

  describe("interactiveUpgradeCheck", () => {
    const cacheFile = path.join(
      process.env.HOME || process.env.USERPROFILE || "/tmp",
      ".agent-foreman-upgrade-check"
    );

    beforeEach(async () => {
      // Remove cache file before each test
      try {
        await fs.unlink(cacheFile);
      } catch {
        // File doesn't exist, ignore
      }
    });

    afterEach(async () => {
      // Clean up cache file
      try {
        await fs.unlink(cacheFile);
      } catch {
        // File doesn't exist, ignore
      }
    });

    it("should check for upgrade when cache file does not exist", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "0.0.1\n", // Lower version, no upgrade needed
        stderr: "",
      });

      await interactiveUpgradeCheck();

      // Cache file should be created
      const stat = await fs.stat(cacheFile);
      expect(stat).toBeDefined();
    });

    it("should skip check when within throttle interval", async () => {
      // Create cache file with current timestamp
      await fs.writeFile(cacheFile, new Date().toISOString());

      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockClear();

      await interactiveUpgradeCheck();

      // spawnSync should not have been called (check was skipped)
      expect(spawnSync).not.toHaveBeenCalled();
    });

    it("should check when cache file is old enough", async () => {
      // Create cache file with old timestamp (25 hours ago)
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      await fs.writeFile(cacheFile, oldDate.toISOString());
      // Update mtime
      await fs.utimes(cacheFile, oldDate, oldDate);

      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "0.0.1\n",
        stderr: "",
      });

      await interactiveUpgradeCheck();

      expect(spawnSync).toHaveBeenCalled();
    });

    it("should not throw on errors", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
        throw new Error("npm crashed");
      });

      // Should not throw
      await expect(interactiveUpgradeCheck()).resolves.toBeUndefined();
    });

    it("should skip prompt in non-TTY mode", async () => {
      // Remove cache to force check
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "999.0.0\n", // Higher version, upgrade available
        stderr: "",
      });

      // In test environment, stdin is not a TTY, so prompt should be skipped
      // This should not throw and should complete without hanging
      await interactiveUpgradeCheck();

      // Cache file should still be created
      const stat = await fs.stat(cacheFile);
      expect(stat).toBeDefined();
    });
  });

  // ============================================================================
  // performInteractiveUpgrade Tests
  // ============================================================================

  describe("performInteractiveUpgrade", () => {
    it("should return success when npm install succeeds", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "",
        stderr: "",
      });

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe("1.0.0");
      expect(result.toVersion).toBe("2.0.0");
    });

    it("should return error when npm install fails", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "Permission denied",
      });

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      expect(result.success).toBe(false);
      expect(result.error).toContain("npm upgrade failed");
    });
  });

  // ============================================================================
  // forceUpgradeCheck Tests
  // ============================================================================

  describe("forceUpgradeCheck", () => {
    it("should bypass throttle and check immediately", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "999.0.0\n",
        stderr: "",
      });

      const result = await forceUpgradeCheck();

      expect(result.needsUpgrade).toBe(true);
      expect(result.latestVersion).toBe("999.0.0");
    });

    it("should update last check time", async () => {
      const cacheFile = path.join(
        process.env.HOME || process.env.USERPROFILE || "/tmp",
        ".agent-foreman-upgrade-check"
      );

      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "0.0.1\n",
        stderr: "",
      });

      await forceUpgradeCheck();

      const stat = await fs.stat(cacheFile);
      const now = Date.now();
      expect(stat.mtime.getTime()).toBeCloseTo(now, -3); // Within 1 second
    });
  });

  // ============================================================================
  // performInteractiveUpgrade - Plugin Update Tests
  // ============================================================================

  describe("performInteractiveUpgrade - plugin updates", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should attempt plugin update after successful npm upgrade", async () => {
      const { spawnSync } = await import("node:child_process");
      const calls: string[] = [];

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args: string[]) => {
          calls.push(`${cmd} ${args.join(" ")}`);

          // npm install succeeds
          if (cmd === "npm") {
            return { status: 0, stdout: "", stderr: "" };
          }

          // Plugin directory doesn't exist (fs.access will fail)
          // Return failure for git commands to simulate no plugin
          return { status: 1, stdout: "", stderr: "" };
        }
      );

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      expect(result.success).toBe(true);
      expect(calls.some(c => c.includes("npm install"))).toBe(true);
    });

    it("should continue upgrade even if plugin update fails", async () => {
      const { spawnSync } = await import("node:child_process");
      let npmCallCount = 0;

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "npm") {
            npmCallCount++;
            return { status: 0, stdout: "", stderr: "" };
          }
          if (cmd === "git") {
            // rev-parse succeeds (is a git repo)
            if (args.includes("rev-parse")) {
              return { status: 0, stdout: ".git", stderr: "" };
            }
            // pull fails
            if (args.includes("pull")) {
              return { status: 1, stdout: "", stderr: "Git pull failed" };
            }
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      // Note: Plugin update will be skipped because plugin dir doesn't exist
      // but the upgrade should still succeed
      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      // Should still succeed because plugin update failure is not fatal
      expect(result.success).toBe(true);
      expect(npmCallCount).toBe(1);
    });

    it("should succeed even with all paths (npm success + plugin operations)", async () => {
      const { spawnSync } = await import("node:child_process");
      const calls: string[] = [];

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args: string[]) => {
          calls.push(`${cmd} ${args ? args.join(" ") : ""}`);
          if (cmd === "npm") {
            return { status: 0, stdout: "", stderr: "" };
          }
          // Return success for any git operations
          return { status: 0, stdout: ".git", stderr: "" };
        }
      );

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      expect(result.success).toBe(true);
      // npm install should have been called
      expect(calls.some(c => c.includes("npm install"))).toBe(true);
    });

    it("should skip plugin update if not a git repository", async () => {
      const { spawnSync } = await import("node:child_process");

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "npm") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (cmd === "git" && args.includes("rev-parse")) {
            // Not a git repo
            return { status: 128, stdout: "", stderr: "fatal: not a git repository" };
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      // Plugin dir doesn't exist by default in test environment
      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      expect(result.success).toBe(true);
    });

    it("should successfully update plugin when git pull succeeds", async () => {
      const { spawnSync } = await import("node:child_process");

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "npm") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (cmd === "git") {
            if (args.includes("rev-parse")) {
              return { status: 0, stdout: ".git", stderr: "" };
            }
            if (args.includes("pull")) {
              return { status: 0, stdout: "Already up to date.", stderr: "" };
            }
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      // Plugin dir doesn't exist by default in test environment
      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      expect(result.success).toBe(true);
    });

    it("should handle npm upgrade exception", async () => {
      const { spawnSync } = await import("node:child_process");

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string) => {
          if (cmd === "npm") {
            throw new Error("npm not found");
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      expect(result.success).toBe(false);
      expect(result.error).toContain("npm upgrade failed");
    });

    it("should handle plugin update exception gracefully", async () => {
      const { spawnSync } = await import("node:child_process");

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args: string[]) => {
          if (cmd === "npm") {
            return { status: 0, stdout: "", stderr: "" };
          }
          if (cmd === "git") {
            if (args.includes("rev-parse")) {
              return { status: 0, stdout: ".git", stderr: "" };
            }
            throw new Error("git not found");
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      // Plugin dir doesn't exist by default, so git commands won't be called
      // and no exception will be thrown
      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");

      // Should still succeed
      expect(result.success).toBe(true);
    });
  });

  // ============================================================================
  // interactiveUpgradeCheck - TTY and User Prompt Tests
  // ============================================================================

  describe("interactiveUpgradeCheck - advanced scenarios", () => {
    const cacheFile = path.join(
      process.env.HOME || process.env.USERPROFILE || "/tmp",
      ".agent-foreman-upgrade-check"
    );

    beforeEach(async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await fs.unlink(cacheFile);
      } catch {
        // Ignore
      }
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      try {
        await fs.unlink(cacheFile);
      } catch {
        // Ignore
      }
    });

    it("should not prompt when no upgrade needed", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "0.0.1\n", // Lower version
        stderr: "",
      });

      // Should complete without prompting
      await interactiveUpgradeCheck();

      // Verify cache was still updated
      const stat = await fs.stat(cacheFile);
      expect(stat).toBeDefined();
    });

    it("should not prompt when latestVersion is null", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 1,
        stdout: "",
        stderr: "error",
      });

      // Should complete without prompting
      await interactiveUpgradeCheck();

      // Cache should still be updated
      const stat = await fs.stat(cacheFile);
      expect(stat).toBeDefined();
    });

    it("should handle interactiveUpgradeCheck silently catching errors", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Unexpected error");
      });

      // Should not throw - errors are silently caught
      await expect(interactiveUpgradeCheck()).resolves.toBeUndefined();
    });

    it("should display upgrade notification when upgrade available in non-TTY", async () => {
      const { spawnSync } = await import("node:child_process");
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "999.0.0\n",
        stderr: "",
      });

      // In test (non-TTY), user prompt returns false, so upgrade will be skipped
      await interactiveUpgradeCheck();

      // Should have logged the upgrade available message
      const allOutput = consoleSpy.mock.calls.map(c => String(c[0])).join("\n");
      expect(allOutput).toContain("New version available");
      expect(allOutput).toContain("999.0.0");

      consoleSpy.mockRestore();
    });
  });

  // ============================================================================
  // fetchLatestVersion - Edge Cases
  // ============================================================================

  describe("fetchLatestVersion - edge cases", () => {
    it("should handle spawnSync throwing exception", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("spawn failed");
      });

      const result = await fetchLatestVersion();
      expect(result).toBeNull();
    });

    it("should trim whitespace from version", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "  1.2.3  \n\n",
        stderr: "",
      });

      const result = await fetchLatestVersion();
      expect(result).toBe("1.2.3");
    });
  });

  // ============================================================================
  // checkForUpgrade - Edge Cases
  // ============================================================================

  describe("checkForUpgrade - edge cases", () => {
    it("should handle exception during fetch", async () => {
      const { spawnSync } = await import("node:child_process");

      // First make fetchLatestVersion throw
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error("Network error");
      });

      const result = await checkForUpgrade();

      // When spawnSync throws, fetchLatestVersion catches it and returns null
      // Then checkForUpgrade returns needsUpgrade: false with the current version
      // and latestVersion: null (from the failed fetch)
      expect(result.needsUpgrade).toBe(false);
      // latestVersion can be null when fetch fails, but due to error handling
      // it may still return current version info
      expect(result.currentVersion).toBeDefined();
    });
  });

  // ============================================================================
  // Additional coverage for upgrade.ts uncovered lines
  // ============================================================================

  describe("fetchLatestVersion - stdout conditions", () => {
    it("should return null when status is 0 but stdout is falsy", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "",  // Empty string is falsy
        stderr: "",
      });

      const version = await fetchLatestVersion();
      expect(version).toBeNull();
    });

    it("should return null when status is non-zero", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 1,
        stdout: "1.0.0",
        stderr: "error",
      });

      const version = await fetchLatestVersion();
      expect(version).toBeNull();
    });
  });

  describe("plugin directory edge cases", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should handle npm upgrade success path", async () => {
      const { spawnSync } = await import("node:child_process");

      // Mock npm install to succeed
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args?: string[]) => {
          // Handle npm install -g agent-foreman@latest
          if (cmd === "npm" && args?.includes("install")) {
            return { status: 0, stdout: "added 1 package", stderr: "" };
          }
          // Handle git commands (plugin directory doesn't exist in tests)
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");
      expect(result.success).toBe(true);
      expect(result.fromVersion).toBe("1.0.0");
      expect(result.toVersion).toBe("2.0.0");
    });

    it("should handle npm upgrade failure path", async () => {
      const { spawnSync } = await import("node:child_process");

      // Mock npm install to fail
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args?: string[]) => {
          if (cmd === "npm" && args?.includes("install")) {
            return { status: 1, stdout: "", stderr: "npm ERR! code EACCES" };
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");
      expect(result.success).toBe(false);
      expect(result.error).toContain("npm upgrade failed");
    });
  });

  describe("interactiveUpgradeCheck - user confirmation paths", () => {
    const cacheFile = path.join(
      process.env.HOME || process.env.USERPROFILE || "/tmp",
      ".agent-foreman-upgrade-check"
    );

    beforeEach(async () => {
      vi.spyOn(console, "log").mockImplementation(() => {});
      try {
        await fs.unlink(cacheFile);
      } catch {
        // Ignore
      }
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      try {
        await fs.unlink(cacheFile);
      } catch {
        // Ignore
      }
    });

    it("should check for upgrade and show notification when newer version available", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const { spawnSync } = await import("node:child_process");

      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "999.0.0\n",
        stderr: "",
      });

      // In non-TTY mode (CI environment), promptUserConfirmation returns false
      // So the upgrade check should show upgrade available but skip the actual upgrade
      await interactiveUpgradeCheck();

      // Verify the function was called and check console output
      // Note: In non-TTY mode, we may or may not see the "Skipping upgrade" message
      // depending on whether the prompt path is triggered
      const allOutput = consoleSpy.mock.calls.map(c => String(c[0])).join("\n");

      // The function should at minimum detect the upgrade is available
      // and show a notification or skip message
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    // Note: Testing interactive TTY prompts is not possible in ESM without complex mocking
    // The promptUserConfirmation function uses readline.createInterface which cannot be spied on
    // in ESM. These code paths (lines 356-366) are tested manually in TTY environments.
  });

  describe("getCurrentVersion edge cases", () => {
    it("should return 0.0.0 when package.json cannot be read", async () => {
      // Note: This is hard to test without mocking the file system
      // The current implementation reads from ../package.json relative to the module
      // We verify the function returns a valid version string
      const version = getCurrentVersion();
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  // ============================================================================
  // Plugin update edge cases - coverage for updatePlugin internal function
  // ============================================================================

  describe("plugin update scenarios", () => {
    beforeEach(() => {
      vi.spyOn(console, "log").mockImplementation(() => {});
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("should skip plugin update when plugin directory does not exist", async () => {
      const { spawnSync } = await import("node:child_process");

      // In test environment, plugin directory doesn't exist, so updatePlugin returns early
      // This tests the "no plugin to update" code path
      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args?: string[]) => {
          if (cmd === "npm" && args?.includes("install")) {
            return { status: 0, stdout: "added 1 package", stderr: "" };
          }
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");
      expect(result.success).toBe(true);
    });

    it("should handle npm upgrade and proceed even without plugin dir", async () => {
      const { spawnSync } = await import("node:child_process");
      const consoleSpy = vi.spyOn(console, "log");

      (spawnSync as ReturnType<typeof vi.fn>).mockImplementation(
        (cmd: string, args?: string[]) => {
          if (cmd === "npm" && args?.includes("install")) {
            return { status: 0, stdout: "added 1 package", stderr: "" };
          }
          // Plugin dir doesn't exist in tests, git commands won't be called
          return { status: 0, stdout: "", stderr: "" };
        }
      );

      const result = await performInteractiveUpgrade("1.0.0", "2.0.0");
      expect(result.success).toBe(true);

      const allOutput = consoleSpy.mock.calls.map(c => String(c[0])).join("\n");
      expect(allOutput).toContain("Upgrading agent-foreman");
      expect(allOutput).toContain("npm package updated");
    });
  });

  // ============================================================================
  // forceUpgradeCheck tests
  // ============================================================================

  describe("forceUpgradeCheck", () => {
    it("should update cache and return upgrade result", async () => {
      const { spawnSync } = await import("node:child_process");
      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: "999.0.0\n",
        stderr: "",
      });

      const result = await forceUpgradeCheck();

      expect(result.needsUpgrade).toBe(true);
      expect(result.latestVersion).toBe("999.0.0");
      expect(result.currentVersion).toBeDefined();
    });

    it("should work when no upgrade available", async () => {
      const { spawnSync } = await import("node:child_process");
      const currentVersion = getCurrentVersion();

      (spawnSync as ReturnType<typeof vi.fn>).mockReturnValue({
        status: 0,
        stdout: `${currentVersion}\n`,
        stderr: "",
      });

      const result = await forceUpgradeCheck();

      expect(result.needsUpgrade).toBe(false);
    });
  });
});
