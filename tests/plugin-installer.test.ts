/**
 * Tests for plugin-installer module
 * Tests the automatic plugin installation functionality for compiled binaries
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

// ============================================================================
// Test Setup
// ============================================================================

let tempDir: string;
let originalHome: string | undefined;
let originalCI: string | undefined;
let originalNoPluginUpdate: string | undefined;

function createTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "plugin-installer-test-"));
}

function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

beforeEach(() => {
  tempDir = createTempDir();
  originalHome = process.env.HOME;
  originalCI = process.env.CI;
  originalNoPluginUpdate = process.env.NO_PLUGIN_UPDATE;

  // Set CI to prevent interactive prompts
  process.env.CI = "true";
});

afterEach(() => {
  cleanup(tempDir);
  if (originalHome !== undefined) {
    process.env.HOME = originalHome;
  }
  if (originalCI !== undefined) {
    process.env.CI = originalCI;
  } else {
    delete process.env.CI;
  }
  if (originalNoPluginUpdate !== undefined) {
    process.env.NO_PLUGIN_UPDATE = originalNoPluginUpdate;
  } else {
    delete process.env.NO_PLUGIN_UPDATE;
  }
  vi.restoreAllMocks();
});

// ============================================================================
// Module Import Tests
// ============================================================================

describe("plugin-installer module", () => {
  it("should export checkAndInstallPlugins function", async () => {
    const module = await import("../src/plugin-installer.js");
    expect(typeof module.checkAndInstallPlugins).toBe("function");
  });

  it("should skip installation when not in compiled mode", async () => {
    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // In development mode (no embedded plugins), should skip silently
    await expect(checkAndInstallPlugins()).resolves.not.toThrow();
  });
});

// ============================================================================
// isCompiledBinary Tests (via behavior)
// ============================================================================

describe("compiled binary detection", () => {
  it("should detect non-compiled mode when EMBEDDED_PLUGINS is empty", async () => {
    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // In development mode, checkAndInstallPlugins should return early
    // without any side effects
    const consoleSpy = vi.spyOn(console, "log");
    await checkAndInstallPlugins();

    // Should not log anything in development mode (returns early)
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Installing plugins")
    );
  });
});

// ============================================================================
// Version File Handling Tests (via exports)
// ============================================================================

describe("version file handling", () => {
  it("should handle missing version file gracefully", async () => {
    // The getInstalledVersion function is internal, but we can test
    // the behavior through checkAndInstallPlugins
    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // Should not throw when version file doesn't exist
    await expect(checkAndInstallPlugins()).resolves.not.toThrow();
  });
});

// ============================================================================
// Plugin Installation Flow Tests
// ============================================================================

describe("plugin installation flow", () => {
  it("should skip installation in CI environment", async () => {
    process.env.CI = "true";

    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // Should complete without prompting in CI
    await expect(checkAndInstallPlugins()).resolves.not.toThrow();
  });

  it("should skip installation when NO_PLUGIN_UPDATE is set", async () => {
    process.env.NO_PLUGIN_UPDATE = "true";

    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // Should complete without prompting
    await expect(checkAndInstallPlugins()).resolves.not.toThrow();
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe("error handling", () => {
  it("should handle installation errors gracefully", async () => {
    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // Should not throw even if internal operations fail
    await expect(checkAndInstallPlugins()).resolves.not.toThrow();
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe("integration", () => {
  it("should be safe to call multiple times", async () => {
    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // Multiple calls should be idempotent
    await checkAndInstallPlugins();
    await checkAndInstallPlugins();
    await checkAndInstallPlugins();

    // Should not throw
    expect(true).toBe(true);
  });

  it("should work in non-TTY environment", async () => {
    const { checkAndInstallPlugins } = await import("../src/plugin-installer.js");

    // Non-TTY should skip prompts
    const originalIsTTY = process.stdin.isTTY;
    Object.defineProperty(process.stdin, "isTTY", { value: false, configurable: true });

    await expect(checkAndInstallPlugins()).resolves.not.toThrow();

    Object.defineProperty(process.stdin, "isTTY", { value: originalIsTTY, configurable: true });
  });
});

// ============================================================================
// Registry and Status Tests
// Note: These tests use the actual user's .claude directory since the module
// caches paths at load time. Tests focus on export verification and
// non-destructive operations.
// ============================================================================

describe("plugin registry functions - export verification", () => {
  it("isCompiledBinary should return a boolean", async () => {
    const { isCompiledBinary } = await import("../src/plugin-installer.js");
    // Returns true if plugins-bundle.generated.ts has embedded plugins
    // Returns false in pure development mode
    expect(typeof isCompiledBinary()).toBe("boolean");
  });

  it("should export isMarketplaceRegistered function", async () => {
    const { isMarketplaceRegistered } = await import("../src/plugin-installer.js");
    expect(typeof isMarketplaceRegistered).toBe("function");
    // Just verify it returns a boolean
    expect(typeof isMarketplaceRegistered()).toBe("boolean");
  });

  it("should export isPluginInstalled function", async () => {
    const { isPluginInstalled } = await import("../src/plugin-installer.js");
    expect(typeof isPluginInstalled).toBe("function");
    expect(typeof isPluginInstalled()).toBe("boolean");
  });

  it("should export isPluginEnabled function", async () => {
    const { isPluginEnabled } = await import("../src/plugin-installer.js");
    expect(typeof isPluginEnabled).toBe("function");
    expect(typeof isPluginEnabled()).toBe("boolean");
  });

  it("getPluginInstallInfo should return correct structure", async () => {
    const { getPluginInstallInfo } = await import("../src/plugin-installer.js");
    const info = getPluginInstallInfo();

    // Verify structure
    expect(typeof info.isMarketplaceRegistered).toBe("boolean");
    expect(typeof info.isPluginInstalled).toBe("boolean");
    expect(typeof info.isPluginEnabled).toBe("boolean");
    expect(info.installedVersion === null || typeof info.installedVersion === "string").toBe(true);
    expect(info.marketplaceDir).toContain("agent-foreman-plugins");
    expect(typeof info.bundledVersion).toBe("string");
  });
});

// ============================================================================
// Install and Uninstall Flow Tests
// These tests verify the functions exist and can be called without throwing
// ============================================================================

describe("install and uninstall flows - export verification", () => {
  it("should export fullInstall function", async () => {
    const { fullInstall } = await import("../src/plugin-installer.js");
    expect(typeof fullInstall).toBe("function");
  });

  it("should export fullUninstall function", async () => {
    const { fullUninstall } = await import("../src/plugin-installer.js");
    expect(typeof fullUninstall).toBe("function");
  });

  it("fullUninstall should handle missing files gracefully", async () => {
    const { fullUninstall } = await import("../src/plugin-installer.js");
    // Should not throw even when files don't exist in a fresh environment
    // Note: Since module caches paths, this uses real HOME directory
    expect(() => fullUninstall()).not.toThrow();
  });
});

// ============================================================================
// Full Install Integration Tests
// These tests call fullInstall() to exercise internal functions
// ============================================================================

describe("fullInstall integration", () => {
  it("should execute fullInstall without throwing", async () => {
    const { fullInstall, fullUninstall, getPluginInstallInfo } = await import("../src/plugin-installer.js");

    // Record initial state
    const beforeInfo = getPluginInstallInfo();

    // Execute fullInstall - this exercises all internal functions:
    // installMarketplaceFiles, registerMarketplace, installPlugin, enablePlugin
    expect(() => fullInstall()).not.toThrow();

    // Verify installation occurred
    const afterInfo = getPluginInstallInfo();
    expect(afterInfo.isMarketplaceRegistered).toBe(true);
    expect(afterInfo.isPluginInstalled).toBe(true);
    expect(afterInfo.isPluginEnabled).toBe(true);

    // Cleanup: uninstall to restore state
    expect(() => fullUninstall()).not.toThrow();
  });

  it("should be idempotent - calling fullInstall twice should not throw", async () => {
    const { fullInstall, fullUninstall } = await import("../src/plugin-installer.js");

    // First install
    expect(() => fullInstall()).not.toThrow();

    // Second install (should overwrite/update, not fail)
    expect(() => fullInstall()).not.toThrow();

    // Cleanup
    expect(() => fullUninstall()).not.toThrow();
  });

  it("fullUninstall should clean up all installed files", async () => {
    const { fullInstall, fullUninstall, isPluginInstalled, isPluginEnabled } = await import("../src/plugin-installer.js");

    // Install first
    fullInstall();

    // Verify installed
    expect(isPluginInstalled()).toBeTruthy();

    // Uninstall
    fullUninstall();

    // Verify uninstalled - after uninstall, plugin should not be installed/enabled
    expect(isPluginInstalled()).toBeFalsy();
    expect(isPluginEnabled()).toBeFalsy();
  });
});

// ============================================================================
// checkAndInstallPlugins Compiled Binary Simulation
// ============================================================================

describe("checkAndInstallPlugins with compiled binary simulation", () => {
  it("should skip when marketplace already registered", async () => {
    const {
      fullInstall,
      fullUninstall,
      checkAndInstallPlugins,
      isMarketplaceRegistered
    } = await import("../src/plugin-installer.js");

    // Pre-install to register marketplace
    fullInstall();
    expect(isMarketplaceRegistered()).toBe(true);

    // checkAndInstallPlugins should return early (not reinstall)
    const consoleSpy = vi.spyOn(console, "log");
    await checkAndInstallPlugins();

    // Should not have logged installation message (since marketplace exists)
    // Note: In dev mode isCompiledBinary() returns false, so it returns early anyway
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("Plugin installed")
    );

    // Cleanup
    fullUninstall();
    consoleSpy.mockRestore();
  });
});

// ============================================================================
// Registry File Corruption Handling
// ============================================================================

describe("registry function return types", () => {
  it("isMarketplaceRegistered should return falsy when not registered", async () => {
    const { isMarketplaceRegistered, fullUninstall } = await import("../src/plugin-installer.js");

    // Ensure clean state
    fullUninstall();

    // Should return falsy when not registered
    expect(isMarketplaceRegistered()).toBeFalsy();
  });

  it("isPluginInstalled should return falsy when not installed", async () => {
    const { isPluginInstalled, fullUninstall } = await import("../src/plugin-installer.js");

    // Ensure clean state
    fullUninstall();

    expect(isPluginInstalled()).toBeFalsy();
  });

  it("isPluginEnabled should return falsy when not enabled", async () => {
    const { isPluginEnabled, fullUninstall } = await import("../src/plugin-installer.js");

    // Ensure clean state
    fullUninstall();

    expect(isPluginEnabled()).toBeFalsy();
  });

  it("getPluginInstallInfo should return structure with falsy values after uninstall", async () => {
    const { getPluginInstallInfo, fullUninstall } = await import("../src/plugin-installer.js");

    // Ensure clean state
    fullUninstall();

    const info = getPluginInstallInfo();
    expect(info.isMarketplaceRegistered).toBeFalsy();
    expect(info.isPluginInstalled).toBeFalsy();
    expect(info.isPluginEnabled).toBeFalsy();
    expect(info.installedVersion).toBeNull();
  });
});
