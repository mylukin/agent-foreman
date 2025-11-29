# Project Survey (AI-Enhanced)

## Summary

Agent-foreman is a TypeScript-based CLI harness that helps AI agents manage long software tasks via feature lists, progress logs, AI surveys, and automated verification workflows.
> Agent-foreman 是一个基于 TypeScript 的 CLI 脚手架，通过特性列表、进度日志、AI 调查和自动化验证流程帮助 AI 代理管理长周期软件任务。

> Analyzed by: codex

## Tech Stack

| Aspect | Value |
|--------|-------|
| Language | TypeScript
> 使用 TypeScript |
| Framework | none (CLI via yargs)
> 无框架（通过 yargs 的 CLI） |
| Build Tool | tsc
> 使用 tsc 编译 |
| Test Framework | vitest
> 使用 vitest 测试 |
| Package Manager | npm
> 使用 npm 包管理 |

## Directory Structure

### Entry Points
- `src/index.ts`

### Source Directories
- `src/`

## Modules

### cli
- **Path**: `src/index.ts`
- **Status**: complete
- **Description**: CLI entrypoint exposing survey/init/step/status/impact/complete/verify/agents/detect-capabilities workflows with git safety and progress logging.
> CLI 入口，提供 survey/init/step/status/impact/complete/verify/agents/detect-capabilities 工作流，并包含 git 安全检查与进度日志。

### agents
- **Path**: `src/agents.ts`
- **Status**: complete
- **Description**: Manages external AI agent subprocesses with discovery, retries, and availability reporting.
> 管理外部 AI 代理子进程，包含发现、重试与可用性报告。

### ai-capability-discovery
- **Path**: `src/ai-capability-discovery.ts`
- **Status**: complete
- **Description**: Collects project context, builds AI prompts, parses responses, and discovers verification commands via AI.
> 收集项目上下文，构造 AI 提示，解析响应，并通过 AI 发现验证命令。

### ai-scanner
- **Path**: `src/ai-scanner.ts`
- **Status**: complete
- **Description**: Runs autonomous AI surveys, parses results, and generates feature lists or markdown surveys.
> 运行自主 AI 调查，解析结果，并生成特性列表或调查 Markdown。

### capability-cache
- **Path**: `src/capability-cache.ts`
- **Status**: complete
- **Description**: Persists detected capabilities with git-aware staleness checks and cache invalidation.
> 持久化检测到的能力，并通过 git 感知的陈旧性检查和缓存失效处理。

### capability-detector
- **Path**: `src/capability-detector.ts`
- **Status**: complete
- **Description**: Detects tests, type checks, lint, build, git, and languages via presets or AI fallback.
> 通过预设或 AI 兜底检测测试、类型检查、lint、构建、git 以及语言。

### feature-list
- **Path**: `src/feature-list.ts`
- **Status**: complete
- **Description**: Reads/writes ai/feature_list.json and provides selection, merge, stats, and CRUD helpers.
> 读写 ai/feature_list.json，并提供选择、合并、统计和增删改工具。

### git-utils
- **Path**: `src/git-utils.ts`
- **Status**: complete
- **Description**: Lightweight git helpers for repo checks, staging, committing, and change inspection.
> 轻量级 git 工具，用于仓库检查、暂存、提交与变更查看。

### impact-analyzer
- **Path**: `src/impact-analyzer.ts`
- **Status**: complete
- **Description**: Analyzes feature dependencies, affected chains, and readiness ordering.
> 分析特性依赖、受影响链路与可工作顺序。

### init-script
- **Path**: `src/init-script.ts`
- **Status**: complete
- **Description**: Generates ai/init.sh scripts for bootstrap, dev, check, verify, and build flows.
> 生成 ai/init.sh 脚本，覆盖引导、开发、检查、验证与构建流程。

### progress-log
- **Path**: `src/progress-log.ts`
- **Status**: complete
- **Description**: Formats, parses, and appends single-line progress entries for ai/progress.md.
> 格式化、解析并追加单行进度记录到 ai/progress.md。

### project-scanner
- **Path**: `src/project-scanner.ts`
- **Status**: complete
- **Description**: Scans directory structure for entry points, source/test dirs, and config files; checks emptiness.
> 扫描目录结构以发现入口、源码/测试目录与配置文件，并检查项目是否为空。

### prompts
- **Path**: `src/prompts.ts`
- **Status**: complete
- **Description**: Generates harness documentation, commit messages, feature guidance, and impact summaries.
> 生成脚手架文档、提交信息、特性指导与影响摘要。

### schema
- **Path**: `src/schema.ts`
- **Status**: complete
- **Description**: Defines and validates JSON schema for feature_list, plus ID/status validators.
> 定义并校验 feature_list 的 JSON 模式，提供 ID/状态校验器。

### types
- **Path**: `src/types.ts`
- **Status**: complete
- **Description**: Domain models for features, progress logs, surveys, commands, and impact analysis.
> 特性、进度日志、调查、命令与影响分析的领域模型。

### verification-prompts
- **Path**: `src/verification-prompts.ts`
- **Status**: complete
- **Description**: Builds AI verification prompts and parses JSON verdicts with confidence handling.
> 构建 AI 验证提示并解析带置信度的 JSON 裁决。

### verification-store
- **Path**: `src/verification-store.ts`
- **Status**: complete
- **Description**: Persists AI verification results under ai/verification/results.json with helpers.
> 将 AI 验证结果保存到 ai/verification/results.json，并提供辅助函数。

