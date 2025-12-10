/**
 * Helper functions for the init command
 * Extracted from runInit to improve maintainability
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import type { Feature, FeatureList, InitMode } from "./types.js";
import { loadFeatureList, createEmptyFeatureList, saveFeatureList, mergeFeatures, discoveredToFeature } from "./feature-list.js";
import { scanDirectoryStructure, isProjectEmpty } from "./project-scanner.js";
import { aiScanProject, generateFeaturesFromGoal, generateFeaturesFromSurvey, aiResultToSurvey, generateAISurveyMarkdown } from "./ai-scanner.js";
import { generateInitScript, generateMinimalInitScript, generateInitScriptFromCapabilities } from "./init-script.js";
import { detectCapabilities } from "./capabilities/index.js";
import type { ExtendedCapabilities } from "./verifier/verification-types.js";
import { generateMinimalClaudeMd } from "./prompts.js";
import { copyRulesToProject, hasRulesInstalled } from "./rules/index.js";
import { callAnyAvailableAgent, printAgentStatus } from "./agents.js";
import { appendProgressLog, createInitEntry } from "./progress-log.js";
import { debugInit } from "./debug.js";
import { getTimeout, type TimeoutKey } from "./timeout-config.js";
import { ensureComprehensiveGitignore } from "./gitignore/generator.js";
import { loadFullCache } from "./capabilities/disk-cache.js";

/**
 * Result from project detection and analysis
 */
export interface AnalysisResult {
  success: boolean;
  survey?: ReturnType<typeof aiResultToSurvey>;
  error?: string;
  agentUsed?: string;
}

/**
 * Step 1: Detect project type and analyze with AI
 * Determines feature source based on project state:
 * - If ARCHITECTURE.md exists, use it
 * - If project is empty, generate features from goal
 * - Otherwise, run AI scan to analyze existing code
 */
export async function detectAndAnalyzeProject(
  cwd: string,
  goal: string,
  verbose: boolean
): Promise<AnalysisResult> {
  const surveyPath = path.join(cwd, "docs/ARCHITECTURE.md");

  try {
    // Check for existing survey
    const surveyContent = await fs.readFile(surveyPath, "utf-8");
    console.log(chalk.green(`✓ Found ARCHITECTURE.md`));

    const aiResult = await generateFeaturesFromSurvey(surveyContent, goal);
    if (!aiResult.success) {
      return { success: false, error: aiResult.error };
    }

    const structure = await scanDirectoryStructure(cwd);
    const survey = aiResultToSurvey(aiResult, structure);

    return {
      success: true,
      survey,
      agentUsed: aiResult.agentUsed,
    };
  } catch {
    debugInit("No ARCHITECTURE.md found, checking project state...");
  }

  // No survey file - check if project has source code
  const empty = await isProjectEmpty(cwd);

  if (empty) {
    // Empty project: generate features from goal description
    console.log(chalk.gray("  New/empty project detected, generating features from goal..."));
    if (verbose) {
      printAgentStatus();
    }

    const aiResult = await generateFeaturesFromGoal(goal);
    if (!aiResult.success) {
      return { success: false, error: aiResult.error };
    }

    const structure = await scanDirectoryStructure(cwd);
    const survey = aiResultToSurvey(aiResult, structure);

    return {
      success: true,
      survey,
      agentUsed: aiResult.agentUsed,
    };
  }

  // Has source code: auto-run survey first, then use it
  console.log(chalk.gray("  No ARCHITECTURE.md found, auto-generating..."));
  if (verbose) {
    printAgentStatus();
  }

  const aiResult = await aiScanProject(cwd, { verbose });

  if (!aiResult.success) {
    return { success: false, error: aiResult.error };
  }

  // Auto-save survey for future use
  const tempStructure = await scanDirectoryStructure(cwd);
  const tempSurvey = aiResultToSurvey(aiResult, tempStructure);
  const surveyMarkdown = generateAISurveyMarkdown(tempSurvey, aiResult);

  await fs.mkdir(path.dirname(surveyPath), { recursive: true });
  await fs.writeFile(surveyPath, surveyMarkdown);
  console.log(chalk.green(`✓ Auto-generated docs/ARCHITECTURE.md`));

  const structure = await scanDirectoryStructure(cwd);
  const survey = aiResultToSurvey(aiResult, structure);

  return {
    success: true,
    survey,
    agentUsed: aiResult.agentUsed,
  };
}

