/**
 * Analyze command - Generate AI-powered project analysis report
 */

import * as fs from "node:fs/promises";
import * as path from "node:path";
import chalk from "chalk";

import { aiScanProject, aiResultToSurvey, generateAISurveyMarkdown } from "../ai-scanner.js";
import { printAgentStatus, getAgentPriorityString } from "../agents.js";
import { scanDirectoryStructure } from "../project-scanner.js";

/**
 * Run the analyze command
 */
export async function runAnalyze(outputPath: string, verbose: boolean): Promise<void> {
  const cwd = process.cwd();

  console.log(chalk.blue(`🤖 AI-powered project analysis (priority: ${getAgentPriorityString()})`));
  if (verbose) {
    printAgentStatus();
  }

  // Note: Don't use spinner here as aiScanProject has its own progress indicators
  const aiResult = await aiScanProject(cwd, { verbose });

  if (!aiResult.success) {
    console.log(chalk.red(`✗ AI analysis failed: ${aiResult.error}`));
    console.log(chalk.yellow("  Make sure gemini, codex, or claude CLI is installed"));
    process.exit(1);
  }

  console.log(chalk.green(`✓ AI analysis successful (agent: ${aiResult.agentUsed})`));

  const structure = await scanDirectoryStructure(cwd);
  const survey = aiResultToSurvey(aiResult, structure);

  const markdown = generateAISurveyMarkdown(survey, aiResult);
  const fullPath = path.join(cwd, outputPath);

  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, markdown);

  console.log(chalk.green(`✓ Analysis written to ${outputPath}`));

  console.log(chalk.gray(`  Tech stack: ${survey.techStack.language}/${survey.techStack.framework}`));
  console.log(chalk.gray(`  Modules: ${survey.modules.length}`));
  console.log(chalk.gray(`  Features: ${survey.features.length}`));
  console.log(chalk.gray(`  Completion: ${survey.completion.overall}%`));

  if (aiResult.summary) {
    console.log(chalk.cyan("\n📝 Summary:"));
    console.log(chalk.white(`  ${aiResult.summary}`));
  }

  if (aiResult.recommendations && aiResult.recommendations.length > 0) {
    console.log(chalk.cyan("\n💡 Recommendations:"));
    aiResult.recommendations.forEach((rec, i) => {
      console.log(chalk.white(`  ${i + 1}. ${rec}`));
    });
  }
}
