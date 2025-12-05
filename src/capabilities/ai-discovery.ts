/**
 * AI-powered capability discovery
 */

import type {
  ExtendedCapabilities,
  CapabilityCommand,
  TestCapabilityInfo,
  E2ECapabilityInfo,
  CustomRule,
  CustomRuleType,
} from "../verification-types.js";
import { callAnyAvailableAgent } from "../agents.js";
import { getTimeout } from "../timeout-config.js";
import { checkGitAvailable } from "./git-invalidation.js";

/** AI response structure for capability discovery */
interface AICapabilityResponse {
  languages: string[];
  configFiles: string[];
  packageManager?: string;
  test?: {
    available: boolean;
    command?: string;
    framework?: string;
    confidence?: number;
    selectiveFileTemplate?: string;
    selectiveNameTemplate?: string;
  };
  e2e?: {
    available: boolean;
    command?: string;
    framework?: string;
    confidence?: number;
    configFile?: string;
    grepTemplate?: string;
    fileTemplate?: string;
  };
  typecheck?: {
    available: boolean;
    command?: string;
    confidence?: number;
  };
  lint?: {
    available: boolean;
    command?: string;
    confidence?: number;
  };
  build?: {
    available: boolean;
    command?: string;
    confidence?: number;
  };
  customRules?: Array<{
    id: string;
    description: string;
    command: string;
    type: string;
  }>;
}

/** Result from AI discovery including config files for cache tracking */
export interface DiscoveryResult {
  capabilities: ExtendedCapabilities;
  configFiles: string[];
}

/**
 * Build autonomous capability discovery prompt
 */
export function buildAutonomousDiscoveryPrompt(cwd: string): string {
  return `You are a software project analyzer. Discover the verification capabilities of a project through autonomous exploration.

## Working Directory

${cwd}

## Task

Explore this project and discover:
1. **Package manager** - Which package manager is used (npm, pnpm, yarn, bun, etc.)
2. **Config files** - Which files define the project's build/test configuration
3. **Run tests** - Find and verify the test command, including selective test execution
4. **E2E tests** - Find E2E testing framework (Playwright, Cypress, etc.) if present
5. **Type check** - Find static type checking command (if applicable)
6. **Lint** - Find code linting command (if applicable)
7. **Build** - Find the build/compile command (if applicable)

## How to Explore

1. List the root directory to see what files exist
2. Check for lock files to determine package manager (pnpm-lock.yaml, yarn.lock, bun.lockb, package-lock.json)
3. Read configuration files you find (any build tool, package manager, or framework config)
4. Look for scripts or documentation that describes how to run checks
5. Verify commands exist before reporting them

## Critical Requirements

- **Test commands must run once and exit** - No watch mode, no interactive mode
- **Only report commands you have verified** - Read the actual config files
- **Use the project's own scripts when available** - Prefer configured commands over generic ones
- **Detect selective test execution** - How to run specific test files or filter by test name
- **Detect E2E testing** - Look for playwright.config.ts, cypress.config.js, or similar

## Output Format

Return ONLY a JSON object (no markdown, no explanation):

{
  "languages": ["<detected languages/frameworks>"],
  "configFiles": ["<files that define project config, e.g. package.json, Cargo.toml>"],
  "packageManager": "<npm|pnpm|yarn|bun|pip|cargo|go|gradle|maven|etc>",
  "test": {
    "available": true,
    "command": "<exact command to run ALL unit tests>",
    "framework": "<test framework name: vitest|jest|mocha|pytest|go|cargo|junit|etc>",
    "confidence": 0.95,
    "selectiveFileTemplate": "<command template to run specific files, use {files} placeholder>",
    "selectiveNameTemplate": "<command template to filter by test name, use {pattern} placeholder>"
  },
  "e2e": {
    "available": true,
    "command": "<exact command to run ALL E2E tests>",
    "framework": "<E2E framework: playwright|cypress|puppeteer|selenium|etc>",
    "confidence": 0.95,
    "configFile": "<config file path, e.g. playwright.config.ts>",
    "grepTemplate": "<command to filter by tags, use {tags} placeholder, e.g. npx playwright test --grep {tags}>",
    "fileTemplate": "<command to run specific files, use {files} placeholder>"
  },
  "typecheck": {
    "available": true,
    "command": "<exact command>",
    "confidence": 0.9
  },
  "lint": {
    "available": true,
    "command": "<exact command>",
    "confidence": 0.85
  },
  "build": {
    "available": true,
    "command": "<exact command>",
    "confidence": 0.95
  },
  "customRules": [
    {
      "id": "<rule-id>",
      "description": "<what this does>",
      "command": "<command>",
      "type": "test|typecheck|lint|build|custom"
    }
  ]
}

## Selective Test Examples

Different frameworks have different patterns:

| Package Manager | Framework | selectiveFileTemplate | selectiveNameTemplate |
|----------------|-----------|----------------------|----------------------|
| pnpm | vitest | pnpm test {files} | pnpm test --testNamePattern "{pattern}" |
| npm | jest | npm test -- {files} | npm test -- --testNamePattern="{pattern}" |
| yarn | jest | yarn test {files} | yarn test --testNamePattern="{pattern}" |
| bun | bun:test | bun test {files} | bun test --test-name-pattern "{pattern}" |
| pip | pytest | pytest {files} | pytest -k "{pattern}" |
| go | go test | go test {files} | go test -run "{pattern}" ./... |
| cargo | cargo test | cargo test --test {files} | cargo test "{pattern}" |

**configFiles:** List all configuration files that affect the build/test process. These will be monitored for changes to invalidate the cache.

**Confidence:**
- 0.9-1.0: Verified in config file
- 0.7-0.9: Strong indication
- Below 0.7: Set available: false

**Rules:**
- Set "available": false if command cannot be determined
- customRules is optional - only for additional project-specific commands
- Return ONLY JSON, no other text

Begin exploration now.`;
}