/**
 * Step 2-4: Merge or create features based on mode
 * - Loads existing feature list (if any)
 * - Converts discovered features to Feature objects
 * - Merges or replaces based on mode
 *
 * @param tddMode - Optional TDD enforcement mode (strict/recommended/disabled)
 */
export async function mergeOrCreateFeatures(
  cwd: string,
  survey: ReturnType<typeof aiResultToSurvey>,
  goal: string,
  mode: InitMode,
  verbose: boolean,
  tddMode?: "strict" | "recommended" | "disabled"
): Promise<FeatureList> {
  // Load existing feature list or create new
  let featureList = await loadFeatureList(cwd);

  if (mode === "new" || !featureList) {
    featureList = createEmptyFeatureList(goal, tddMode);
  } else {
    // Update goal if provided
    featureList.metadata.projectGoal = goal;
    // Update tddMode if provided
    if (tddMode) {
      featureList.metadata.tddMode = tddMode;
    }
  }

  // Convert discovered features to Feature objects
  const discoveredFeatures: Feature[] = survey.features.map((df, idx) =>
    discoveredToFeature(df, idx)
  );

  // Merge or replace based on mode
  if (mode === "merge") {
    const beforeCount = featureList.features.length;
    featureList.features = mergeFeatures(featureList.features, discoveredFeatures);
    const addedCount = featureList.features.length - beforeCount;
    if (verbose && addedCount > 0) {
      console.log(chalk.gray(`  Added ${addedCount} new features`));
    }
  } else if (mode === "new") {
    featureList.features = discoveredFeatures;
  }
  // mode === "scan" doesn't modify the list

  // Save feature list
  if (mode !== "scan") {
    await saveFeatureList(cwd, featureList);
    console.log(chalk.green(`✓ Feature list saved with ${featureList.features.length} features`));
  } else {
    console.log(chalk.yellow(`ℹ Scan mode: ${discoveredFeatures.length} features discovered (not saved)`));
  }

  return featureList;
}

/**
 * Step 6-8: Generate harness files (init.sh, CLAUDE.md, progress.log)
 *
 * IMPORTANT: This function now runs capabilities detection FIRST to ensure
 * init.sh uses the same commands that verification will use (single source of truth).
 *
 * OPTIMIZATION: In merge mode, when both init.sh and CLAUDE.md exist, uses a
 * combined AI call to merge both files at once (reducing 2 AI calls to 1).
 */
export async function generateHarnessFiles(
  cwd: string,
  survey: ReturnType<typeof aiResultToSurvey>,
  featureList: FeatureList,
  goal: string,
  mode: InitMode
): Promise<void> {
  // Step 6a: Detect project capabilities (creates ai/capabilities.json)
  // This ensures init.sh uses the SAME commands as verification
  console.log(chalk.gray("  Detecting project capabilities..."));
  const capabilities = await detectCapabilities(cwd, { force: true, verbose: false });
  console.log(chalk.green("✓ Capabilities detected and cached"));

  // Step 6b: Ensure comprehensive .gitignore exists
  if (mode !== "scan") {
    const cache = await loadFullCache(cwd);
    const configFiles = cache?.trackedFiles || [];

    const gitignoreResult = await ensureComprehensiveGitignore(
      cwd,
      configFiles,
      capabilities.languages || [],
      { bundledOnly: false }
    );

    if (gitignoreResult.action === "created") {
      const templateInfo = gitignoreResult.templates?.length
        ? ` (using ${gitignoreResult.templates.join(", ")} templates)`
        : "";
      console.log(chalk.green(`✓ Generated .gitignore${templateInfo}`));
    } else if (gitignoreResult.action === "updated") {
      console.log(chalk.green("✓ Updated .gitignore (added missing patterns)"));
    }
    // If skipped, no message needed
  }

  // Check if we can use combined merge optimization
  const initScriptPath = path.join(cwd, "ai/init.sh");
  const claudeMdPath = path.join(cwd, "CLAUDE.md");

  let existingInitScript = "";
  let existingClaudeMd = "";
  let initScriptExists = false;
  let claudeMdExists = false;

  try {
    existingInitScript = await fs.readFile(initScriptPath, "utf-8");
    initScriptExists = existingInitScript.trim().length > 0;
  } catch {
    debugInit("ai/init.sh doesn't exist");
  }

  try {
    existingClaudeMd = await fs.readFile(claudeMdPath, "utf-8");
    claudeMdExists = existingClaudeMd.trim().length > 0;
  } catch {
    debugInit("CLAUDE.md doesn't exist");
  }

  // Generate/merge init.sh (still uses AI for merge mode if needed)
  await generateOrMergeInitScript(cwd, capabilities, survey, mode, existingInitScript, initScriptExists);

  // Setup Claude rules using the NEW static file approach
  // This replaces the old AI merge approach for CLAUDE.md
  const forceRules = mode === "new";
  await setupClaudeRules(cwd, goal, forceRules);

  // Write progress log entry
  if (mode !== "scan") {
    await appendProgressLog(
      cwd,
      createInitEntry(goal, `mode=${mode}, features=${featureList.features.length}`)
    );
    console.log(chalk.green("✓ Updated ai/progress.log"));
  }

  // Suggest git commit
  if (mode !== "scan") {
    console.log(chalk.cyan("\n📝 Suggested git commit:"));
    console.log(chalk.white('   git add ai/ .claude/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"'));
  }
}

