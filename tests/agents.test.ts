/**
 * Tests for src/agents.ts - AI agent subprocess management
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EventEmitter } from "node:events";
import {
  DEFAULT_AGENTS,
  commandExists,
  getAvailableAgent,
  filterAvailableAgents,
  checkAvailableAgents,
  callAgent,
  callAnyAvailableAgent,
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

    it("should call which to check command", () => {
      vi.mocked(spawnSync).mockReturnValue({ status: 0 } as any);
      commandExists("test-cmd");
      expect(spawnSync).toHaveBeenCalledWith("which", ["test-cmd"], { stdio: "pipe" });
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

      // Default order: codex > gemini > claude
      const agent1 = getAvailableAgent();
      expect(agent1?.name).toBe("codex"); // First in default order that's available

      // When gemini is preferred first
      const agent2 = getAvailableAgent(["gemini", "codex", "claude"]);
      expect(agent2?.name).toBe("gemini");

      // When codex is preferred first
      const agent3 = getAvailableAgent(["codex", "gemini", "claude"]);
      expect(agent3?.name).toBe("codex");
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
  });
});
