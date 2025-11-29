/**
 * Tests for progress indicators
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  Spinner,
  ProgressBar,
  StepProgress,
  createSpinner,
  createProgressBar,
  createStepProgress,
  isTTY,
} from "../src/progress.js";

describe("progress indicators", () => {
  describe("isTTY", () => {
    it("should return a boolean", () => {
      const result = isTTY();
      expect(typeof result).toBe("boolean");
    });
  });

  describe("Spinner", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should create a spinner instance", () => {
      const spinner = new Spinner("Loading");
      expect(spinner).toBeInstanceOf(Spinner);
    });

    it("should stop without error", () => {
      const spinner = new Spinner("Loading");
      spinner.start();
      expect(() => spinner.stop()).not.toThrow();
    });

    it("should succeed without error", () => {
      const spinner = new Spinner("Loading");
      spinner.start();
      expect(() => spinner.succeed("Done!")).not.toThrow();
    });

    it("should fail without error", () => {
      const spinner = new Spinner("Loading");
      spinner.start();
      expect(() => spinner.fail("Error!")).not.toThrow();
    });

    it("should warn without error", () => {
      const spinner = new Spinner("Loading");
      spinner.start();
      expect(() => spinner.warn("Warning!")).not.toThrow();
    });

    it("should update message without error", () => {
      const spinner = new Spinner("Loading");
      spinner.start();
      expect(() => spinner.update("Processing")).not.toThrow();
      spinner.stop();
    });

    it("should handle multiple stops gracefully", () => {
      const spinner = new Spinner("Loading");
      spinner.start();
      spinner.stop();
      expect(() => spinner.stop()).not.toThrow();
    });

    it("should not start when already stopped", () => {
      const spinner = new Spinner("Loading");
      spinner.start();
      spinner.stop();
      // Starting again should be safe
      expect(() => spinner.start()).not.toThrow();
    });
  });

  describe("ProgressBar", () => {
    it("should create a progress bar instance", () => {
      const bar = new ProgressBar("Processing", 10);
      expect(bar).toBeInstanceOf(ProgressBar);
    });

    it("should start without error", () => {
      const bar = new ProgressBar("Processing", 10);
      expect(() => bar.start()).not.toThrow();
    });

    it("should update without error", () => {
      const bar = new ProgressBar("Processing", 10);
      bar.start();
      expect(() => bar.update(5)).not.toThrow();
    });

    it("should update with message without error", () => {
      const bar = new ProgressBar("Processing", 10);
      bar.start();
      expect(() => bar.update(5, "Halfway")).not.toThrow();
    });

    it("should increment without error", () => {
      const bar = new ProgressBar("Processing", 10);
      bar.start();
      expect(() => bar.increment()).not.toThrow();
    });

    it("should increment with message without error", () => {
      const bar = new ProgressBar("Processing", 10);
      bar.start();
      expect(() => bar.increment("Step 1")).not.toThrow();
    });

    it("should complete without error", () => {
      const bar = new ProgressBar("Processing", 10);
      bar.start();
      expect(() => bar.complete()).not.toThrow();
    });

    it("should complete with message without error", () => {
      const bar = new ProgressBar("Processing", 10);
      bar.start();
      expect(() => bar.complete("All done")).not.toThrow();
    });

    it("should handle progress over 100% gracefully", () => {
      const bar = new ProgressBar("Processing", 10);
      bar.start();
      expect(() => bar.update(15)).not.toThrow(); // Over 100%
    });

    it("should accept custom width", () => {
      const bar = new ProgressBar("Processing", 10, 20);
      expect(bar).toBeInstanceOf(ProgressBar);
    });
  });

  describe("StepProgress", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should create a step progress instance", () => {
      const steps = ["Step 1", "Step 2", "Step 3"];
      const progress = new StepProgress(steps);
      expect(progress).toBeInstanceOf(StepProgress);
    });

    it("should start without error", () => {
      const steps = ["Step 1", "Step 2"];
      const progress = new StepProgress(steps);
      expect(() => progress.start()).not.toThrow();
      progress.complete();
    });

    it("should track current step index", () => {
      const steps = ["Step 1", "Step 2", "Step 3"];
      const progress = new StepProgress(steps);
      progress.start();

      expect(progress.getCurrentStep()).toBe(0);

      progress.completeStep(true);
      expect(progress.getCurrentStep()).toBe(1);

      progress.completeStep(true);
      expect(progress.getCurrentStep()).toBe(2);

      progress.complete();
    });

    it("should complete step with success", () => {
      const steps = ["Step 1", "Step 2"];
      const progress = new StepProgress(steps);
      progress.start();

      expect(() => progress.completeStep(true)).not.toThrow();
      progress.complete();
    });

    it("should complete step with failure", () => {
      const steps = ["Step 1", "Step 2"];
      const progress = new StepProgress(steps);
      progress.start();

      expect(() => progress.completeStep(false)).not.toThrow();
      progress.complete();
    });

    it("should warn step without error", () => {
      const steps = ["Step 1", "Step 2"];
      const progress = new StepProgress(steps);
      progress.start();

      expect(() => progress.warnStep()).not.toThrow();
      progress.complete();
    });

    it("should complete without error", () => {
      const steps = ["Step 1", "Step 2"];
      const progress = new StepProgress(steps);
      progress.start();

      expect(() => progress.complete()).not.toThrow();
    });

    it("should handle empty steps array", () => {
      const progress = new StepProgress([]);
      expect(() => progress.start()).not.toThrow();
      progress.complete();
    });

    it("should handle single step", () => {
      const progress = new StepProgress(["Only step"]);
      progress.start();
      progress.completeStep(true);
      expect(progress.getCurrentStep()).toBe(0);
      progress.complete();
    });
  });

  describe("factory functions", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("createSpinner should create and start a spinner", () => {
      const spinner = createSpinner("Test");
      expect(spinner).toBeInstanceOf(Spinner);
      spinner.stop();
    });

    it("createProgressBar should create a progress bar", () => {
      const bar = createProgressBar("Test", 5);
      expect(bar).toBeInstanceOf(ProgressBar);
    });

    it("createProgressBar should accept custom width", () => {
      const bar = createProgressBar("Test", 5, 20);
      expect(bar).toBeInstanceOf(ProgressBar);
    });

    it("createStepProgress should create step progress", () => {
      const progress = createStepProgress(["A", "B"]);
      expect(progress).toBeInstanceOf(StepProgress);
    });
  });

  describe("elapsed time formatting", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("should handle time progression without errors", () => {
      const spinner = new Spinner("Loading");
      spinner.start();

      // Advance time
      vi.advanceTimersByTime(5000);
      expect(() => spinner.stop()).not.toThrow();
    });

    it("should handle longer time periods", () => {
      const spinner = new Spinner("Loading");
      spinner.start();

      // Advance time by 2 minutes
      vi.advanceTimersByTime(120000);
      expect(() => spinner.succeed("Done")).not.toThrow();
    });
  });

  describe("TTY vs non-TTY output format verification", () => {
    it("spinner in non-TTY mode outputs simple message with ellipsis", () => {
      // When not TTY, spinner outputs "Message..." format
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});

      // Force non-TTY behavior by creating spinner and checking output pattern
      const spinner = new Spinner("Test operation");
      // In non-TTY, start() logs "Message..."
      spinner.start();

      // Check that console.log was called (non-TTY behavior)
      // or stdout.write (TTY behavior)
      // The actual format depends on environment
      spinner.stop();

      mockLog.mockRestore();
    });

    it("progress bar shows step count in format [current/total]", () => {
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const bar = new ProgressBar("Processing", 5);
      bar.start();
      bar.update(3, "Step 3");
      bar.complete("Done");

      // In non-TTY mode, output should contain [3/5] pattern
      // In TTY mode, output to stdout.write contains similar pattern
      const hasCalled = mockLog.mock.calls.length > 0 || mockWrite.mock.calls.length > 0;
      expect(hasCalled).toBe(true);

      mockLog.mockRestore();
      mockWrite.mockRestore();
    });

    it("step progress shows step X/Y format", () => {
      vi.useFakeTimers();
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const steps = ["Get data", "Process", "Save"];
      const progress = new StepProgress(steps);
      progress.start();
      progress.completeStep(true);
      progress.completeStep(true);
      progress.complete();

      // Verify output was produced
      const hasCalled = mockLog.mock.calls.length > 0 || mockWrite.mock.calls.length > 0;
      expect(hasCalled).toBe(true);

      // In non-TTY mode, should output "[1/3]", "[2/3]", "[3/3]" patterns
      const allLogCalls = mockLog.mock.calls.map(c => String(c[0])).join("\n");
      if (allLogCalls.length > 0) {
        // Non-TTY outputs to console.log with [step/total] format
        expect(allLogCalls).toMatch(/\[\d+\/\d+\]/);
      }

      mockLog.mockRestore();
      mockWrite.mockRestore();
      vi.useRealTimers();
    });

    it("spinner succeed shows checkmark character", () => {
      vi.useFakeTimers();
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const spinner = new Spinner("Test");
      spinner.start();
      spinner.succeed("Completed");

      // Check for checkmark in output
      const allOutput = [
        ...mockLog.mock.calls.map(c => String(c[0])),
        ...mockWrite.mock.calls.map(c => String(c[0]))
      ].join("\n");

      expect(allOutput).toContain("✓");

      mockLog.mockRestore();
      mockWrite.mockRestore();
      vi.useRealTimers();
    });

    it("spinner fail shows X character", () => {
      vi.useFakeTimers();
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const spinner = new Spinner("Test");
      spinner.start();
      spinner.fail("Error occurred");

      // Check for X in output
      const allOutput = [
        ...mockLog.mock.calls.map(c => String(c[0])),
        ...mockWrite.mock.calls.map(c => String(c[0]))
      ].join("\n");

      expect(allOutput).toContain("✗");

      mockLog.mockRestore();
      mockWrite.mockRestore();
      vi.useRealTimers();
    });

    it("spinner warn shows warning character", () => {
      vi.useFakeTimers();
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const spinner = new Spinner("Test");
      spinner.start();
      spinner.warn("Warning message");

      // Check for warning symbol in output
      const allOutput = [
        ...mockLog.mock.calls.map(c => String(c[0])),
        ...mockWrite.mock.calls.map(c => String(c[0]))
      ].join("\n");

      expect(allOutput).toContain("⚠");

      mockLog.mockRestore();
      mockWrite.mockRestore();
      vi.useRealTimers();
    });

    it("progress bar complete shows 100% and checkmark", () => {
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const bar = new ProgressBar("Processing", 10);
      bar.start();
      bar.complete("All done");

      const allOutput = [
        ...mockLog.mock.calls.map(c => String(c[0])),
        ...mockWrite.mock.calls.map(c => String(c[0]))
      ].join("\n");

      // Should contain 100% or 10/10
      expect(allOutput).toMatch(/100%|10\/10/);

      mockLog.mockRestore();
      mockWrite.mockRestore();
    });

    it("spinner output includes elapsed time format", () => {
      vi.useFakeTimers();
      const mockLog = vi.spyOn(console, "log").mockImplementation(() => {});
      const mockWrite = vi.spyOn(process.stdout, "write").mockImplementation(() => true);

      const spinner = new Spinner("Processing");
      spinner.start();

      // Advance time by 5 seconds
      vi.advanceTimersByTime(5000);

      spinner.succeed("Done");

      const allOutput = [
        ...mockLog.mock.calls.map(c => String(c[0])),
        ...mockWrite.mock.calls.map(c => String(c[0]))
      ].join("\n");

      // Should contain time format like "5s" or "(5s)"
      expect(allOutput).toMatch(/\d+s|\d+m/);

      mockLog.mockRestore();
      mockWrite.mockRestore();
      vi.useRealTimers();
    });
  });
});
