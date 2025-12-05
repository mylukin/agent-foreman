/**
 * Shared types for verifier module
 */

import type { AutomatedCheckResult, E2ETestMode, E2ECapabilityInfo } from "../verification-types.js";
import type { TestDiscoveryResult } from "../test-discovery.js";

/**
 * Options for running automated checks
 */
export interface AutomatedCheckOptions {
  /** Verbose output */
  verbose?: boolean;
  /** Test execution mode: "full" | "quick" | "skip" */
  testMode?: "full" | "quick" | "skip";
  /** Selective test command (for quick mode) */
  selectiveTestCommand?: string | null;
  /** Test discovery result for logging */
  testDiscovery?: TestDiscoveryResult;
  /** Skip E2E tests entirely */
  skipE2E?: boolean;
  /** E2E capability info for running E2E tests */
  e2eInfo?: E2ECapabilityInfo;
  /** E2E tags for feature-based filtering */
  e2eTags?: string[];
  /**
   * E2E test execution mode (if not specified, derived from testMode and e2eTags)
   * - "full": Run all E2E tests
   * - "smoke": Run only @smoke E2E tests (default)
   * - "tags": Run E2E tests matching e2eTags
   * - "skip": Skip E2E tests entirely
   */
  e2eMode?: E2ETestMode;
  /**
   * Use ai/init.sh check instead of direct commands
   * When true, delegates all test orchestration to the generated shell script
   * which implements quick mode, selective testing, and E2E tag filtering
   */
  useInitScript?: boolean;
  /** Path to the init script (default: ai/init.sh) */
  initScriptPath?: string;
  /**
   * Run checks in parallel for faster execution
   * When true, independent checks (test, typecheck, lint, build) run concurrently
   * E2E tests always run sequentially after unit tests pass
   * Default: false for backward compatibility
   */
  parallel?: boolean;
}

/**
 * Internal type for check definition
 */
export interface CheckDefinition {
  type: AutomatedCheckResult["type"];
  command: string;
  name: string;
  isE2E?: boolean;
}

/**
 * Options for TDD verification
 */
export interface TDDVerifyOptions {
  /** Verbose output */
  verbose?: boolean;
  /** Skip E2E tests */
  skipE2E?: boolean;
  /** E2E test tags */
  e2eTags?: string[];
}
