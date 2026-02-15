/**
 * Anti-Pattern Detector
 * Detects anti-patterns in text content (logs, transcripts, etc.)
 */

import type {
  AntiPattern,
  AntiPatternMatch,
  DetectionResult,
  DetectionOptions,
  AntiPatternSeverity,
  AntiPatternCategory,
} from "./types.js";
import { AntiPatternRegistry, defaultAntiPatternRegistry } from "./registry.js";

/**
 * Anti-Pattern Detector
 * Scans text content for workflow violations
 */
export class AntiPatternDetector {
  private registry: AntiPatternRegistry;

  /**
   * Create a new detector
   *
   * @param registry - Registry to use (defaults to global registry)
   */
  constructor(registry: AntiPatternRegistry = defaultAntiPatternRegistry) {
    this.registry = registry;
  }

  /**
   * Detect anti-patterns in text content
   *
   * @param content - The text content to scan
   * @param options - Detection options
   * @returns Detection result with all violations
   */
  detect(content: string, options: DetectionOptions = {}): DetectionResult {
    const {
      minSeverity = "warning",
      categories,
      includeContext = true,
      contextLines = 2,
    } = options;

    // Get patterns to check
    let patterns = this.registry.getByMinSeverity(minSeverity);

    // Filter by categories if specified
    if (categories && categories.length > 0) {
      patterns = patterns.filter((p) => categories.includes(p.category));
    }

    // Split content into lines for context extraction
    const lines = content.split("\n");

    // Find all violations
    const violations: AntiPatternMatch[] = [];

    for (const pattern of patterns) {
      const matches = this.findPatternMatches(content, pattern, lines, {
        includeContext,
        contextLines,
      });
      violations.push(...matches);
    }

    // Calculate severity counts
    const bySeverity = {
      critical: violations.filter((v) => v.pattern.severity === "critical").length,
      warning: violations.filter((v) => v.pattern.severity === "warning").length,
      info: violations.filter((v) => v.pattern.severity === "info").length,
    };

    // Calculate category counts
    const byCategory: Record<AntiPatternCategory, number> = {
      "workflow-bypass": 0,
      "file-reading": 0,
      "manual-edit": 0,
      "algorithm-local": 0,
      "status-guess": 0,
    };

    for (const violation of violations) {
      byCategory[violation.pattern.category]++;
    }

    // Generate summary
    const summary = this.generateSummary(violations, bySeverity);

    return {
      hasViolations: violations.length > 0,
      violations,
      bySeverity,
      byCategory,
      summary,
    };
  }

  /**
   * Find matches for a specific pattern
   */
  private findPatternMatches(
    content: string,
    pattern: AntiPattern,
    lines: string[],
    options: { includeContext: boolean; contextLines: number }
  ): AntiPatternMatch[] {
    const matches: AntiPatternMatch[] = [];

    // Check each detection pattern
    for (const regex of pattern.detectionPatterns) {
      const globalRegex = new RegExp(regex.source, regex.flags + (regex.flags.includes("g") ? "" : "g"));

      let match: RegExpExecArray | null;
      while ((match = globalRegex.exec(content)) !== null) {
        // Check context patterns (must all match)
        if (pattern.contextPatterns) {
          const contextMatches = pattern.contextPatterns.every((ctx) => ctx.test(content));
          if (!contextMatches) {
            continue;
          }
        }

        // Check exclude patterns (must not match)
        if (pattern.excludePatterns) {
          const excluded = pattern.excludePatterns.some((exc) => exc.test(content));
          if (excluded) {
            continue;
          }
        }

        // Find line number
        const lineNumber = this.getLineNumber(content, match.index);

        // Get context
        let context: string | undefined;
        if (options.includeContext) {
          context = this.getContext(lines, lineNumber, options.contextLines);
        }

        matches.push({
          pattern,
          matchedText: match[0],
          lineNumber,
          context,
          timestamp: new Date(),
        });
      }
    }

    return matches;
  }

  /**
   * Get line number for a position in content
   */
  private getLineNumber(content: string, position: number): number {
    const beforeMatch = content.substring(0, position);
    return beforeMatch.split("\n").length;
  }

  /**
   * Get context lines around a match
   */
  private getContext(lines: string[], lineNumber: number, contextLines: number): string {
    const startLine = Math.max(0, lineNumber - contextLines - 1);
    const endLine = Math.min(lines.length, lineNumber + contextLines);

    return lines.slice(startLine, endLine).join("\n");
  }

  /**
   * Generate a human-readable summary
   */
  private generateSummary(
    violations: AntiPatternMatch[],
    bySeverity: { critical: number; warning: number; info: number }
  ): string {
    if (violations.length === 0) {
      return "No anti-patterns detected";
    }

    const parts: string[] = [];

    if (bySeverity.critical > 0) {
      parts.push(`${bySeverity.critical} critical`);
    }
    if (bySeverity.warning > 0) {
      parts.push(`${bySeverity.warning} warning`);
    }
    if (bySeverity.info > 0) {
      parts.push(`${bySeverity.info} info`);
    }

    return `Detected ${violations.length} anti-pattern(s): ${parts.join(", ")}`;
  }

  /**
   * Detect a single pattern (for targeted checking)
   *
   * @param content - The text content to scan
   * @param patternId - The pattern ID to check
   * @returns Array of matches for that pattern
   */
  detectPattern(content: string, patternId: string): AntiPatternMatch[] {
    const pattern = this.registry.get(patternId);
    if (!pattern) {
      return [];
    }

    const lines = content.split("\n");
    return this.findPatternMatches(content, pattern, lines, {
      includeContext: true,
      contextLines: 2,
    });
  }

  /**
   * Quick check if content has any violations
   *
   * @param content - The text content to scan
   * @param minSeverity - Minimum severity to check (default: "critical")
   * @returns True if any violations found
   */
  hasViolations(content: string, minSeverity: AntiPatternSeverity = "critical"): boolean {
    const result = this.detect(content, { minSeverity });
    return result.hasViolations;
  }

  /**
   * Get the registry being used
   */
  getRegistry(): AntiPatternRegistry {
    return this.registry;
  }
}

/**
 * Default detector instance using the global registry
 */
export const defaultDetector = new AntiPatternDetector();

/**
 * Convenience function to detect anti-patterns
 *
 * @param content - The text content to scan
 * @param options - Detection options
 * @returns Detection result
 */
export function detectAntiPatterns(
  content: string,
  options?: DetectionOptions
): DetectionResult {
  return defaultDetector.detect(content, options);
}

/**
 * Convenience function for quick violation check
 *
 * @param content - The text content to scan
 * @param minSeverity - Minimum severity to check
 * @returns True if any violations found
 */
export function hasAntiPatternViolations(
  content: string,
  minSeverity?: AntiPatternSeverity
): boolean {
  return defaultDetector.hasViolations(content, minSeverity);
}
