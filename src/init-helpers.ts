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
 * Step 6-8: Generate harness files (init.sh, CLAUDE.md, progress.md)
 */
export async function generateHarnessFiles(
  cwd: string,
  survey: ReturnType<typeof aiResultToSurvey>,
  featureList: FeatureList,
  goal: string,
  mode: InitMode
): Promise<void> {
  // Generate init.sh
  const initScript =
    survey.commands.install || survey.commands.dev || survey.commands.test
      ? generateInitScript(survey.commands)
      : generateMinimalInitScript();

  await fs.mkdir(path.join(cwd, "ai"), { recursive: true });
  await fs.writeFile(path.join(cwd, "ai/init.sh"), initScript);
  await fs.chmod(path.join(cwd, "ai/init.sh"), 0o755);
  console.log(chalk.green("✓ Generated ai/init.sh"));

  // Generate or update CLAUDE.md
  await updateClaudeMd(cwd, goal);

  // Write progress log entry
  if (mode !== "scan") {
    await appendProgressLog(
      cwd,
      createInitEntry(goal, `mode=${mode}, features=${featureList.features.length}`)
    );
    console.log(chalk.green("✓ Updated ai/progress.md"));
  }

  // Suggest git commit
  if (mode !== "scan") {
    console.log(chalk.cyan("\n📝 Suggested git commit:"));
    console.log(chalk.white('   git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"'));
  }
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

    const result = await callAnyAvailableAgent(mergePrompt, { cwd });

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
