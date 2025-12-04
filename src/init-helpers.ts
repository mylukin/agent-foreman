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
import { detectCapabilities } from "./project-capabilities.js";
import type { ExtendedCapabilities } from "./verification-types.js";
import { generateClaudeMd, generateHarnessSection } from "./prompts.js";
import { callAnyAvailableAgent, printAgentStatus } from "./agents.js";
import { appendProgressLog, createInitEntry } from "./progress-log.js";
import { debugInit } from "./debug.js";
import { getTimeout, type TimeoutKey } from "./timeout-config.js";

/**
 * Result from parsing combined AI merge response
 */
export interface CombinedMergeResult {
  initScript: string | null;
  claudeMd: string | null;
}

/**
 * Build a combined prompt for merging both init.sh and CLAUDE.md in a single AI call
 * This optimization reduces AI calls from 2 to 1 for merge operations
 */
export function buildCombinedMergePrompt(
  existingInitScript: string,
  newInitScript: string,
  existingClaudeMd: string,
  harnessSection: string
): string {
  return `You are merging two pairs of files. Return a JSON object with both merged outputs.

## Task 1: Merge ai/init.sh
### Existing ai/init.sh (USER'S VERSION - PRESERVE CUSTOMIZATIONS):
\`\`\`bash
${existingInitScript}
\`\`\`

### New template ai/init.sh:
\`\`\`bash
${newInitScript}
\`\`\`

Merge Rules for init.sh:
1. PRESERVE all user customizations in existing functions
2. ADD new functions from the template that don't exist
3. ADD new case statements for new functions
4. PRESERVE user's custom commands
5. UPDATE help text to include all commands

## Task 2: Merge CLAUDE.md
### Existing CLAUDE.md:
\`\`\`markdown
${existingClaudeMd}
\`\`\`

### New harness section to add:
\`\`\`markdown
${harnessSection}
\`\`\`

Merge Rules for CLAUDE.md:
1. If "Long-Task Harness" section exists, replace it with new section
2. If not, append at the END of the file
3. PRESERVE all existing non-harness content

## Output Format
Return ONLY a JSON object (no markdown code blocks):

{
  "initScript": "<merged bash script starting with #!/usr/bin/env bash>",
  "claudeMd": "<complete merged CLAUDE.md content>"
}`;
}

/**
 * Parse the combined merge response from AI
 * Returns null for fields that failed to parse or are invalid
 */
export function parseCombinedMergeResponse(response: string): CombinedMergeResult {
  try {
    let jsonStr = response.trim();
    // Extract JSON object if wrapped in markdown code blocks
    const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }
    const parsed = JSON.parse(jsonStr);

    return {
      initScript: parsed.initScript &&
        (parsed.initScript.startsWith("#!/usr/bin/env bash") || parsed.initScript.startsWith("#!/bin/bash"))
        ? parsed.initScript
        : null,
      claudeMd: parsed.claudeMd && typeof parsed.claudeMd === "string" && parsed.claudeMd.trim().length > 0
        ? parsed.claudeMd
        : null,
    };
  } catch {
    return { initScript: null, claudeMd: null };
  }
}

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
 */
export async function mergeOrCreateFeatures(
  cwd: string,
  survey: ReturnType<typeof aiResultToSurvey>,
  goal: string,
  mode: InitMode,
  verbose: boolean
): Promise<FeatureList> {
  // Load existing feature list or create new
  let featureList = await loadFeatureList(cwd);

  if (mode === "new" || !featureList) {
    featureList = createEmptyFeatureList(goal);
  } else {
    // Update goal if provided
    featureList.metadata.projectGoal = goal;
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

  // Use combined merge when both files exist in merge mode
  if (mode === "merge" && initScriptExists && claudeMdExists) {
    const combinedResult = await tryCombinedMerge(
      cwd,
      existingInitScript,
      existingClaudeMd,
      capabilities,
      survey,
      goal
    );

    if (combinedResult.success) {
      // Combined merge succeeded for both files
      console.log(chalk.green("✓ Updated ai/init.sh (merged by AI - your customizations preserved)"));
      console.log(chalk.green("✓ Updated CLAUDE.md (merged by AI)"));
    } else {
      // Combined merge failed, fallback to individual merges
      debugInit("Combined merge failed, falling back to individual merges");
      await generateOrMergeInitScript(cwd, capabilities, survey, mode, existingInitScript, initScriptExists);
      await updateClaudeMd(cwd, goal, existingClaudeMd, claudeMdExists);
    }
  } else {
    // Not merge mode or files don't exist - use individual operations
    await generateOrMergeInitScript(cwd, capabilities, survey, mode, existingInitScript, initScriptExists);
    await updateClaudeMd(cwd, goal, existingClaudeMd, claudeMdExists);
  }

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
    console.log(chalk.white('   git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"'));
  }
}

/**
 * Try to merge both init.sh and CLAUDE.md in a single AI call
 * Returns success if both files were successfully merged
 */
