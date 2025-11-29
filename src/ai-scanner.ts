/**
 * AI-powered project scanner
 * Uses autonomous AI agents (Claude/Gemini/Codex) to explore and analyze codebases
 *
 * Key principle: The agent explores the project itself using its own tools,
 * rather than us collecting context and passing it to the agent.
 */
import chalk from "chalk";
import { callAnyAvailableAgent, checkAvailableAgents } from "./agents.js";
import type {
  ProjectSurvey,
  TechStackInfo,
  DirectoryStructure,
  ModuleInfo,
  DiscoveredFeature,
  CompletionAssessment,
  ProjectCommands,
} from "./types.js";

/**
 * AI analysis result
 */
export interface AIAnalysisResult {
  success: boolean;
  techStack?: TechStackInfo;
  modules?: ModuleInfo[];
  features?: DiscoveredFeature[];
  completion?: CompletionAssessment;
  commands?: ProjectCommands;
  summary?: string;
  recommendations?: string[];
  error?: string;
  agentUsed?: string;
}

/**
 * Options for AI scanning
 */
export interface AIScanOptions {
  verbose?: boolean;
}

/**
 * Build autonomous exploration prompt for AI agent
 * The agent explores the project using its available tools
 */
function buildAutonomousPrompt(projectPath: string): string {
  return `Perform a comprehensive survey of the software project located at: ${projectPath}

You are currently working in this directory. Explore it thoroughly using your available tools.

## Required Actions

1. **Explore structure**: List directories and files to understand the project layout
2. **Read configs**: Find and read configuration files (package.json, tsconfig.json, pyproject.toml, go.mod, Cargo.toml, etc.)
3. **Examine ALL source code**: Read EVERY source file to understand modules and features thoroughly
4. **Check tests**: Look for test files to understand what functionality exists
5. **Assess completeness**: Based on code quality and test coverage

## Feature Discovery Guidelines

IMPORTANT: Be extremely thorough when discovering features. Examine EVERY source file and extract ALL distinct capabilities. Look for:
- CLI commands and subcommands
- API endpoints (routes, handlers)
- ALL exported functions and classes (each is a feature)
- ALL internal utility functions with distinct functionality
- Database models and CRUD operations
- Configuration options and settings
- Plugin/extension points
- Event handlers and hooks
- Middleware and interceptors
- Type definitions and interfaces that represent domain concepts

Do NOT limit the number of features. Extract every distinct capability you find in the codebase.

## Output

Return ONLY a JSON object (no markdown, no explanation):

{
  "techStack": {
    "language": "primary language",
    "framework": "main framework or 'none'",
    "buildTool": "build tool",
    "testFramework": "test framework",
    "packageManager": "package manager"
  },
  "modules": [
    {
      "name": "module name",
      "path": "relative path",
      "description": "what this module does",
      "status": "complete|partial|stub"
    }
  ],
  "features": [
    {
      "id": "module.feature.action",
      "description": "what this feature does",
      "module": "parent module",
      "source": "route|test|code|config|inferred",
      "confidence": 0.8
    }
  ],
  "completion": {
    "overall": 0-100,
    "notes": ["observations"]
  },
  "commands": {
    "install": "install command",
    "dev": "dev command",
    "build": "build command",
    "test": "test command"
  },
  "summary": "2-3 sentences describing what this project is and does",
  "recommendations": ["improvement suggestions"]
}

Begin exploration now.`;
}

/**
 * Parse AI response to extract analysis
 */
