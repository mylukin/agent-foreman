/**
 * Anti-Pattern Registry
 * Manages a collection of anti-patterns for detection
 */

import type { AntiPattern, AntiPatternCategory, AntiPatternSeverity } from "./types.js";

/**
 * Registry for anti-patterns
 * Provides registration, lookup, and filtering of patterns
 */
export class AntiPatternRegistry {
  private patterns: Map<string, AntiPattern> = new Map();

  /**
   * Register an anti-pattern
   *
   * @param pattern - The pattern to register
   * @throws Error if pattern with same ID already exists
   */
  register(pattern: AntiPattern): void {
    if (this.patterns.has(pattern.id)) {
      throw new Error(`Anti-pattern with ID '${pattern.id}' already registered`);
    }
    this.patterns.set(pattern.id, pattern);
  }

  /**
   * Register multiple anti-patterns
   *
   * @param patterns - Array of patterns to register
   */
  registerAll(patterns: AntiPattern[]): void {
    for (const pattern of patterns) {
      this.register(pattern);
    }
  }

  /**
   * Get a pattern by ID
   *
   * @param id - The pattern ID
   * @returns The pattern or undefined if not found
   */
  get(id: string): AntiPattern | undefined {
    return this.patterns.get(id);
  }

  /**
   * Check if a pattern is registered
   *
   * @param id - The pattern ID
   * @returns True if pattern is registered
   */
  has(id: string): boolean {
    return this.patterns.has(id);
  }

  /**
   * Get all registered patterns
   *
   * @returns Array of all patterns
   */
  getAll(): AntiPattern[] {
    return Array.from(this.patterns.values());
  }

  /**
   * Get patterns by category
   *
   * @param category - The category to filter by
   * @returns Array of patterns in that category
   */
  getByCategory(category: AntiPatternCategory): AntiPattern[] {
    return this.getAll().filter((p) => p.category === category);
  }

  /**
   * Get patterns by severity
   *
   * @param severity - The severity to filter by
   * @returns Array of patterns with that severity
   */
  getBySeverity(severity: AntiPatternSeverity): AntiPattern[] {
    return this.getAll().filter((p) => p.severity === severity);
  }

  /**
   * Get patterns at or above a minimum severity
   *
   * @param minSeverity - The minimum severity
   * @returns Array of patterns at or above that severity
   */
  getByMinSeverity(minSeverity: AntiPatternSeverity): AntiPattern[] {
    const severityOrder: AntiPatternSeverity[] = ["critical", "warning", "info"];
    const minIndex = severityOrder.indexOf(minSeverity);

    return this.getAll().filter((p) => {
      const patternIndex = severityOrder.indexOf(p.severity);
      return patternIndex <= minIndex;
    });
  }

  /**
   * Get count of registered patterns
   *
   * @returns Number of patterns
   */
  get size(): number {
    return this.patterns.size;
  }

  /**
   * Remove a pattern by ID
   *
   * @param id - The pattern ID to remove
   * @returns True if pattern was removed, false if not found
   */
  remove(id: string): boolean {
    return this.patterns.delete(id);
  }

  /**
   * Clear all patterns (mainly for testing)
   */
  clear(): void {
    this.patterns.clear();
  }

  /**
   * Get all pattern IDs
   *
   * @returns Array of pattern IDs
   */
  getIds(): string[] {
    return Array.from(this.patterns.keys());
  }
}

/**
 * Default anti-pattern registry instance
 * Use this for production code, patterns are registered here automatically
 */
export const defaultAntiPatternRegistry = new AntiPatternRegistry();
