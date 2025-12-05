/**
 * Scan command - Detect or refresh project verification capabilities
 */

import chalk from "chalk";

import { detectCapabilities, formatExtendedCapabilities } from "../capabilities/index.js";
import { createSpinner } from "../progress.js";

/**
 * Run the scan command
 */
export async function runScan(
  force: boolean,
  verbose: boolean
): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.blue("🔍 Scanning project capabilities..."));

  if (force) {
    console.log(chalk.gray("   (forcing re-detection, ignoring cache)"));
  }

  const spinner = createSpinner("Scanning capabilities");

  try {
    const capabilities = await detectCapabilities(cwd, {
      force,
      verbose,
    });

    spinner.succeed("Scan complete");
    console.log(formatExtendedCapabilities(capabilities));

    // Show custom rules if any
    if (capabilities.customRules && capabilities.customRules.length > 0) {
      console.log(chalk.blue("\n  Custom Rules:"));
      for (const rule of capabilities.customRules) {
        console.log(chalk.white(`    ${rule.id}: ${rule.description}`));
        console.log(chalk.gray(`      Command: ${rule.command}`));
      }
    }

    // Show cache info
    console.log(chalk.gray(`\n  Detected at: ${capabilities.detectedAt}`));
    console.log(chalk.gray(`  Cache: ai/capabilities.json`));
  } catch (error) {
    spinner.fail(`Scan failed: ${(error as Error).message}`);
    process.exit(1);
  }
}
