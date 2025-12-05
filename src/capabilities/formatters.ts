/**
 * Display formatting functions for capabilities
 */

import type { VerificationCapabilities, ExtendedCapabilities } from "../verification-types.js";

/**
 * Format capabilities for display (legacy format)
 */
export function formatCapabilities(caps: VerificationCapabilities): string {
  const lines: string[] = [];

  if (caps.hasTests) {
    lines.push(`  Tests: ${caps.testFramework} (${caps.testCommand})`);
  } else {
    lines.push("  Tests: Not detected");
  }

  if (caps.hasTypeCheck) {
    lines.push(`  Type Check: ${caps.typeCheckCommand}`);
  } else {
    lines.push("  Type Check: Not detected");
  }

  if (caps.hasLint) {
    lines.push(`  Lint: ${caps.lintCommand}`);
  } else {
    lines.push("  Lint: Not detected");
  }

  if (caps.hasBuild) {
    lines.push(`  Build: ${caps.buildCommand}`);
  } else {
    lines.push("  Build: Not detected");
  }

  lines.push(`  Git: ${caps.hasGit ? "Available" : "Not available"}`);

  return lines.join("\n");
}

/**
 * Format extended capabilities for display
 */
export function formatExtendedCapabilities(caps: ExtendedCapabilities): string {
  const lines: string[] = [];

  lines.push(`  Source: ${caps.source}`);
  lines.push(`  Confidence: ${(caps.confidence * 100).toFixed(0)}%`);
  lines.push(`  Languages: ${caps.languages.join(", ") || "Unknown"}`);
  lines.push("");

  if (caps.testInfo?.available) {
    lines.push(`  Tests: ${caps.testInfo.framework || "custom"} (${caps.testInfo.command})`);
  } else {
    lines.push("  Tests: Not detected");
  }

  if (caps.e2eInfo?.available) {
    lines.push(`  E2E: ${caps.e2eInfo.framework || "custom"} (${caps.e2eInfo.command})`);
  } else {
    lines.push("  E2E: Not detected");
  }

  if (caps.typeCheckInfo?.available) {
    lines.push(`  Type Check: ${caps.typeCheckInfo.command}`);
  } else {
    lines.push("  Type Check: Not detected");
  }

  if (caps.lintInfo?.available) {
    lines.push(`  Lint: ${caps.lintInfo.command}`);
  } else {
    lines.push("  Lint: Not detected");
  }

  if (caps.buildInfo?.available) {
    lines.push(`  Build: ${caps.buildInfo.command}`);
  } else {
    lines.push("  Build: Not detected");
  }

  lines.push(`  Git: ${caps.hasGit ? "Available" : "Not available"}`);

  return lines.join("\n");
}
