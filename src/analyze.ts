/**
 * Requirements analysis for `analyze` command
 * Uses AI agents to derive requirement name and implementation steps
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { callAnyAvailableAgent, checkAvailableAgents } from "./agents.js";
import { getTimeout } from "./timeout-config.js";

export type AnalyzePhase =
  | "name:start"
  | "name:success"
  | "name:error"
  | "steps:start"
  | "steps:success"
  | "steps:error";

export interface AnalyzePhaseInfo {
  agentUsed?: string;
  error?: string;
  stepCount?: number;
  requirementName?: string;
}

export interface VerificationItem {
  type: string;
  description: string;
}

export interface StepDefinition {
  slug: string;
  description: string;
  verification: VerificationItem[];
  /**
   * Completion status inferred by AI when analyzing current project code
   * - "done": step appears already implemented in the codebase
   * - "todo": step still needs work or verification
   *
   * This is used only internally to decide initial JSON status; it is not
   * written back to the generated step JSON files.
   */
  completion?: "done" | "todo";
}

export interface AnalyzeAIResult {
  success: boolean;
  requirementName?: string;
  steps?: StepDefinition[];
  agentUsed?: string;
  error?: string;
}

export type AnalyzeAgentStreamPhase = "name" | "steps";

export interface AnalyzeAIOptions {
  cwd?: string;
  onPhase?: (phase: AnalyzePhase, info?: AnalyzePhaseInfo) => void;
  /**
   * Optional callback for streaming raw stdout chunks from the underlying AI agent.
   * The phase indicates whether the chunk comes from the requirement-name or steps call.
   */
  onAgentChunk?: (phase: AnalyzeAgentStreamPhase, chunk: string) => void;
}

interface JsonFixResult {
  success: boolean;
  output?: string;
  agentUsed?: string;
  error?: string;
}

/**
 * Detect primary language of spec text.
 * Returns "zh" when the content is predominantly Chinese, otherwise "en".
 */
export function detectSpecLanguage(specText: string): "zh" | "en" {
  const chineseMatches = specText.match(/[\u4e00-\u9fff]/g) ?? [];
  const latinMatches = specText.match(/[A-Za-z]/g) ?? [];

  const chineseCount = chineseMatches.length;
  const latinCount = latinMatches.length;
  const total = chineseCount + latinCount;

  if (total === 0) {
    return "en";
  }

  const chineseRatio = chineseCount / total;
  return chineseRatio >= 0.3 ? "zh" : "en";
}

/**
 * Build prompt to generate requirement name from spec text
 */
export function buildRequirementNamePrompt(specText: string): string {
  return `你是一名资深产品经理，请根据下面的「需求文档」提炼一个简短的「需求名字」。

要求：
- 使用简洁的中文短语，能够概括整体目标
- 不超过 30 个字符
- 不包含换行、不包含引号

只返回 JSON，不要任何额外说明，格式如下：

\`\`\`json
{
  "requirementName": "用户登录与注册"
}
\`\`\`

现在这是需求文档内容：

${specText}`;
}

/**
 * Build prompt to generate ordered implementation steps from spec text
 */
