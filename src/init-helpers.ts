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
import { generateInitScript, generateMinimalInitScript } from "./init-script.js";
import { generateClaudeMd, generateHarnessSection } from "./prompts.js";
import { callAnyAvailableAgent, printAgentStatus } from "./agents.js";
import { appendProgressLog, createInitEntry } from "./progress-log.js";
import { debugInit } from "./debug.js";
import { getTimeout } from "./timeout-config.js";

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
 * - If PROJECT_SURVEY.md exists, use it
 * - If project is empty, generate features from goal
 * - Otherwise, run AI scan to analyze existing code
 */
export async function detectAndAnalyzeProject(
  cwd: string,
  goal: string,
  verbose: boolean
): Promise<AnalysisResult> {
  const surveyPath = path.join(cwd, "docs/PROJECT_SURVEY.md");

  try {
    // Check for existing survey
    const surveyContent = await fs.readFile(surveyPath, "utf-8");
    console.log(chalk.green(`✓ Found PROJECT_SURVEY.md`));

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
    debugInit("No PROJECT_SURVEY.md found, checking project state...");
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
  console.log(chalk.gray("  No PROJECT_SURVEY.md found, auto-generating survey..."));
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
  console.log(chalk.green(`✓ Auto-generated docs/PROJECT_SURVEY.md`));

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
 */
export async function generateHarnessFiles(
  cwd: string,
  survey: ReturnType<typeof aiResultToSurvey>,
  featureList: FeatureList,
  goal: string,
  mode: InitMode
): Promise<void> {
  // Generate init.sh (with AI merge support in merge mode)
  await generateOrMergeInitScript(cwd, survey, mode);

  // Generate or update CLAUDE.md
  await updateClaudeMd(cwd, goal);

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
 * Helper: Generate or merge init.sh script
 * In merge mode, uses AI to intelligently merge user customizations with new template
 */
async function generateOrMergeInitScript(
  cwd: string,
  survey: ReturnType<typeof aiResultToSurvey>,
  mode: InitMode
): Promise<void> {
  const initScriptPath = path.join(cwd, "ai/init.sh");

  // Generate new init.sh template
  const newInitScript =
    survey.commands.install || survey.commands.dev || survey.commands.test
      ? generateInitScript(survey.commands)
      : generateMinimalInitScript();

  await fs.mkdir(path.join(cwd, "ai"), { recursive: true });

  // Check if existing init.sh exists
  let existingScript = "";
  let existingScriptExists = false;

  try {
    existingScript = await fs.readFile(initScriptPath, "utf-8");
    existingScriptExists = true;
  } catch {
    debugInit("ai/init.sh doesn't exist, will create new");
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
 */
async function updateClaudeMd(cwd: string, goal: string): Promise<void> {
  const claudeMdPath = path.join(cwd, "CLAUDE.md");
  let claudeMdExists = false;
  let existingClaudeMd = "";

  try {
    existingClaudeMd = await fs.readFile(claudeMdPath, "utf-8");
    claudeMdExists = true;
  } catch {
    debugInit("CLAUDE.md doesn't exist, will create new");
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
