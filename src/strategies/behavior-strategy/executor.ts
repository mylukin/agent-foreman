/**
 * Behavior Strategy Executor
 * Main executor class for behavior verification strategy
 */

import type { Feature } from "../../types/index.js";
import type { BehaviorVerificationStrategy } from "../../verifier/types/index.js";
import type { StrategyExecutor, StrategyResult } from "../../strategy-executor.js";
import type { AntiPatternCategory, AntiPatternSeverity } from "../../anti-patterns/types.js";

import {
  AntiPatternDetector,
  AntiPatternRegistry,
  defaultAntiPatternRegistry,
  initializeAntiPatterns,
} from "../../anti-patterns/index.js";

import type { BehaviorVerificationResult, CustomBehaviorPattern } from "./types.js";
import { collectLogs, getDefaultLogPath } from "./log-collector.js";
import { formatBehaviorOutput } from "./output.js";

/**
 * Behavior Strategy Executor
 * Detects workflow violations in agent behavior logs
 */
export class BehaviorStrategyExecutor
  implements StrategyExecutor<BehaviorVerificationStrategy>
{
  readonly type = "behavior" as const;

  private registry: AntiPatternRegistry;
  private detector: AntiPatternDetector;

  constructor(registry?: AntiPatternRegistry) {
    // Ensure built-in patterns are initialized
    initializeAntiPatterns();

    this.registry = registry ?? defaultAntiPatternRegistry;
    this.detector = new AntiPatternDetector(this.registry);
  }

  /**
   * Execute behavior verification strategy
   *
   * @param cwd - Current working directory
   * @param strategy - The behavior strategy configuration
   * @param feature - The feature being verified
   * @returns Strategy execution result
   */
  async execute(
    cwd: string,
    strategy: BehaviorVerificationStrategy,
    _feature: Feature
  ): Promise<StrategyResult> {
    const startTime = Date.now();

    try {
      // Determine log source and path
      const logSource = strategy.logSource ?? "file";
      const logPath = strategy.logPath ?? getDefaultLogPath(cwd);

      // Collect logs
      const logResult = await collectLogs({
        source: logSource,
        path: logPath,
      });

      if (!logResult.success) {
        return {
          success: false,
          output: `Failed to collect logs: ${logResult.error}`,
          duration: Date.now() - startTime,
          details: {
            reason: "log-collection-failed",
            error: logResult.error,
          },
        };
      }

      // If no logs available, pass (nothing to check)
      if (!logResult.content || logResult.content.trim() === "") {
        return {
          success: true,
          output: "No behavior logs available for verification",
          duration: Date.now() - startTime,
          details: {
            reason: "no-logs",
            logSource,
            logPath: logResult.path,
          },
        };
      }

      // Build detection options
      const minSeverity: AntiPatternSeverity = strategy.minSeverity ?? "warning";
      const categories = strategy.categories as AntiPatternCategory[] | undefined;

      // Register custom patterns if provided
      if (strategy.customPatterns && strategy.customPatterns.length > 0) {
        this.registerCustomPatterns(strategy.customPatterns);
      }

      // Run detection
      const detectionResult = this.detector.detect(logResult.content, {
        minSeverity,
        categories,
        includeContext: true,
        contextLines: 2,
      });

      // Build verification result
      const verificationResult = this.buildVerificationResult(detectionResult, strategy);

      // Determine overall success
      const passed = verificationResult.passed;
      const output = formatBehaviorOutput(verificationResult);

      return {
        success: passed,
        output,
        duration: Date.now() - startTime,
        details: {
          passed,
          violations: {
            critical: verificationResult.criticalViolations.length,
            warning: verificationResult.warningViolations.length,
            info: verificationResult.infoNotices.length,
          },
          logSource,
          logPath: logResult.path,
          lineCount: logResult.lineCount,
          detectionResult: {
            hasViolations: detectionResult.hasViolations,
            bySeverity: detectionResult.bySeverity,
            byCategory: detectionResult.byCategory,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        output: `Behavior verification failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
        details: {
          reason: "error",
          error: (error as Error).message,
        },
      };
    }
  }

  /**
   * Build verification result from detection result
   */
  private buildVerificationResult(
    detectionResult: import("../../anti-patterns/types.js").DetectionResult,
    strategy: BehaviorVerificationStrategy
  ): BehaviorVerificationResult {
    const criticalViolations = detectionResult.violations.filter(
      (v) => v.pattern.severity === "critical"
    );
    const warningViolations = detectionResult.violations.filter(
      (v) => v.pattern.severity === "warning"
    );
    const infoNotices = detectionResult.violations.filter(
      (v) => v.pattern.severity === "info"
    );

    // Determine pass/fail
    // Default: fail on critical, pass on warning/info
    const failFast = strategy.failFast ?? true;
    const passed = failFast
      ? criticalViolations.length === 0
      : !detectionResult.hasViolations;

    // Collect unique remediations
    const remediations = [
      ...new Set(criticalViolations.map((v) => v.pattern.remediation)),
    ];

    // Build summary
    let summary: string;
    if (!detectionResult.hasViolations) {
      summary = "No workflow violations detected";
    } else if (passed) {
      summary = `No critical violations. ${warningViolations.length} warning(s), ${infoNotices.length} info notice(s)`;
    } else {
      summary = `${criticalViolations.length} critical violation(s) detected`;
    }

    return {
      passed,
      detectionResult,
      criticalViolations,
      warningViolations,
      infoNotices,
      summary,
      remediations,
    };
  }

  /**
   * Register custom patterns from strategy configuration
   */
  private registerCustomPatterns(customPatterns: CustomBehaviorPattern[]): void {
    for (const custom of customPatterns) {
      if (this.registry.has(custom.id)) {
        continue; // Skip if already registered
      }

      this.registry.register({
        id: custom.id,
        description: custom.message,
        category: "workflow-bypass", // Default category for custom patterns
        severity: custom.severity,
        detectionPatterns: [new RegExp(custom.pattern, "i")],
        remediation: "Review and correct the flagged behavior",
      });
    }
  }

  /**
   * Get the detector being used
   */
  getDetector(): AntiPatternDetector {
    return this.detector;
  }

  /**
   * Get the registry being used
   */
  getRegistry(): AntiPatternRegistry {
    return this.registry;
  }
}