export function buildStepsPrompt(specText: string, requirementName: string): string {
  return `你是一名资深软件架构师，请在「当前项目代码」的基础上，根据下面的「需求名字」和「需求文档」，将需求拆分成若干个按执行顺序排列的「最小实现单元」步骤。

你的分析必须同时满足：
- 充分探索当前工作目录下的项目代码（包括源代码、测试、配置等），理解目前已经实现的功能；
- 根据需求文档列出覆盖「完整需求范围」的一组实现步骤（不要因为某些功能已实现就不列出对应步骤）；
- 对每一个步骤，逐一判断：当前项目代码中是否已经基本实现该步骤描述的功能。

输出要求：
- 每一个步骤对应一个实现单元（尽可能细粒度，但不要过度碎片化）
- 步骤之间是有明确先后顺序的
- 每个步骤必须包含：
  - slug：英文或拼音的短标签，建议使用 kebab-case（例如 "setup-auth-api"），在所有步骤中必须唯一
  - description：该实现单元的详细中文描述，说明需要完成哪些工作
  - verification：一个数组，列出该实现单元的所有测试项目；每一项包含：
    - type：测试类型，例如 "unit"、"integration"、"ui"、"manual" 等
    - description：该测试项目需要验证的内容（用于后续生成单元测试或 UI 自动化测试）
  - completion：字符串，仅允许 "done" 或 "todo"：
    - "done" 表示你认为当前项目代码已经基本实现了这个步骤；
    - "todo" 表示仍然需要补充实现或验证该步骤，不确定时也应保守地标为 "todo"。
  - 在 JSON 字符串中不要使用未转义的英文双引号：
    - ❌ 错误示例："description": "输出"步骤目录中未找到任何 JSON 步骤文件""
    - ✅ 正确示例："description": "输出\\"步骤目录中未找到任何 JSON 步骤文件\\""
    - 或者改用中文引号："description": "输出“步骤目录中未找到任何 JSON 步骤文件”"

重要约束：
- 必须覆盖整个需求：即使大部分功能已经在代码中出现，也要保证 steps 列表能够完整覆盖需求文档的所有关键点；
- 必须逐个步骤判断完成状态：不要假设步骤是按连续区间完成的，允许出现「第 1、4、5 步已完成，但第 2、3 步仍未完成」的情况；
- 如果你认为所有实现类步骤都已经是 "done"，且需求没有遗漏：
  - 仍然要完整输出这些实现步骤（标记为 "done"）；
  - 同时在 steps 末尾补充 1 个或若干个专门用于整体回归验证的步骤（例如总体集成测试、端到端验证、文档核对等），并将这些验证步骤的 completion 标记为 "todo"，用于驱动后续验证流程。

只返回 JSON，不要任何额外说明，格式如下：

\`\`\`json
{
  "steps": [
    {
      "slug": "setup-auth-api",
      "description": "在后端项目中新增认证模块，提供登录和注册接口……",
      "completion": "todo",
      "verification": [
        {
          "type": "unit",
          "description": "为认证服务编写单元测试，覆盖登录成功/失败、注册成功/失败等场景"
        },
        {
          "type": "integration",
          "description": "通过接口测试验证登录/注册接口在真实数据库中的读写行为"
        }
      ]
    }
  ]
}
\`\`\`

注意：必须保证 steps 数组中所有步骤的 slug 字段互不相同。

当前的需求名字是：
${requirementName}

下面是完整的需求文档内容：

${specText}`;
}

/**
 * Extract JSON string from AI response that may contain surrounding text or code fences
 */
export function extractJsonObject(response: string): string | null {
  // Try to find JSON in code block
  const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find raw JSON object
  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}

/**
 * Parse requirement name from AI response
 */