function parseAIResponse(response: string): AIAnalysisResult {
  try {
    // Try to extract JSON from the response
    let jsonStr = response.trim();

    // Remove markdown code blocks if present
    const jsonMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    // Try to find JSON object
    const objectMatch = jsonStr.match(/\{[\s\S]*\}/);
    if (objectMatch) {
      jsonStr = objectMatch[0];
    }

    const parsed = JSON.parse(jsonStr);

    return {
      success: true,
      techStack: parsed.techStack,
      modules: parsed.modules || [],
      features: parsed.features || [],
      completion: parsed.completion,
      commands: parsed.commands,
      summary: parsed.summary,
      recommendations: parsed.recommendations || [],
    };
  } catch (err) {
    return {
      success: false,
      error: `Failed to parse AI response: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Perform AI-powered project scan using autonomous exploration
 *
 * The agent explores the project itself using its own tools,
 * rather than us collecting context and passing it to the agent.
 *
 * Priority order: Codex > Gemini > Claude
 */
export async function aiScanProject(
  basePath: string,
  options: AIScanOptions = {}
): Promise<AIAnalysisResult> {
  const { verbose = false } = options;

  // Check if any AI agent is available
  const agents = checkAvailableAgents();
  const hasAgent = agents.some((a) => a.available);

  if (!hasAgent) {
    return {
      success: false,
      error: "No AI agents available. Install gemini, codex, or claude CLI.",
    };
  }

  // Build autonomous exploration prompt
  console.log(chalk.gray("  [1/2] Preparing autonomous exploration..."));
  const prompt = buildAutonomousPrompt(basePath);

  if (verbose) {
    console.log(chalk.gray(`        Project path: ${basePath}`));
  }

  // Launch agent - it will explore the project autonomously
  console.log(chalk.gray("  [2/2] Agent exploring project..."));

  const result = await callAnyAvailableAgent(prompt, {
    preferredOrder: ["codex", "gemini", "claude"],
    verbose,
    cwd: basePath, // Run agent in project directory so it can explore
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  // Parse the exploration results
  process.stdout.write(chalk.gray("  [✓] Parsing exploration results..."));
  const analysis = parseAIResponse(result.output);
  console.log(chalk.green(" done"));

  if (analysis.success) {
    analysis.agentUsed = result.agentUsed;
  }

  return analysis;
}

/**
 * Generate features from existing PROJECT_SURVEY.md + goal
 * Much faster than full scan since it reuses existing survey
 */
export async function generateFeaturesFromSurvey(
  surveyContent: string,
  goal: string
): Promise<AIAnalysisResult> {
  const prompt = `You are an expert software architect. Based on the following project survey document and project goal, extract and generate a feature list.

## Project Goal
${goal}

## Project Survey Document
${surveyContent}

Based on this survey, respond with a JSON object (ONLY JSON, no markdown code blocks):

{
  "techStack": {
    "language": "from survey",
    "framework": "from survey",
    "buildTool": "from survey",
    "testFramework": "from survey",
    "packageManager": "from survey"
  },
  "modules": [
    {
      "name": "module name from survey",
      "path": "relative path",
      "description": "description",
      "status": "complete|partial|stub"
    }
  ],
  "features": [
    {
      "id": "hierarchical.feature.id",
      "description": "what this feature does",
      "module": "parent module name",
      "source": "survey",
      "confidence": 0.9
    }
  ],
  "completion": {
    "overall": 65,
    "notes": ["from survey"]
  },
  "commands": {
    "install": "from survey",
    "dev": "from survey",
    "build": "from survey",
    "test": "from survey"
  },
  "summary": "from survey",
  "recommendations": ["from survey"]
}

Extract all information directly from the survey document. Generate feature IDs using hierarchical naming (module.submodule.action).`;

  console.log(chalk.gray("  Generating features from survey..."));

  const result = await callAnyAvailableAgent(prompt, {
    preferredOrder: ["codex", "gemini", "claude"],
    verbose: true,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  const analysis = parseAIResponse(result.output);
  if (analysis.success) {
    analysis.agentUsed = result.agentUsed;
  }

  return analysis;
}

/**
 * Generate features from goal description for new/empty projects
 * Used when there is no existing code to scan
 */
export async function generateFeaturesFromGoal(
  goal: string
): Promise<AIAnalysisResult> {
  const prompt = `You are an expert software architect. Based on the following project goal, generate an initial feature list for a brand new project.

## Project Goal
${goal}

Generate a comprehensive feature list for building this project from scratch. Think about:
1. Core functionality required to achieve the goal
2. Common supporting features (auth, config, error handling, etc. if relevant)
3. Developer experience features (CLI, API, etc. if relevant)
4. Testing and documentation needs

Respond with a JSON object (ONLY JSON, no markdown code blocks):

{
  "techStack": {
    "language": "recommended primary language",
    "framework": "recommended framework (or 'none')",
    "buildTool": "recommended build tool",
    "testFramework": "recommended test framework",
    "packageManager": "recommended package manager"
  },
  "modules": [
    {
      "name": "module name",
      "path": "suggested relative path",
      "description": "what this module handles",
      "status": "stub"
    }
  ],
  "features": [
    {
      "id": "hierarchical.feature.id",
      "description": "what this feature does - specific and testable",
      "module": "parent module name",
      "source": "goal",
      "confidence": 0.8
    }
  ],
  "completion": {
    "overall": 0,
    "notes": ["Project not yet started - features generated from goal"]
  },
  "commands": {
    "install": "suggested install command",
    "dev": "suggested dev command",
    "build": "suggested build command",
    "test": "suggested test command"
  },
  "summary": "Brief description of what will be built",
  "recommendations": [
    "Start with feature X first",
    "Consider Y for architecture"
  ]
}

Guidelines:
1. Generate 10-20 features that cover the full scope of the goal
2. Use hierarchical IDs: module.submodule.action (e.g., auth.user.login, api.orders.create)
3. Each feature should be specific enough to be implemented and tested independently
4. Order features by logical dependency (foundational features first)
5. All features start with status "failing" (will be set by the calling code)
6. Recommend a reasonable tech stack based on the goal (don't over-engineer)`;

  console.log(chalk.gray("  Generating features from goal description..."));

  const result = await callAnyAvailableAgent(prompt, {
    preferredOrder: ["codex", "gemini", "claude"],
    verbose: true,
  });

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    };
  }

  const analysis = parseAIResponse(result.output);
  if (analysis.success) {
    analysis.agentUsed = result.agentUsed;
  }

  return analysis;
}

/**
 * Convert AI analysis result to ProjectSurvey format
 */
export function aiResultToSurvey(
  result: AIAnalysisResult,
  structure: DirectoryStructure
): ProjectSurvey {
  const defaultTechStack: TechStackInfo = {
    language: "unknown",
    framework: "unknown",
    buildTool: "unknown",
    testFramework: "unknown",
    packageManager: "unknown",
  };

  const defaultCommands: ProjectCommands = {
    install: "",
    dev: "",
    build: "",
    test: "",
  };

  return {
    techStack: result.techStack || defaultTechStack,
    structure,
    modules: result.modules || [],
    features: result.features || [],
    completion: result.completion || { overall: 0, byModule: {}, notes: [] },
    commands: result.commands || defaultCommands,
  };
}

/**
 * Options for generating survey markdown
 */
export interface SurveyMarkdownOptions {
  /** Include inline Chinese translations (legacy bilingual format) */
  bilingual?: boolean;
  /** Generate for a specific language ("en" or "zh-CN") */
  language?: "en" | "zh-CN";
}

/**
 * Strip inline Chinese translations from text
 * Removes lines starting with ">" that contain Chinese characters
 */
function stripChineseTranslations(text: string): string {
  return text
    .split("\n")
    .filter((line) => {
      // Keep the line if it's not a blockquote with Chinese
      if (!line.startsWith(">")) return true;
      // Check if line contains Chinese characters (CJK Unified Ideographs)
      const hasChinese = /[\u4e00-\u9fff]/.test(line);
      // Check if it's the "Analyzed by" line which should be kept
      const isAnalyzedBy = line.includes("Analyzed by:");
      return !hasChinese || isAnalyzedBy;
    })
    .join("\n");
}

/**
 * Generate Chinese-only version from English text with translations
 * Extracts Chinese translations from blockquotes and replaces English content
 */
function extractChineseVersion(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If this is a blockquote with Chinese, extract it as main content
    if (line.startsWith(">") && /[\u4e00-\u9fff]/.test(line) && !line.includes("Analyzed by:")) {
      // Remove the ">" prefix and trim
      result.push(line.slice(1).trim());
    } else if (line.startsWith(">") && line.includes("Analyzed by:")) {
      // Keep "Analyzed by" but translate
      result.push(`> 由 ${line.match(/Analyzed by: (\w+)/)?.[1] || "AI"} 分析生成`);
    } else if (!line.startsWith(">")) {
      // Keep non-blockquote lines (headers, tables, etc.)
      // But skip if the next line is a Chinese translation (we already added it)
      const nextLine = lines[i + 1];
      const nextIsChinese = nextLine?.startsWith(">") && /[\u4e00-\u9fff]/.test(nextLine);
      if (!nextIsChinese || line.startsWith("#") || line.startsWith("|") || line.startsWith("-") || line.startsWith("```") || line.trim() === "") {
        result.push(line);
      }
    }
  }

  return result.join("\n");
}

