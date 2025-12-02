/**
 * Requirements analysis for `analyze` command
 * Uses AI agents to derive requirement name and implementation steps
 */
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { callAnyAvailableAgent, checkAvailableAgents } from "./agents.js";
import { getTimeout } from "./timeout-config.js";

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

export interface AnalyzeAIOptions {
  cwd?: string;
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
 * Generate requirement name and steps from spec text using AI agents
 */
export async function analyzeRequirementsWithAI(
  specText: string,
  options: AnalyzeAIOptions = {}
): Promise<AnalyzeAIResult> {
  const { cwd } = options;

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
  const nameResult = await callAnyAvailableAgent(namePrompt, {
    cwd,
    timeoutMs: getTimeout("AI_DEFAULT"),
  });

  if (!nameResult.success) {
    return {
      success: false,
      error: nameResult.error || "Failed to generate requirement name with AI",
    };
  }

  let requirementName: string;
  try {
    requirementName = parseRequirementNameResponse(nameResult.output);
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? `Failed to parse requirement name: ${err.message}`
          : "Failed to parse requirement name",
    };
  }

  // Second: generate ordered steps
  const stepsPrompt = buildStepsPrompt(specText, requirementName);
  const stepsResult = await callAnyAvailableAgent(stepsPrompt, {
    cwd,
    timeoutMs: getTimeout("AI_DEFAULT"),
  });

  if (!stepsResult.success) {
    return {
      success: false,
      error: stepsResult.error || "Failed to generate steps with AI",
    };
  }

  let steps: StepDefinition[];
  try {
    steps = parseStepsResponse(stepsResult.output);
  } catch (err) {
    return {
      success: false,
      error:
        err instanceof Error
          ? `Failed to parse steps: ${err.message}`
          : "Failed to parse steps",
    };
  }

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
  cwd: string
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

  const result = await analyzeRequirementsWithAI(content, { cwd });
  return {
    ...result,
    specPath: fullPath,
  };
}