### verification-types
- **Path**: `src/verification-types.ts`
- **Status**: complete
- **Description**: Type definitions for verification capabilities, results, rules, and caches.
> 验证能力、结果、规则与缓存的类型定义。

### verifier
- **Path**: `src/verifier.ts`
- **Status**: complete
- **Description**: Orchestrates git diff collection, automated checks, AI analysis, and result formatting.
> 协调 git diff 收集、自动检查、AI 分析与结果格式化。

### plugin-foreman-agent
- **Path**: `plugins/agent-foreman/agents/foreman.md`
- **Status**: complete
- **Description**: Claude Code agent documentation guiding harness workflow and git discipline.
> Claude Code 代理文档，指导脚手架工作流与 git 规范。

### skill-project-survey
- **Path**: `plugins/agent-foreman/skills/project-survey/SKILL.md`
- **Status**: complete
- **Description**: Skill doc for running project surveys to map tech stack, structure, and features.
> 运行项目调研以映射技术栈、结构与特性的技能文档。

### skill-init-harness
- **Path**: `plugins/agent-foreman/skills/init-harness/SKILL.md`
- **Status**: complete
- **Description**: Skill doc for initializing or upgrading the harness with auto-detection flow.
> 初始化或升级脚手架的技能文档，包含自动检测流程。

### skill-feature-step
- **Path**: `plugins/agent-foreman/skills/feature-step/SKILL.md`
- **Status**: complete
- **Description**: Skill doc for selecting next feature, showing guidance, and running checks.
> 选择下一特性、展示指导并运行检查的技能文档。

## Feature Completion Status

| ID | Description | Module | Status |
|----|-------------|--------|--------|
| cli.survey | Generate AI-powered project survey report | cli | ✅ passing |
| cli.init | Initialize harness (feature list, progress log, init script) | cli | ✅ passing |
| cli.step | Select and present the next high-priority feature to work on | cli | ✅ passing |
| cli.status | Display current project health and feature completion stats | cli | ✅ passing |
| cli.impact | Analyze dependent features for a specific change | cli | ✅ passing |
| cli.complete | Mark a feature as passing and update logs | cli | ✅ passing |
| scanner.autonomous_exploration | Agent autonomously explores codebase to discover features | ai-scanner | ✅ passing |
| scanner.generate_from_goal | Generate initial feature list from a text goal for empty projects | ai-scanner | ✅ passing |
| agents.abstraction | Unified interface for Gemini, Claude, and Codex CLIs | agents | ✅ passing |
| agents.retry | Retry logic for failed AI agent calls | agents | ✅ passing |
| features.dependency_graph | Build and traverse feature dependency graph | impact-analyzer | ✅ passing |
| features.circular_check | Detect circular dependencies in features | impact-analyzer | ✅ passing |
| logging.audit | Structured logging of all harness actions to markdown | progress-log | ✅ passing |
| init.script_gen | Generate project-specific 'ai/init.sh' bootstrap script | init-script | ✅ passing |
| verify.types | Define TypeScript types for verification system | verification | ✅ passing |
| verify.store | Persistence layer for verification results | verification | ✅ passing |
| verify.capability_detector | Detect project verification capabilities (tests, types, lint, build) | verification | ✅ passing |
| verify.prompts | AI prompt templates for comprehensive verification | verification | ✅ passing |
| verify.core | Core verification logic orchestrating checks and AI analysis | verification | ✅ passing |
| verify.cli | CLI verify command for AI-powered feature verification | verification | ✅ passing |
| verify.init_script | Enhanced init.sh generation with verification commands | verification | ✅ passing |
| verify.tests | Unit tests for verification system | verification | ✅ passing |
| capability.extended_types | Add ExtendedCapabilities and CustomRule types for dynamic language detection | capability | ✅ passing |
| capability.cache | Cache infrastructure for persisting detected capabilities to ai/capabilities.json | capability | ✅ passing |
| capability.preset_refactor | Refactor existing preset detection with confidence scoring | capability | ✅ passing |
| capability.ai_discovery | AI-based capability discovery for unknown project types | capability | ✅ passing |
| capability.three_tier | Implement three-tier detection: cache → preset → AI discovery | capability | ✅ passing |
| capability.cli_command | CLI command for manual capability detection and refresh | capability | ✅ passing |
| capability.tests | Unit tests for extensible capability detection system | capability | ✅ passing |
| git.utils | Create git utility functions for auto-commit functionality | git | ✅ passing |
| git.step_guard | Enforce clean working directory check in step command | git | ✅ passing |
| git.auto_commit | Auto-commit all changes when completing a feature | git | ✅ passing |

## Completion Assessment

**Overall: 100%**

**Notes:**
- All features are passing
- Completed 32/32 features
- Last updated: 2025-11-29

## Recommendations

- Add end-to-end integration tests covering full CLI flows (survey → init → step → complete) to validate real file outputs.
> 增补覆盖完整 CLI 流程（survey → init → step → complete）的端到端集成测试，以验证真实文件输出。
- Provide graceful handling or mocks when external AI CLIs are absent to improve developer onboarding.
> 在缺少外部 AI CLI 时提供优雅降级或模拟，以提升开发者上手体验。
- Consider bundling example feature_list/progress assets and a quickstart script for new users.
> 可附带示例 feature_list/progress 资源与快速入门脚本，方便新用户。

## Commands

```bash
# Install dependencies
npm install
> 运行 npm install

# Start development server
npm run dev
> 运行 npm run dev

# Build for production
npm run build
> 运行 npm run build

# Run tests
npm run test
> 运行 npm run test
```

---

*Generated by agent-foreman with AI analysis*