/**
 * Helper: Generate or merge init.sh script
 * In merge mode, uses AI to intelligently merge user customizations with new template
 *
 * @param cwd - Current working directory
 * @param capabilities - Detected capabilities (used for test/lint/build/typecheck commands)
 * @param survey - Survey results (used as fallback for install/dev commands)
 * @param mode - Init mode (new, merge, scan)
 * @param preloadedScript - Optional pre-loaded existing script content
 * @param preloadedExists - Optional flag indicating if pre-loaded script exists
 */
async function generateOrMergeInitScript(
  cwd: string,
  capabilities: ExtendedCapabilities,
  survey: ReturnType<typeof aiResultToSurvey>,
  mode: InitMode,
  preloadedScript?: string,
  preloadedExists?: boolean
): Promise<void> {
  const initScriptPath = path.join(cwd, "ai/init.sh");

  // Generate new init.sh template using capabilities (primary) with survey fallback for install/dev
  const hasCapabilities = capabilities.testCommand || capabilities.lintCommand || capabilities.buildCommand;
  const hasSurveyCommands = survey.commands.install || survey.commands.dev || survey.commands.test;

  const newInitScript = hasCapabilities || hasSurveyCommands
    ? generateInitScriptFromCapabilities(capabilities, {
        install: survey.commands.install,
        dev: survey.commands.dev,
      })
    : generateMinimalInitScript();

  await fs.mkdir(path.join(cwd, "ai"), { recursive: true });

  // Use pre-loaded content or read from disk
  let existingScript = preloadedScript ?? "";
  let existingScriptExists = preloadedExists ?? false;

  if (preloadedScript === undefined) {
    try {
      existingScript = await fs.readFile(initScriptPath, "utf-8");
      existingScriptExists = existingScript.trim().length > 0;
    } catch {
      debugInit("ai/init.sh doesn't exist, will create new");
    }
  }

  // If merge mode and existing script exists, use AI to merge
  if (mode === "merge" && existingScriptExists && existingScript.trim().length > 0) {
    console.log(chalk.blue("  ai/init.sh exists, using AI to merge your customizations..."));

    const mergePrompt = `You are merging two bash scripts. The user has customized their ai/init.sh script, and we have a new template with potentially new features or commands.

## Existing ai/init.sh (USER'S CUSTOMIZED VERSION - PRESERVE THEIR CHANGES):
\`\`\`bash
${existingScript}
\`\`\`

## New template ai/init.sh (MAY CONTAIN NEW FEATURES):
\`\`\`bash
${newInitScript}
\`\`\`

## Merge Rules (CRITICAL - FOLLOW EXACTLY):
1. **PRESERVE all user customizations** in existing functions (bootstrap, dev, check, build, status, etc.)
2. **ADD new functions** from the template that don't exist in the user's version
3. **ADD new case statements** in the main entry point for any new functions
4. **PRESERVE user's custom commands** - if user changed "npm install" to "pnpm install", keep their change
5. **PRESERVE user's custom functions** - if user added their own functions, keep them
6. **UPDATE the help text** to include any new commands
7. **DO NOT replace** user's working commands with template defaults
8. **MAINTAIN bash script validity** - ensure the output is a valid executable bash script

## Merge Strategy:
- For each function in the existing script: KEEP the user's version
- For each function in the new template that's NOT in existing: ADD it
- For the case statement: MERGE (keep existing cases, add new ones)
- For show_help: UPDATE to list all available commands

## Output:
Return ONLY the merged bash script content. No explanations, no markdown code blocks, just the raw bash script starting with #!/usr/bin/env bash`;

    const result = await callAnyAvailableAgent(mergePrompt, {
      cwd,
      timeoutMs: getTimeout("AI_MERGE_INIT_SCRIPT"),
    });

    if (result.success && result.output.trim().length > 0) {
      // Validate the output looks like a bash script
      const mergedScript = result.output.trim();
      if (mergedScript.startsWith("#!/usr/bin/env bash") || mergedScript.startsWith("#!/bin/bash")) {
        await fs.writeFile(initScriptPath, mergedScript + "\n");
        await fs.chmod(initScriptPath, 0o755);
        console.log(chalk.green("✓ Updated ai/init.sh (merged by AI - your customizations preserved)"));
        return;
      } else {
        console.log(chalk.yellow("  AI merge output doesn't look like a valid bash script, falling back..."));
      }
    } else {
      console.log(chalk.yellow("  AI merge failed, keeping your existing ai/init.sh unchanged"));
      console.log(chalk.gray("  (Run with --mode new to force regeneration)"));
      return; // Keep existing script unchanged
    }
  }

  // New mode or no existing script: write new template
  await fs.writeFile(initScriptPath, newInitScript);
  await fs.chmod(initScriptPath, 0o755);
  console.log(chalk.green("✓ Generated ai/init.sh"));
}