export function parseRequirementNameResponse(response: string): string {
  const jsonStr = extractJsonObject(response);
  if (!jsonStr) {
    throw new Error("No JSON object found in AI response for requirement name");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `Failed to parse requirement name JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Requirement name JSON is not an object");
  }

  const obj = parsed as { requirementName?: unknown; name?: unknown };
  const value = obj.requirementName ?? obj.name;

  if (typeof value !== "string" || !value.trim()) {
    throw new Error("requirementName is missing or not a non-empty string");
  }

  return value.trim();
}

/**
 * Parse steps array from AI response
 */
export function parseStepsResponse(response: string): StepDefinition[] {
  const jsonStr = extractJsonObject(response);
  if (!jsonStr) {
    throw new Error("No JSON object found in AI response for steps");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (err) {
    throw new Error(
      `Failed to parse steps JSON: ${err instanceof Error ? err.message : String(err)}`
    );
  }

  if (!parsed || typeof parsed !== "object") {
    throw new Error("Steps JSON is not an object");
  }

  const obj = parsed as { steps?: unknown };
  if (!Array.isArray(obj.steps)) {
    throw new Error("steps field is missing or not an array");
  }

  const steps: StepDefinition[] = [];

  for (const step of obj.steps) {
    if (!step || typeof step !== "object") {
      throw new Error("Step entry is not an object");
    }

    const s = step as {
      slug?: unknown;
      description?: unknown;
      verification?: unknown;
      completion?: unknown;
    };

    const description = typeof s.description === "string" ? s.description.trim() : "";
    if (!description) {
      throw new Error("Step description is missing or empty");
    }

    let slug = typeof s.slug === "string" ? s.slug.trim() : "";
    if (!slug) {
      // Fallback: derive slug from description if not provided
      slug = description.slice(0, 40);
    }

    const verification: VerificationItem[] = [];
    if (Array.isArray(s.verification)) {
      for (const item of s.verification) {
        if (!item || typeof item !== "object") continue;
        const v = item as { type?: unknown; description?: unknown };
        if (typeof v.type !== "string" || typeof v.description !== "string") {
          continue;
        }
        const type = v.type.trim();
        const vDesc = v.description.trim();
        if (!type || !vDesc) continue;
        verification.push({ type, description: vDesc });
      }
    }

    let completion: "done" | "todo" | undefined;
    if (typeof s.completion === "string") {
      const normalized = s.completion.trim().toLowerCase();
      if (normalized === "done" || normalized === "todo") {
        completion = normalized;
      }
    }

    steps.push({
      slug,
      description,
      verification,
      completion,
    });
  }

  if (steps.length === 0) {
    throw new Error("No valid steps found in AI response");
  }

  return steps;
}

/**
 * Attempt to repair invalid steps JSON using AI.
 * This is a best-effort fallback: if repair fails, the original parse error is surfaced.
 */
async function fixStepsJsonWithAI(
  rawResponse: string,
  requirementName: string,
  options: AnalyzeAIOptions = {}
): Promise<JsonFixResult> {
  const { cwd } = options;

  const jsonSnippet = extractJsonObject(rawResponse) ?? rawResponse;

  const prompt = `你是一名严格的 JSON 格式修复助手。

当前任务：
- 下面是一段应该符合步骤结构的 JSON 文本，但其中可能存在语法错误（例如未转义的英文双引号、缺少逗号、多余的逗号等）。
- 你的目标是修复这些 JSON 语法错误，使其成为合法的 JSON。
- 不要改变字段语义，只修复语法问题；尽量保留原有的 steps 内容和顺序。

上下文信息：
- 当前需求名字为：${requirementName}

修复要求：
- 返回的必须是一个 JSON 对象，顶层包含 "steps" 字段，对应一个数组；
- 不要输出任何解释性文字、不要使用 Markdown 代码块，只输出最终修复后的纯 JSON。

下面是需要修复的原始 JSON 文本（可能包含语法错误）：

${jsonSnippet}
`;

  const result = await callAnyAvailableAgent(prompt, {
    cwd,
  });

  if (!result || !result.success || !result.output) {
    return {
      success: false,
      error: result?.error || "Failed to fix steps JSON with AI",
    };
  }

  const fixedJson = extractJsonObject(result.output) ?? result.output.trim();

  if (!fixedJson) {
    return {
      success: false,
      error: "AI JSON fix did not return a JSON object",
    };
  }

  return {
    success: true,
    output: fixedJson,
    agentUsed: result.agentUsed,
  };
}

/**
 * Generate requirement name and steps from spec text using AI agents
 */
export async function analyzeRequirementsWithAI(
  specText: string,
  options: AnalyzeAIOptions = {}
): Promise<AnalyzeAIResult> {
  const { cwd, onPhase, onAgentChunk } = options;

  const agents = checkAvailableAgents();
  const hasAgent = agents.some((a) => a.available);

  if (!hasAgent) {
    return {
      success: false,
      error: "No AI agents available. Install gemini, codex, or claude CLI.",
    };
  }

  // First: generate requirement name
  const namePrompt = buildRequirementNamePrompt(specText);
  onPhase?.("name:start");
  const nameResult = await callAnyAvailableAgent(namePrompt, {
    cwd,
    // Requirement-name phase usually has very small JSON; we don't stream it by default.
    onChunk: onAgentChunk ? (chunk) => onAgentChunk("name", chunk) : undefined,
  });

  if (!nameResult.success) {
    const errorMessage =
      nameResult.error || "Failed to generate requirement name with AI";
    onPhase?.("name:error", { error: errorMessage, agentUsed: nameResult.agentUsed });
    return {
      success: false,
      error: errorMessage,
    };
  }

  let requirementName: string;
  try {
    requirementName = parseRequirementNameResponse(nameResult.output);
  } catch (err) {
    const message =
      err instanceof Error
        ? `Failed to parse requirement name: ${err.message}`
        : "Failed to parse requirement name";
    onPhase?.("name:error", { error: message, agentUsed: nameResult.agentUsed });
    return {
      success: false,
      error: message,
    };
  }

  onPhase?.("name:success", {
    agentUsed: nameResult.agentUsed,
    requirementName,
  });

  // Second: generate ordered steps
  const stepsPrompt = buildStepsPrompt(specText, requirementName);
  onPhase?.("steps:start");
  const stepsResult = await callAnyAvailableAgent(stepsPrompt, {
    cwd,
    onChunk: onAgentChunk ? (chunk) => onAgentChunk("steps", chunk) : undefined,
  });

  if (!stepsResult.success) {
    const errorMessage =
      stepsResult.error || "Failed to generate steps with AI";
    onPhase?.("steps:error", { error: errorMessage, agentUsed: stepsResult.agentUsed });
    return {
      success: false,
      error: errorMessage,
    };
  }

  let steps: StepDefinition[];
  try {
    steps = parseStepsResponse(stepsResult.output);
  } catch (err) {
    // First parse failed - ask AI to repair the JSON, then try parsing again.
    const fixResult = await fixStepsJsonWithAI(
      stepsResult.output,
      requirementName,
      { cwd }
    );

    if (!fixResult.success || !fixResult.output) {
      const message =
        err instanceof Error
          ? `Failed to parse steps: ${err.message}`
          : "Failed to parse steps";
      onPhase?.("steps:error", { error: message, agentUsed: stepsResult.agentUsed });
      return {
        success: false,
        error: message,
      };
    }

    try {
      steps = parseStepsResponse(fixResult.output);
    } catch (err2) {
      const message =
        err2 instanceof Error
          ? `Failed to parse steps: ${err2.message}`
          : "Failed to parse steps";
      onPhase?.("steps:error", {
        error: message,
        agentUsed: fixResult.agentUsed ?? stepsResult.agentUsed,
      });
      return {
        success: false,
        error: message,
      };
    }
  }

  onPhase?.("steps:success", {
    agentUsed: stepsResult.agentUsed ?? nameResult.agentUsed,
    stepCount: steps.length,
  });

  return {
    success: true,
    requirementName,
    steps,
    agentUsed: stepsResult.agentUsed ?? nameResult.agentUsed,
  };
}

/**
 * Normalize value for use in file/directory names
 * - Removes or replaces characters that are invalid in common file systems
 */
export function sanitizeNameForPath(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "未命名需求";

  // Replace characters that are invalid on Windows and Unix file systems
  return trimmed.replace(/[\\\/:*?"<>|]+/g, "-");
}

/**
 * Convert arbitrary text into a slug suitable for filenames
 */
export function slugify(value: string): string {
  const normalized = value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, ""); // remove diacritics

  let slug = normalized
    .toLowerCase()
    // Keep letters, digits, and CJK Unified Ideographs; replace others with hyphen
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (!slug) {
    slug = "step";
  }

  return slug;
}

/**
 * High-level helper to run full analyze flow for a spec file path.
 * Used by CLI, but kept here for easier testing.
 */
export async function analyzeSpecFile(
  specPath: string,
  cwd: string,
  options: AnalyzeAIOptions = {}
): Promise<AnalyzeAIResult & { specPath: string }> {
  const fullPath = path.isAbsolute(specPath)
    ? specPath
    : path.join(cwd, specPath);

  let content: string;
  try {
    content = await fs.readFile(fullPath, "utf-8");
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? `Failed to read spec file: ${err.message}`
          : "Failed to read spec file",
      specPath: fullPath,
    };
  }

  const result = await analyzeRequirementsWithAI(content, { cwd, ...options });
  return {
    ...result,
    specPath: fullPath,
  };
}