/**
 * Parse AI response for capability discovery
 */
export function parseCapabilityResponse(
  response: string
): { success: true; data: AICapabilityResponse } | { success: false; error: string } {
  try {
    const jsonStr = extractJSON(response);
    const parsed = JSON.parse(jsonStr) as AICapabilityResponse;

    if (!parsed.languages || !Array.isArray(parsed.languages)) {
      return { success: false, error: "Missing or invalid 'languages' field" };
    }

    // Ensure configFiles is an array (default to empty if not provided)
    if (!parsed.configFiles) {
      parsed.configFiles = [];
    }

    return { success: true, data: parsed };
  } catch (error) {
    return {
      success: false,
      error: `Failed to parse JSON: ${(error as Error).message}`,
    };
  }
}

function extractJSON(response: string): string {
  const jsonBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    return jsonBlockMatch[1].trim();
  }

  const jsonMatch = response.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return response;
}

function toCapabilityCommand(
  info?: { available: boolean; command?: string; framework?: string; confidence?: number }
): CapabilityCommand {
  if (!info) {
    return { available: false, confidence: 0 };
  }

  return {
    available: info.available,
    command: info.command,
    framework: info.framework,
    confidence: info.confidence ?? (info.available ? 0.8 : 0),
  };
}

function toTestCapabilityInfo(
  info?: AICapabilityResponse["test"],
  packageManager?: string
): TestCapabilityInfo {
  if (!info) {
    return { available: false, confidence: 0 };
  }

  return {
    available: info.available,
    command: info.command,
    framework: info.framework,
    confidence: info.confidence ?? (info.available ? 0.8 : 0),
    selectiveFileTemplate: info.selectiveFileTemplate,
    selectiveNameTemplate: info.selectiveNameTemplate,
    packageManager,
  };
}

