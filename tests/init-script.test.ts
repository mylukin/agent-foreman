/**
 * Tests for src/init-script.ts - Bootstrap script generation
 */
import { describe, it, expect } from "vitest";
import { generateInitScript, generateMinimalInitScript } from "../src/init-script.js";
import type { ProjectCommands } from "../src/types.js";

describe("Init Script", () => {
  describe("generateInitScript", () => {
    it("should generate script with all commands configured", () => {
      const commands: ProjectCommands = {
        install: "npm install",
        dev: "npm run dev",
        test: "npm test",
        build: "npm run build",
        lint: "npm run lint",
      };

      const script = generateInitScript(commands);

      // Should include shebang and header
      expect(script).toContain("#!/usr/bin/env bash");
      expect(script).toContain("# ai/init.sh - Bootstrap script for agent-foreman harness");
      expect(script).toContain("set -euo pipefail");

      // Should include configured commands
      expect(script).toContain("npm install");
      expect(script).toContain("npm run dev");
      expect(script).toContain("npm test");
      expect(script).toContain("npm run build");
      expect(script).toContain("npm run lint");
    });

    it("should generate script with only install command", () => {
      const commands: ProjectCommands = {
        install: "yarn install",
      };

      const script = generateInitScript(commands);

      expect(script).toContain("yarn install");
      expect(script).toContain("No dev command configured");
      expect(script).toContain("No test command configured");
      expect(script).toContain("No build command configured");
    });

    it("should generate script with only test command", () => {
      const commands: ProjectCommands = {
        test: "jest",
      };

      const script = generateInitScript(commands);

      expect(script).toContain("jest");
      expect(script).toContain("No install command configured");
    });

    it("should include all required shell functions", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      // Required functions
      expect(script).toContain("bootstrap()");
      expect(script).toContain("dev()");
      expect(script).toContain("check()");
      expect(script).toContain("build()");
      expect(script).toContain("status()");
      expect(script).toContain("show_help()");
    });

    it("should include main case statement with all commands", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      // Main case statement
      expect(script).toContain('case "${1:-help}" in');
      expect(script).toContain("bootstrap)");
      expect(script).toContain("dev)");
      expect(script).toContain("check)");
      expect(script).toContain("build)");
      expect(script).toContain("status)");
      expect(script).toContain("help|--help|-h)");
    });

    it("should include color output helpers", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      expect(script).toContain("RED=");
      expect(script).toContain("GREEN=");
      expect(script).toContain("YELLOW=");
      expect(script).toContain("NC=");
      expect(script).toContain("log_info()");
      expect(script).toContain("log_warn()");
      expect(script).toContain("log_error()");
    });

    it("should include status function with feature list parsing", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      expect(script).toContain("ai/feature_list.json");
      expect(script).toContain("jq '.features | length'");
      expect(script).toContain('select(.status == "passing")');
      expect(script).toContain('select(.status == "failing")');
      expect(script).toContain('select(.status == "needs_review")');
    });

    it("should include check function with exit code tracking", () => {
      const commands: ProjectCommands = {
        test: "npm test",
        lint: "npm run lint",
        build: "npm run build",
      };
      const script = generateInitScript(commands);

      expect(script).toContain("local exit_code=0");
      expect(script).toContain("return $exit_code");
      expect(script).toContain("Some checks failed");
      expect(script).toContain("All checks passed!");
    });

    it("should include TypeScript check in check function", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      expect(script).toContain('if [ -f "tsconfig.json" ]');
      expect(script).toContain("npx tsc --noEmit");
      expect(script).toContain("Type check failed");
    });

    it("should include progress log in status function", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      expect(script).toContain('if [ -f "ai/progress.log" ]');
      expect(script).toContain("tail -5 ai/progress.log");
    });

    it("should handle empty commands gracefully", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      // Should still generate valid script
      expect(script).toContain("#!/usr/bin/env bash");
      expect(script).toContain("No install command configured");
      expect(script).toContain("No dev command configured");
      expect(script).toContain("No test command configured");
      expect(script).toContain("No build command configured");
    });

    it("should properly escape shell variables", () => {
      const commands: ProjectCommands = {};
      const script = generateInitScript(commands);

      // Escaped variables for bash output
      expect(script).toContain("${GREEN}");
      expect(script).toContain("${NC}");
      expect(script).toContain("$1");
    });
  });

  describe("generateMinimalInitScript", () => {
    it("should generate a valid minimal script", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("#!/usr/bin/env bash");
      expect(script).toContain("# ai/init.sh - Bootstrap script for agent-foreman harness");
      expect(script).toContain("set -euo pipefail");
    });

    it("should include all required shell functions", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("bootstrap()");
      expect(script).toContain("dev()");
      expect(script).toContain("check()");
      expect(script).toContain("build()");
      expect(script).toContain("status()");
      expect(script).toContain("show_help()");
    });

    it("should include TODO comments for unconfigured commands", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("# TODO: Add your install command");
      expect(script).toContain("# TODO: Add your dev command");
      expect(script).toContain("# TODO: Add your build command");
    });

    it("should include placeholder messages", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("Please configure install command in this script");
      expect(script).toContain("Please configure dev command in this script");
      expect(script).toContain("Please configure build command in this script");
    });

    it("should include main case statement with all commands", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain('case "${1:-help}" in');
      expect(script).toContain("bootstrap)");
      expect(script).toContain("dev)");
      expect(script).toContain("check)");
      expect(script).toContain("build)");
      expect(script).toContain("status)");
    });

    it("should include color output helpers", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("RED=");
      expect(script).toContain("GREEN=");
      expect(script).toContain("YELLOW=");
      expect(script).toContain("NC=");
    });

    it("should include check function with TypeScript check", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("local exit_code=0");
      expect(script).toContain('if [ -f "tsconfig.json" ]');
      expect(script).toContain("npx tsc --noEmit");
      expect(script).toContain("Configure test/lint/build commands for full verification");
    });

    it("should include status function with jq conditional", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("ai/feature_list.json");
      expect(script).toContain("command -v jq");
      expect(script).toContain("jq '.features | length'");
    });

    it("should include help function with command descriptions", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("Usage: ./ai/init.sh <command>");
      expect(script).toContain("bootstrap  Install dependencies");
      expect(script).toContain("dev        Start development server");
      expect(script).toContain("check      Run all checks");
      expect(script).toContain("build      Build for production");
      expect(script).toContain("status     Show project status");
      expect(script).toContain("help       Show this help message");
    });

    it("should include unknown command error handling", () => {
      const script = generateMinimalInitScript();

      expect(script).toContain("Unknown command:");
      expect(script).toContain("exit 1");
    });
  });

  describe("script comparison", () => {
    it("should generate different scripts for full vs minimal", () => {
      const fullScript = generateInitScript({
        install: "npm install",
        test: "npm test",
      });
      const minimalScript = generateMinimalInitScript();

      // Minimal script should have TODO comments, full script should not
      expect(minimalScript).toContain("# TODO:");
      expect(fullScript).not.toContain("# TODO:");

      // Full script should have actual commands
      expect(fullScript).toContain("npm install");
      expect(fullScript).toContain("npm test");
    });

    it("should have same structure for both scripts", () => {
      const fullScript = generateInitScript({});
      const minimalScript = generateMinimalInitScript();

      // Both should have the same basic structure
      const requiredFunctions = [
        "bootstrap()",
        "dev()",
        "check()",
        "build()",
        "status()",
        "show_help()",
      ];

      for (const func of requiredFunctions) {
        expect(fullScript).toContain(func);
        expect(minimalScript).toContain(func);
      }
    });
  });
});