/**
 * Generate enhanced survey markdown with AI insights
 *
 * @param survey - Project survey data
 * @param aiResult - AI analysis results
 * @param options - Generation options
 *   - bilingual: Include inline Chinese translations (default: false)
 *   - language: Generate for specific language ("en" or "zh-CN")
 */
export function generateAISurveyMarkdown(
  survey: ProjectSurvey,
  aiResult: AIAnalysisResult,
  options: SurveyMarkdownOptions = {}
): string {
  const { bilingual = false, language } = options;

  const lines: string[] = [];

  // Title
  if (language === "zh-CN") {
    lines.push("# 项目调查报告 (AI 增强版)\n");
  } else {
    lines.push("# Project Survey (AI-Enhanced)\n");
  }

  // Summary
  if (aiResult.summary) {
    if (language === "zh-CN") {
      lines.push("## 概述\n");
    } else {
      lines.push("## Summary\n");
    }
    lines.push(aiResult.summary);
    lines.push("");
  }

  if (aiResult.agentUsed) {
    if (language === "zh-CN") {
      lines.push(`> 由 ${aiResult.agentUsed} 分析生成\n`);
    } else {
      lines.push(`> Analyzed by: ${aiResult.agentUsed}\n`);
    }
  }

  // Tech Stack
  if (language === "zh-CN") {
    lines.push("## 技术栈\n");
    lines.push("| 方面 | 值 |");
    lines.push("|------|-----|");
    lines.push(`| 语言 | ${survey.techStack.language} |`);
    lines.push(`| 框架 | ${survey.techStack.framework} |`);
    lines.push(`| 构建工具 | ${survey.techStack.buildTool} |`);
    lines.push(`| 测试框架 | ${survey.techStack.testFramework} |`);
    lines.push(`| 包管理器 | ${survey.techStack.packageManager} |`);
  } else {
    lines.push("## Tech Stack\n");
    lines.push("| Aspect | Value |");
    lines.push("|--------|-------|");
    lines.push(`| Language | ${survey.techStack.language} |`);
    lines.push(`| Framework | ${survey.techStack.framework} |`);
    lines.push(`| Build Tool | ${survey.techStack.buildTool} |`);
    lines.push(`| Test Framework | ${survey.techStack.testFramework} |`);
    lines.push(`| Package Manager | ${survey.techStack.packageManager} |`);
  }
  lines.push("");

  // Directory Structure
  if (language === "zh-CN") {
    lines.push("## 目录结构\n");
  } else {
    lines.push("## Directory Structure\n");
  }

  if (survey.structure.entryPoints.length > 0) {
    lines.push(language === "zh-CN" ? "### 入口点" : "### Entry Points");
    for (const e of survey.structure.entryPoints) {
      lines.push(`- \`${e}\``);
    }
    lines.push("");
  }

  if (survey.structure.srcDirs.length > 0) {
    lines.push(language === "zh-CN" ? "### 源代码目录" : "### Source Directories");
    for (const d of survey.structure.srcDirs) {
      lines.push(`- \`${d}/\``);
    }
    lines.push("");
  }

  // Modules with descriptions
  if (survey.modules.length > 0) {
    lines.push(language === "zh-CN" ? "## 模块\n" : "## Modules\n");
    for (const m of survey.modules) {
      lines.push(`### ${m.name}`);
      lines.push(language === "zh-CN" ? `- **路径**: \`${m.path}\`` : `- **Path**: \`${m.path}\``);
      lines.push(language === "zh-CN" ? `- **状态**: ${m.status}` : `- **Status**: ${m.status}`);
      if (m.description) {
        // Strip Chinese translations if not bilingual mode and language is English
        const desc = (!bilingual && language !== "zh-CN") ? stripChineseTranslations(m.description) : m.description;
        lines.push(language === "zh-CN" ? `- **描述**: ${desc}` : `- **Description**: ${desc}`);
      }
      lines.push("");
    }
  }

  // Discovered Features
  if (survey.features.length > 0) {
    // Check if features have actual status (from feature_list.json)
    const hasStatus = survey.features.some((f) => f.status);

    if (hasStatus) {
      lines.push(language === "zh-CN" ? "## 功能完成状态\n" : "## Feature Completion Status\n");
      if (language === "zh-CN") {
        lines.push("| ID | 描述 | 模块 | 状态 |");
      } else {
        lines.push("| ID | Description | Module | Status |");
      }
      lines.push("|----|-------------|--------|--------|");
      for (const f of survey.features.slice(0, 100)) {
        const statusIcon = f.status === "passing" ? "✅" : f.status === "failing" ? "❌" : "⏸️";
        lines.push(`| ${f.id} | ${f.description} | ${f.module} | ${statusIcon} ${f.status} |`);
      }
    } else {
      lines.push(language === "zh-CN" ? "## 发现的功能\n" : "## Discovered Features\n");
      if (language === "zh-CN") {
        lines.push("| ID | 描述 | 模块 | 来源 | 置信度 |");
      } else {
        lines.push("| ID | Description | Module | Source | Confidence |");
      }
      lines.push("|----|-------------|--------|--------|------------|");
      for (const f of survey.features.slice(0, 100)) {
        const confidence = typeof f.confidence === "number" ? `${Math.round(f.confidence * 100)}%` : "-";
        lines.push(`| ${f.id} | ${f.description} | ${f.module} | ${f.source} | ${confidence} |`);
      }
    }
    if (survey.features.length > 100) {
      const moreText = language === "zh-CN"
        ? `\n*... 还有 ${survey.features.length - 100} 个功能*`
        : `\n*... and ${survey.features.length - 100} more features*`;
      lines.push(moreText);
    }
    lines.push("");
  }

  // Completion Assessment
  lines.push(language === "zh-CN" ? "## 完成度评估\n" : "## Completion Assessment\n");
  lines.push(language === "zh-CN"
    ? `**总体完成度: ${survey.completion.overall}%**\n`
    : `**Overall: ${survey.completion.overall}%**\n`);

  if (survey.completion.notes && survey.completion.notes.length > 0) {
    lines.push(language === "zh-CN" ? "**备注:**" : "**Notes:**");
    for (const note of survey.completion.notes) {
      lines.push(`- ${note}`);
    }
    lines.push("");
  }

  // Recommendations
  if (aiResult.recommendations && aiResult.recommendations.length > 0) {
    lines.push(language === "zh-CN" ? "## 建议\n" : "## Recommendations\n");
    for (const rec of aiResult.recommendations) {
      lines.push(`- ${rec}`);
    }
    lines.push("");
  }

  // Commands
  lines.push(language === "zh-CN" ? "## 命令\n" : "## Commands\n");
  lines.push("```bash");
  if (survey.commands.install) {
    const comment = language === "zh-CN" ? "# 安装依赖" : "# Install dependencies";
    lines.push(`${comment}\n${survey.commands.install}\n`);
  }
  if (survey.commands.dev) {
    const comment = language === "zh-CN" ? "# 启动开发服务器" : "# Start development server";
    lines.push(`${comment}\n${survey.commands.dev}\n`);
  }
  if (survey.commands.build) {
    const comment = language === "zh-CN" ? "# 构建生产版本" : "# Build for production";
    lines.push(`${comment}\n${survey.commands.build}\n`);
  }
  if (survey.commands.test) {
    const comment = language === "zh-CN" ? "# 运行测试" : "# Run tests";
    lines.push(`${comment}\n${survey.commands.test}`);
  }
  lines.push("```\n");

  lines.push("---\n");
  const footer = language === "zh-CN"
    ? "*由 agent-foreman 和 AI 分析生成*"
    : "*Generated by agent-foreman with AI analysis*";
  lines.push(footer);

  return lines.join("\n");
}