function toE2ECapabilityInfo(
  info?: AICapabilityResponse["e2e"]
): E2ECapabilityInfo {
  if (!info) {
    return { available: false, confidence: 0 };
  }

  return {
    available: info.available,
    command: info.command,
    framework: info.framework,
    confidence: info.confidence ?? (info.available ? 0.8 : 0),
    configFile: info.configFile,
    grepTemplate: info.grepTemplate,
    fileTemplate: info.fileTemplate,
  };
}

function toCustomRules(
  rules?: Array<{ id: string; description: string; command: string; type: string }>
): CustomRule[] | undefined {
  if (!rules || rules.length === 0) {
    return undefined;
  }

  return rules.map((r) => ({
    id: r.id,
    description: r.description,
    command: r.command,
    type: (["test", "typecheck", "lint", "build", "custom"].includes(r.type)
      ? r.type
      : "custom") as CustomRuleType,
  }));
}

function createMinimalDiscoveryResult(): DiscoveryResult {
  return {
    capabilities: {
      hasTests: false,
      hasTypeCheck: false,
      hasLint: false,
      hasBuild: false,
      hasGit: false,
      source: "ai-discovered",
      confidence: 0,
      languages: [],
      detectedAt: new Date().toISOString(),
      testInfo: { available: false, confidence: 0 },
      e2eInfo: { available: false, confidence: 0 },
      typeCheckInfo: { available: false, confidence: 0 },
      lintInfo: { available: false, confidence: 0 },
      buildInfo: { available: false, confidence: 0 },
    },
    configFiles: [],
  };
}

/**
 * Use AI to autonomously discover verification capabilities
 */
export async function discoverCapabilitiesWithAI(
  cwd: string
): Promise<DiscoveryResult> {
  const prompt = buildAutonomousDiscoveryPrompt(cwd);

  console.log("  AI exploring project structure...");
  const result = await callAnyAvailableAgent(prompt, {
    cwd,
    timeoutMs: getTimeout("AI_CAPABILITY_DISCOVERY"),
  });

  if (!result.success) {
    console.log(`  AI discovery failed: ${result.error}`);
    return createMinimalDiscoveryResult();
  }

  const parsed = parseCapabilityResponse(result.output);

  if (!parsed.success) {
    console.log(`  Failed to parse AI response: ${parsed.error}`);
    return createMinimalDiscoveryResult();
  }

  const data = parsed.data;

  const confidences = [
    data.test?.confidence ?? 0,
    data.e2e?.confidence ?? 0,
    data.typecheck?.confidence ?? 0,
    data.lint?.confidence ?? 0,
    data.build?.confidence ?? 0,
  ].filter((c) => c > 0);

  const avgConfidence =
    confidences.length > 0
      ? confidences.reduce((a, b) => a + b, 0) / confidences.length
      : 0.5;

  const capabilities: ExtendedCapabilities = {
    hasTests: data.test?.available ?? false,
    testCommand: data.test?.command,
    testFramework: data.test?.framework,
    hasTypeCheck: data.typecheck?.available ?? false,
    typeCheckCommand: data.typecheck?.command,
    hasLint: data.lint?.available ?? false,
    lintCommand: data.lint?.command,
    hasBuild: data.build?.available ?? false,
    buildCommand: data.build?.command,
    hasGit: checkGitAvailable(cwd),
    source: "ai-discovered",
    confidence: avgConfidence,
    languages: data.languages,
    detectedAt: new Date().toISOString(),
    testInfo: toTestCapabilityInfo(data.test, data.packageManager),
    e2eInfo: toE2ECapabilityInfo(data.e2e),
    typeCheckInfo: toCapabilityCommand(data.typecheck),
    lintInfo: toCapabilityCommand(data.lint),
    buildInfo: toCapabilityCommand(data.build),
    customRules: toCustomRules(data.customRules),
  };

  console.log(`  Discovered capabilities for: ${data.languages.join(", ")}`);

  return {
    capabilities,
    configFiles: data.configFiles,
  };
}