async function tryCombinedMerge(
  cwd: string,
  existingInitScript: string,
  existingClaudeMd: string,
  capabilities: ExtendedCapabilities,
  survey: ReturnType<typeof aiResultToSurvey>,
  goal: string
): Promise<{ success: boolean }> {
  console.log(chalk.blue("  Both ai/init.sh and CLAUDE.md exist, using combined AI merge..."));

  // Generate new init.sh template
  const hasCapabilities = capabilities.testCommand || capabilities.lintCommand || capabilities.buildCommand;
  const hasSurveyCommands = survey.commands.install || survey.commands.dev || survey.commands.test;
  const newInitScript = hasCapabilities || hasSurveyCommands
    ? generateInitScriptFromCapabilities(capabilities, {
        install: survey.commands.install,
        dev: survey.commands.dev,
      })
    : generateMinimalInitScript();

  // Generate new harness section
  const harnessSection = generateHarnessSection(goal);

  // Build combined prompt
  const combinedPrompt = buildCombinedMergePrompt(
    existingInitScript,
    newInitScript,
    existingClaudeMd,
    harnessSection
  );

  // Call AI with combined prompt
  const result = await callAnyAvailableAgent(combinedPrompt, {
    cwd,
    timeoutMs: getTimeout("AI_MERGE_COMBINED" as TimeoutKey),
  });

  if (!result.success || !result.output.trim()) {
    debugInit("Combined AI merge call failed");
    return { success: false };
  }

  // Parse response
  const parsed = parseCombinedMergeResponse(result.output);

  // Check if both outputs are valid
  if (!parsed.initScript || !parsed.claudeMd) {
    debugInit("Combined merge response missing or invalid for one or both files");
    return { success: false };
  }

  // Write both files
  const initScriptPath = path.join(cwd, "ai/init.sh");
  const claudeMdPath = path.join(cwd, "CLAUDE.md");

  await fs.mkdir(path.join(cwd, "ai"), { recursive: true });
  await fs.writeFile(initScriptPath, parsed.initScript + "\n");
  await fs.chmod(initScriptPath, 0o755);
  await fs.writeFile(claudeMdPath, parsed.claudeMd.trim() + "\n");

  return { success: true };
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
 * Helper: Update or create CLAUDE.md with harness section
 *
 * @param cwd - Current working directory
 * @param goal - Project goal description
 * @param preloadedContent - Optional pre-loaded existing CLAUDE.md content
 * @param preloadedExists - Optional flag indicating if pre-loaded content exists
 */
async function updateClaudeMd(
  cwd: string,
  goal: string,
  preloadedContent?: string,
  preloadedExists?: boolean
): Promise<void> {
  const claudeMdPath = path.join(cwd, "CLAUDE.md");

  // Use pre-loaded content or read from disk
  let existingClaudeMd = preloadedContent ?? "";
  let claudeMdExists = preloadedExists ?? false;

  if (preloadedContent === undefined) {
    try {
      existingClaudeMd = await fs.readFile(claudeMdPath, "utf-8");
      claudeMdExists = existingClaudeMd.trim().length > 0;
    } catch {
      debugInit("CLAUDE.md doesn't exist, will create new");
    }
  }

  if (claudeMdExists && existingClaudeMd.trim().length > 0) {
    // Use AI agent to intelligently merge harness section into existing CLAUDE.md
    console.log(chalk.blue("  CLAUDE.md exists, using AI to merge harness section..."));

    const harnessSection = generateHarnessSection(goal);
    const mergePrompt = `You are updating a CLAUDE.md file. Your task is to intelligently merge the new "Long-Task Harness" section into the existing content.

## Existing CLAUDE.md content:
\`\`\`markdown
${existingClaudeMd}
\`\`\`

## New harness section to add:
\`\`\`markdown
${harnessSection}
\`\`\`

## Rules:
1. If the existing file already has a "Long-Task Harness" section, replace it with the new section
2. If the existing file doesn't have the harness section, append it at the END of the file
3. Preserve ALL existing content that is not related to agent-foreman
4. Do NOT modify, delete, or reorganize any existing sections (like "Project Instructions", custom rules, etc.)
5. Keep the document structure clean and readable

## Output:
Return ONLY the complete merged CLAUDE.md content, nothing else. No explanations, no code blocks, just the raw markdown content.`;

    const result = await callAnyAvailableAgent(mergePrompt, {
      cwd,
      timeoutMs: getTimeout("AI_MERGE_CLAUDE_MD"),
    });

    if (result.success && result.output.trim().length > 0) {
      await fs.writeFile(claudeMdPath, result.output.trim() + "\n");
      console.log(chalk.green("✓ Updated CLAUDE.md (merged by AI)"));
    } else {
      // Simple fallback: append at the end
      console.log(chalk.yellow("  AI merge failed, appending harness section..."));
      const mergedContent = existingClaudeMd.trimEnd() + "\n\n" + harnessSection + "\n";
      await fs.writeFile(claudeMdPath, mergedContent);
      console.log(chalk.green("✓ Updated CLAUDE.md (appended)"));
    }
  } else {
    // Create new CLAUDE.md
    const claudeMd = generateClaudeMd(goal);
    await fs.writeFile(claudeMdPath, claudeMd);
    console.log(chalk.green("✓ Generated CLAUDE.md"));
  }
}