/**
 * Helper: Setup Claude rules files in .claude/rules/ directory
 *
 * This is the NEW approach that copies static rule files instead of generating
 * a monolithic harness section. Claude Code automatically loads all .md files
 * from .claude/rules/ as project memory.
 *
 * @param cwd - Current working directory
 * @param goal - Project goal description
 * @param force - Force overwrite existing rule files
 */
async function setupClaudeRules(
  cwd: string,
  goal: string,
  force: boolean = false
): Promise<void> {
  const claudeMdPath = path.join(cwd, "CLAUDE.md");

  // Step 1: Copy rule template files to .claude/rules/
  const rulesResult = await copyRulesToProject(cwd, { force });

  if (rulesResult.created > 0) {
    console.log(chalk.green(`✓ Created ${rulesResult.created} rule files in .claude/rules/`));
  }
  if (rulesResult.skipped > 0 && !force) {
    console.log(chalk.gray(`  Skipped ${rulesResult.skipped} existing rule files (use --force to overwrite)`));
  }

  // Step 2: Create or update CLAUDE.md with minimal content (just project goal)
  let existingClaudeMd = "";
  let claudeMdExists = false;

  try {
    existingClaudeMd = await fs.readFile(claudeMdPath, "utf-8");
    claudeMdExists = existingClaudeMd.trim().length > 0;
  } catch {
    debugInit("CLAUDE.md doesn't exist, will create new");
  }

  if (claudeMdExists) {
    // Check if existing CLAUDE.md already has a harness section (legacy)
    const hasHarnessSection = existingClaudeMd.includes("## Long-Task Harness") ||
                              existingClaudeMd.includes("# Long-Task Harness");

    if (hasHarnessSection) {
      // Legacy file with harness section - leave it alone, rules in .claude/rules/ take precedence
      console.log(chalk.gray("  CLAUDE.md already has harness section (legacy), rules loaded from .claude/rules/"));
    } else {
      // No harness section - check if it has project goal
      const hasProjectGoal = existingClaudeMd.includes("## Project Goal") ||
                             existingClaudeMd.includes("# Project Goal");

      if (!hasProjectGoal) {
        // Append minimal project goal section
        const goalSection = `\n## Project Goal\n\n${goal}\n`;
        await fs.writeFile(claudeMdPath, existingClaudeMd.trimEnd() + goalSection);
        console.log(chalk.green("✓ Updated CLAUDE.md (added project goal)"));
      } else {
        console.log(chalk.gray("  CLAUDE.md already configured"));
      }
    }
  } else {
    // Create new minimal CLAUDE.md
    const claudeMd = generateMinimalClaudeMd(goal);
    await fs.writeFile(claudeMdPath, claudeMd);
    console.log(chalk.green("✓ Generated CLAUDE.md"));
  }
}

