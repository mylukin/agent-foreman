/**
 * Tests for src/agents.ts - AI agent subprocess management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  DEFAULT_AGENTS,
  commandExists,
  getPlatform,
  getAvailableAgent,
  filterAvailableAgents,
  checkAvailableAgents,
  callAgent,
  callAgentWithRetry,
  callAnyAvailableAgent,
  printAgentStatus,
} from "../src/agents.js";

// Mock child_process
vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
  spawnSync: vi.fn(),
}));

import { spawn, spawnSync } from "node:child_process";

describe("Agents", () => {
  describe("DEFAULT_AGENTS", () => {
    it("should have claude, gemini, and codex agents defined", () => {
      const agentNames = DEFAULT_AGENTS.map((a) => a.name);
      expect(agentNames).toContain("claude");
      expect(agentNames).toContain("gemini");
      expect(agentNames).toContain("codex");
    });

    it("should have claude configured with --dangerously-skip-permissions", () => {
      const claude = DEFAULT_AGENTS.find((a) => a.name === "claude");
      expect(claude).toBeDefined();
      expect(claude!.command).toContain("--dangerously-skip-permissions");
      expect(claude!.command).toContain("--print");
      expect(claude!.command).toContain("--output-format");
    });

    it("should have gemini configured for text output with yolo mode", () => {
      const gemini = DEFAULT_AGENTS.find((a) => a.name === "gemini");
      expect(gemini).toBeDefined();
      expect(gemini!.command).toContain("--output-format");
      expect(gemini!.command).toContain("text");
      expect(gemini!.command).toContain("--yolo");
    });

    it("should have codex configured with --full-auto", () => {
      const codex = DEFAULT_AGENTS.find((a) => a.name === "codex");
      expect(codex).toBeDefined();
      expect(codex!.command).toContain("--full-auto");
      expect(codex!.command).toContain("--skip-git-repo-check");
    });

    it("should have all agents configured with promptViaStdin", () => {
      for (const agent of DEFAULT_AGENTS) {
        expect(agent.promptViaStdin).toBe(true);
      }
    });
  });

  describe("getPlatform", () => {
    it("should return 'windows' or 'unix' based on process.platform", () => {
      const platform = getPlatform();
      expect(["windows", "unix"]).toContain(platform);
    });

    it("should return 'unix' on darwin (macOS)", () => {
      // On macOS, process.platform is 'darwin' which is not 'win32'
      if (process.platform === "darwin") {
        expect(getPlatform()).toBe("unix");
      }
    });

    it("should return 'unix' on linux", () => {
      // On Linux, process.platform is 'linux' which is not 'win32'
      if (process.platform === "linux") {
        expect(getPlatform()).toBe("unix");
      }
    });
  });

  describe("commandExists", () => {
    beforeEach(() => {
      vi.mocked(spawnSync).mockReset();
    });

    it("should return true when command exists", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
      expect(commandExists("node")).toBe(true);
    });

    it("should return false when command does not exist", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
      expect(commandExists("nonexistent-command")).toBe(false);
    });

    it("should use 'which' on Unix platforms", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
      // Since we're on Unix (macOS/Linux), it should use 'which'
      if (process.platform !== "win32") {
        commandExists("test-cmd");
        expect(spawnSync).toHaveBeenCalledWith("which", ["test-cmd"], { stdio: "pipe", shell: false });
      }
    });

    it("should pass shell option appropriately for platform", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
      commandExists("test-cmd");
      // On Unix, shell should be false; on Windows, shell should be true
      const expectedShell = process.platform === "win32";
      expect(spawnSync).toHaveBeenCalledWith(
        expect.any(String),
        ["test-cmd"],
        expect.objectContaining({ shell: expectedShell })
      );
    });

    it("should return false when spawnSync returns null status", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: null } as any);
      expect(commandExists("some-cmd")).toBe(false);
    });
  });

  describe("getAvailableAgent", () => {
    beforeEach(() => {
      vi.mocked(spawnSync).mockReset();
    });

    it("should return first available agent in preferred order", () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "gemini") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const agent = getAvailableAgent(["claude", "gemini", "codex"]);
      expect(agent?.name).toBe("gemini");
    });

    it("should return null when no agents available", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);
      const agent = getAvailableAgent();
      expect(agent).toBeNull();
    });

    it("should respect preferred order", () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "claude" || name === "gemini" || name === "codex") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      // Explicit default order: codex > gemini > claude (avoids env var interference)
      const agent1 = getAvailableAgent(["codex", "gemini", "claude"]);
      expect(agent1?.name).toBe("codex"); // First in specified order that's available

      // When gemini is preferred first
      const agent2 = getAvailableAgent(["gemini", "codex", "claude"]);
      expect(agent2?.name).toBe("gemini");

      // When claude is preferred first
      const agent3 = getAvailableAgent(["claude", "gemini", "codex"]);
      expect(agent3?.name).toBe("claude");
    });
  });

  describe("filterAvailableAgents", () => {
    beforeEach(() => {
      vi.mocked(spawnSync).mockReset();
    });

    it("should separate available and unavailable agents", () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "claude") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const result = filterAvailableAgents(DEFAULT_AGENTS);

      expect(result.available.length).toBe(1);
      expect(result.available[0].name).toBe("claude");
      expect(result.unavailable.length).toBe(2);
    });

    it("should return all unavailable when none found", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);

      const result = filterAvailableAgents(DEFAULT_AGENTS);

      expect(result.available.length).toBe(0);
      expect(result.unavailable.length).toBe(3);
    });

    it("should return all available when all found", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);

      const result = filterAvailableAgents(DEFAULT_AGENTS);

      expect(result.available.length).toBe(3);
      expect(result.unavailable.length).toBe(0);
    });
  });

  describe("checkAvailableAgents", () => {
    beforeEach(() => {
      vi.mocked(spawnSync).mockReset();
    });

    it("should return status for all default agents", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);

      const result = checkAvailableAgents();

      expect(result.length).toBe(3);
      expect(result.every((r) => r.name && typeof r.available === "boolean")).toBe(true);
    });

    it("should correctly report available agents", () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "gemini") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const result = checkAvailableAgents();

      const gemini = result.find((r) => r.name === "gemini");
      const claude = result.find((r) => r.name === "claude");

      expect(gemini?.available).toBe(true);
      expect(claude?.available).toBe(false);
    });
  });

  describe("callAgent", () => {
    // Helper to create a mock child process
    function createMockProcess(output: string, exitCode = 0) {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      // Simulate async output and close
      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from(output));
        mockProcess.emit("close", exitCode);
      }, 10);

      return mockProcess;
    }

    beforeEach(() => {
      vi.mocked(spawn).mockReset();
      vi.mocked(spawnSync).mockReset();
    });

    it("should pass cwd option to spawn", async () => {
      const mockProcess = createMockProcess('{"result": "success"}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      await callAgent(agent, "test prompt", { cwd: "/test/project" });

      expect(spawn).toHaveBeenCalledWith(
        agent.command[0],
        agent.command.slice(1),
        expect.objectContaining({ cwd: "/test/project" })
      );
    });

    it("should work without cwd option", async () => {
      const mockProcess = createMockProcess('{"result": "success"}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      await callAgent(agent, "test prompt");

      expect(spawn).toHaveBeenCalledWith(
        agent.command[0],
        agent.command.slice(1),
        expect.objectContaining({ cwd: undefined })
      );
    });

    it("should return success with output on successful execution", async () => {
      const mockProcess = createMockProcess('{"data": "test"}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const result = await callAgent(agent, "test prompt");

      expect(result.success).toBe(true);
      expect(result.output).toBe('{"data": "test"}');
    });

    it("should return error on non-zero exit code", async () => {
      const mockProcess = createMockProcess("error output", 1);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const result = await callAgent(agent, "test prompt");

      expect(result.success).toBe(false);
    });

    it("should write prompt to stdin for stdin-based agents", async () => {
      const mockProcess = createMockProcess("response");
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      await callAgent(agent, "my test prompt");

      expect(mockProcess.stdin.write).toHaveBeenCalledWith("my test prompt");
      expect(mockProcess.stdin.end).toHaveBeenCalled();
    });
  });

  describe("callAnyAvailableAgent", () => {
    function createMockProcess(output: string, exitCode = 0) {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from(output));
        mockProcess.emit("close", exitCode);
      }, 10);

      return mockProcess;
    }

    beforeEach(() => {
      vi.mocked(spawn).mockReset();
      vi.mocked(spawnSync).mockReset();
    });

    it("should pass cwd option to agent", async () => {
      // Make gemini available
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "gemini") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const mockProcess = createMockProcess('{"success": true}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      await callAnyAvailableAgent("test prompt", {
        preferredOrder: ["gemini"],
        cwd: "/my/project/path",
      });

      expect(spawn).toHaveBeenCalledWith(
        "gemini",
        expect.any(Array),
        expect.objectContaining({ cwd: "/my/project/path" })
      );
    });

    it("should return agentUsed in result", async () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "claude") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const mockProcess = createMockProcess('{"result": "ok"}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const result = await callAnyAvailableAgent("test", {
        preferredOrder: ["claude"],
      });

      expect(result.success).toBe(true);
      expect(result.agentUsed).toBe("claude");
    });

    it("should try agents in preferred order", async () => {
      // Only codex is available
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "codex") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const mockProcess = createMockProcess('{"ok": true}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const result = await callAnyAvailableAgent("test", {
        preferredOrder: ["gemini", "claude", "codex"],
      });

      expect(result.agentUsed).toBe("codex");
    });

    it("should return error when no agents available", async () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 1 } as any);

      const result = await callAnyAvailableAgent("test");

      expect(result.success).toBe(false);
      expect(result.error).toContain("No AI agents available");
    });

    it("should skip unknown agent names in preferred order", async () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "claude") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const mockProcess = createMockProcess('{"result": "ok"}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const result = await callAnyAvailableAgent("test", {
        preferredOrder: ["unknown-agent", "claude"],
      });

      expect(result.success).toBe(true);
      expect(result.agentUsed).toBe("claude");
    });

    it("should try next agent when first fails", async () => {
      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        // Both gemini and claude are available
        if (name === "gemini" || name === "claude") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      // First agent fails, second succeeds
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call (gemini) fails
          return createMockProcess("error", 1);
        }
        // Second call (claude) succeeds
        return createMockProcess('{"ok": true}', 0);
      });

      const result = await callAnyAvailableAgent("test", {
        preferredOrder: ["gemini", "claude"],
      });

      expect(result.success).toBe(true);
      expect(result.agentUsed).toBe("claude");
    });

    it("should output verbose logging when enabled", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "claude") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      const mockProcess = createMockProcess('{"result": "ok"}');
      vi.mocked(spawn).mockReturnValue(mockProcess);

      await callAnyAvailableAgent("test", {
        preferredOrder: ["gemini", "claude"],
        verbose: true,
      });

      // Should have logged skipping gemini
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("should show error in verbose mode when agent fails", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);

      const mockProcess = createMockProcess("error output", 1);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      await callAnyAvailableAgent("test", {
        preferredOrder: ["claude"],
        verbose: true,
      });

      consoleSpy.mockRestore();
    });
  });

  describe("callAgentWithRetry", () => {
    function createMockProcess(output: string, exitCode = 0) {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from(output));
        mockProcess.emit("close", exitCode);
      }, 10);

      return mockProcess;
    }

    beforeEach(() => {
      vi.mocked(spawn).mockReset();
      vi.mocked(spawnSync).mockReset();
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should return success on first attempt if agent succeeds", async () => {
      const mockProcess = createMockProcess('{"result": "ok"}', 0);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgentWithRetry(agent, "test prompt", { maxRetries: 3 });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(1);
    });

    it("should retry on failure up to maxRetries times", async () => {
      // All calls fail - but we need fresh mock for each call
      vi.mocked(spawn).mockImplementation(() => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();

        // Schedule the close event after a very short delay
        setTimeout(() => {
          mockProcess.emit("close", 1);
        }, 5);

        return mockProcess;
      });

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgentWithRetry(agent, "test prompt", { maxRetries: 2 });

      // Run through all timers (process close + retry delays)
      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    it("should succeed on second retry after initial failure", async () => {
      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          // First call fails
          return createMockProcess("error", 1);
        }
        // Second call succeeds
        return createMockProcess('{"ok": true}', 0);
      });

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgentWithRetry(agent, "test prompt", { maxRetries: 3 });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(true);
      expect(spawn).toHaveBeenCalledTimes(2);
    });

    it("should log retry attempts when verbose is true", async () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      let callCount = 0;
      vi.mocked(spawn).mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return createMockProcess("error", 1);
        }
        return createMockProcess('{"ok": true}', 0);
      });

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgentWithRetry(agent, "test prompt", {
        maxRetries: 3,
        verbose: true,
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      // Should have logged "Retry attempt 2/3..."
      expect(consoleSpy).toHaveBeenCalled();
      const calls = consoleSpy.mock.calls.map(c => c[0]);
      expect(calls.some(c => typeof c === "string" && c.includes("Retry"))).toBe(true);

      consoleSpy.mockRestore();
    });

    it("should use default timeout of 120000ms", async () => {
      const mockProcess = createMockProcess('{"ok": true}', 0);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgentWithRetry(agent, "test prompt");

      await vi.runAllTimersAsync();
      await resultPromise;

      // Just verify it uses defaults without error
      expect(spawn).toHaveBeenCalled();
    });

    it("should pass cwd option to callAgent", async () => {
      const mockProcess = createMockProcess('{"ok": true}', 0);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgentWithRetry(agent, "test prompt", {
        cwd: "/test/path",
      });

      await vi.runAllTimersAsync();
      await resultPromise;

      expect(spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({ cwd: "/test/path" })
      );
    });

    it("should return last error when all retries fail", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        const mockProcess = new EventEmitter() as any;
        mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
        mockProcess.stdout = new EventEmitter();
        mockProcess.stderr = new EventEmitter();
        mockProcess.kill = vi.fn();

        setTimeout(() => {
          mockProcess.stderr.emit("data", Buffer.from("specific error"));
          mockProcess.emit("close", 1);
        }, 5);

        return mockProcess;
      });

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgentWithRetry(agent, "test prompt", { maxRetries: 2 });

      await vi.runAllTimersAsync();
      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe("callAgent - additional edge cases", () => {
    function createMockProcess(output: string, exitCode = 0) {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      setTimeout(() => {
        mockProcess.stdout.emit("data", Buffer.from(output));
        mockProcess.emit("close", exitCode);
      }, 10);

      return mockProcess;
    }

    beforeEach(() => {
      vi.mocked(spawn).mockReset();
      vi.mocked(spawnSync).mockReset();
    });

    it("should handle agent error event", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgent(agent, "test prompt");

      // Emit error event
      setTimeout(() => {
        mockProcess.emit("error", new Error("spawn failed"));
      }, 10);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("spawn failed");
    });

    it("should handle stderr output on error", async () => {
      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgent(agent, "test prompt");

      // Emit stderr and then close with error code
      setTimeout(() => {
        mockProcess.stderr.emit("data", Buffer.from("Error: command failed"));
        mockProcess.emit("close", 1);
      }, 10);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toContain("command failed");
    });

    it("should handle timeout", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });

      const mockProcess = new EventEmitter() as any;
      mockProcess.stdin = { write: vi.fn(), end: vi.fn() };
      mockProcess.stdout = new EventEmitter();
      mockProcess.stderr = new EventEmitter();
      mockProcess.kill = vi.fn();

      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const resultPromise = callAgent(agent, "test prompt", { timeoutMs: 1000 });

      // Advance time past timeout
      await vi.advanceTimersByTimeAsync(1500);

      // Emit close event after kill
      mockProcess.emit("close", null);

      const result = await resultPromise;

      expect(result.success).toBe(false);
      expect(result.error).toBe("Agent timed out");
      expect(mockProcess.kill).toHaveBeenCalledWith("SIGTERM");

      vi.useRealTimers();
    });

    it("should handle spawn exception", async () => {
      vi.mocked(spawn).mockImplementation(() => {
        throw new Error("spawn ENOENT");
      });

      const agent = DEFAULT_AGENTS.find((a) => a.name === "claude")!;
      const result = await callAgent(agent, "test prompt");

      expect(result.success).toBe(false);
      expect(result.error).toContain("spawn ENOENT");
    });

    it("should handle agent without stdin (promptViaStdin=false)", async () => {
      const mockProcess = createMockProcess('{"ok": true}', 0);
      vi.mocked(spawn).mockReturnValue(mockProcess);

      const agent = {
        name: "test-agent",
        command: ["test-cmd", "--arg"],
        promptViaStdin: false,
      };

      const resultPromise = callAgent(agent, "test prompt");
      const result = await resultPromise;

      expect(result.success).toBe(true);
      // The prompt should be passed as argument, not stdin
      expect(spawn).toHaveBeenCalledWith(
        "test-cmd",
        ["--arg", "test prompt"],
        expect.objectContaining({ stdio: ["ignore", "pipe", "pipe"] })
      );
    });
  });

  describe("printAgentStatus", () => {
    beforeEach(() => {
      vi.mocked(spawnSync).mockReset();
    });

    it("should print status for all agents", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);

      printAgentStatus();

      expect(consoleSpy).toHaveBeenCalled();
      const output = consoleSpy.mock.calls.map(c => c[0]).join(" ");
      expect(output).toContain("AI Agents Status");
      expect(output).toContain("claude");
      expect(output).toContain("gemini");
      expect(output).toContain("codex");

      consoleSpy.mockRestore();
    });

    it("should show available status correctly", () => {
      const consoleSpy = vi.spyOn(console, "log").mockImplementation(() => {});

      vi.mocked(spawnSync).mockImplementation((cmd, args) => {
        const name = (args as string[])[0];
        if (name === "claude") return { status: 0 } as any;
        return { status: 1 } as any;
      });

      printAgentStatus();

      const output = consoleSpy.mock.calls.map(c => c[0]).join("\n");
      expect(output).toContain("available");
      expect(output).toContain("not found");

      consoleSpy.mockRestore();
    });
  });
});
