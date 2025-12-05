# Project Survey (AI-Enhanced)

## Summary

Agent-foreman is a TypeScript CLI harness that guides AI-assisted feature-driven development, from project analysis and initialization to task selection and verification.
> Agent-foreman 是一个 TypeScript CLI 框架，支持从项目分析、初始化到任务选择与验证的 AI 辅助特性驱动开发。 It manages feature lists, progress logs, selective testing, and AI verification pipelines with caching and reporting.
> 它管理特性列表、进度日志、选择性测试以及带缓存与报告的 AI 验证流程。

> Analyzed by: codex

## Tech Stack

| Aspect | Value |
|--------|-------|
| Language | TypeScript |
| Framework | none |
| Build Tool | tsc |
| Test Framework | vitest |
| Package Manager | npm |

## Directory Structure

### Entry Points
- `src/index.ts`

### Source Directories
- `src/`

## Modules

### cli
- **Path**: `src/index.ts`
- **Status**: complete
- **Description**: CLI entrypoint orchestrating analyze/init/next/status/impact/done/check/agents/detect-capabilities commands with goal autodetect and progress output.
> CLI 入口，编排 analyze/init/next/status/impact/done/check/agents/detect-capabilities 等命令，并具备目标自动检测与进度输出。

### ai-scanner
- **Path**: `src/ai-scanner.ts`
- **Status**: complete
- **Description**: AI-driven project survey generation, feature derivation from survey or goal, and markdown report creation.
> 基于 AI 的项目扫描，支持从调查或目标生成特性清单并输出 Markdown 报告。

### agents
- **Path**: `src/agents.ts`
- **Status**: complete
- **Description**: Agent subprocess management for Codex/Gemini/Claude with priority selection, retries, and availability reporting.
> 管理 Codex/Gemini/Claude 子进程的代理层，含优先级选择、重试与可用性报告。

### project-scanner
- **Path**: `src/project-scanner.ts`
- **Status**: complete
- **Description**: Directory analysis detecting entry points, src/test dirs, configs, and empty-project detection.
> 目录分析，检测入口文件、源/测试目录、配置文件并判断项目是否为空。

### feature-list
- **Path**: `src/feature-list.ts`
- **Status**: complete
- **Description**: Feature list persistence, status updates, dependency queries, test requirement generation, and stats utilities.
> 特性列表的存储、状态更新、依赖查询、测试需求生成与统计工具。

### progress-log
- **Path**: `src/progress-log.ts`
- **Status**: complete
- **Description**: Progress log formatting, append/read helpers, recent entry retrieval, and entry builders for init/step/change/replan/verify.
> 进度日志格式化与读写，获取近期条目，以及为 init/step/change/replan/verify 构建条目。

### init-helpers
- **Path**: `src/init-helpers.ts`
- **Status**: complete
- **Description**: Init workflow helpers: analysis selection, feature merging, harness file generation (init.sh, CLAUDE.md, progress log) with AI merges.
> 初始化辅助：选择分析路径、合并特性、生成 init.sh/CLAUDE.md/进度日志并支持 AI 合并。

### init-script
- **Path**: `src/init-script.ts`
- **Status**: complete
- **Description**: Bootstrap script generators using detected capabilities, including quick/full test modes and E2E handling.
> 根据检测到的能力生成引导脚本，支持快速/完整测试模式与 E2E 处理。

### prompts
- **Path**: `src/prompts.ts`
- **Status**: complete
- **Description**: Prompt/document generators for harness docs, commit messages, feature guidance, impact and session summaries.
> 生成框架文档、提交信息、特性指南、影响评审与会话摘要的模板。

### tdd-guidance
- **Path**: `src/tdd-guidance.ts`
- **Status**: complete
- **Description**: Acceptance-to-test mapping, suggested test paths, and skeleton generators for unit/E2E across frameworks.
> 将验收准则映射为测试案例，建议测试路径，并为多种框架生成单元/E2E 骨架。

### test-discovery
- **Path**: `src/test-discovery.ts`
- **Status**: complete
- **Description**: Selective test discovery from git changes or patterns, selective command builders, and E2E tag-based command assembly.
> 基于 Git 变更或模式的选择性测试发现，生成选择性测试命令及按标签筛选的 E2E 命令。

### verification
- **Path**: `src/verifier.ts`
- **Status**: complete
- **Description**: Automated checks plus AI/TDD/autonomous verification pipelines, diff acquisition, summaries, and result persistence.
> 自动化检查结合 AI/TDD/自主验证流程，获取 diff、生成摘要并持久化结果。

### verification-support
- **Path**: `src/verification-*.ts`
- **Status**: complete
- **Description**: Verification prompts, reports, store/index migration, and type/capability definitions supporting verifier.
> 验证相关的提示、报告、存储/索引迁移以及类型与能力定义，支撑验证流程。

### project-capabilities
- **Path**: `src/project-capabilities.ts`
- **Status**: complete
- **Description**: AI or cached detection of test/build/typecheck/lint/E2E commands with cache invalidation and formatting.
> 通过 AI 或缓存检测测试/构建/类型检查/Lint/E2E 命令，并处理缓存失效与展示。

### impact-analyzer
- **Path**: `src/impact-analyzer.ts`
- **Status**: complete
- **Description**: Feature dependency impact analysis, recommendations, readiness checks, and topological utilities.
> 特性依赖影响分析，提供建议、可工作性检查与拓扑排序工具。

### utilities
- **Path**: `src/file-utils.ts, src/git-utils.ts, src/timeout-config.ts, src/progress.ts, src/test-gate.ts, src/debug.ts, src/upgrade.ts`
- **Status**: complete
- **Description**: Shared helpers for safe file access, git status/commit operations, timeout and agent priority config, progress indicators, test gating, debug logging, and upgrade checks.
> 提供安全文件访问、Git 状态/提交、超时与代理优先级配置、进度指示、测试门控、调试日志以及升级检查等通用工具。

## Discovered Features

| ID | Description | Module | Source | Confidence |
|----|-------------|--------|--------|------------|
| cli.analyze | Generate AI-powered project survey and write docs/PROJECT_SURVEY.md with summary stats output.
> 生成 AI 驱动的项目调研并写入 docs/PROJECT_SURVEY.md，同时输出统计。 | cli | code | 90% |
| cli.init | Initialize or upgrade harness by analyzing project/goal, merging features, generating init.sh, CLAUDE.md, and progress log.
> 通过分析项目或目标合并特性并生成 init.sh、CLAUDE.md 与进度日志来初始化或升级框架。 | cli | code | 90% |
| cli.next | Select next feature (or specific ID), optionally run checks, show status, TDD guidance, and feature briefings.
> 选择下一个待做特性（或指定 ID），可选运行检查，展示状态、TDD 指引与特性详情。 | cli | code | 90% |
| cli.status | Display project goal, feature stats, completion bar, recent activity, and optional JSON/quiet modes.
> 展示项目目标、特性统计、完成度进度条、近期活动，并支持 JSON/静默输出。 | cli | code | 88% |
| cli.impact | Report dependent and same-module features with recommendations for change impact.
> 报告依赖或同模块特性并给出变更影响建议。 | cli | code | 86% |
| cli.done | Verify feature (tests/AI), enforce test file gate, update status, log progress, and auto-commit with suggestion fallback.
> 验证特性（测试/AI），执行测试文件门控，更新状态、记录进度，并自动提交或给出提交建议。 | cli | code | 91% |
| cli.check | Run feature verification without marking done, supporting autonomous mode, quick/full tests, and E2E control.
> 运行特性验证但不标记完成，支持自主模式、快速/完整测试与 E2E 控制。 | cli | code | 89% |
| cli.agents | List available AI agents and their availability.
> 列出可用的 AI 代理及其可用状态。 | cli | code | 84% |
| cli.detect-capabilities | Detect or refresh cached project capabilities with optional verbose output.
> 检测或刷新项目能力缓存，支持详细输出。 | cli | code | 85% |
| goal.autodetect | Infer project goal from package.json description or README before falling back to directory name.
> 从 package.json 描述或 README 推断项目目标，否则退回目录名。 | cli | code | 83% |
| ai.scanProject | Run autonomous agent to survey repository structure, configs, and code, returning structured tech/modules/features.
> 调用自主代理扫描仓库结构、配置与代码，返回技术栈/模块/特性结构化信息。 | ai-scanner | code | 90% |
| ai.generateFromSurvey | Convert existing PROJECT_SURVEY.md and goal into feature list via AI.
> 通过 AI 将已有 PROJECT_SURVEY.md 与目标转化为特性清单。 | ai-scanner | code | 86% |
| ai.generateFromGoal | Create initial tech stack and feature backlog from goal text for empty projects.
> 针对空项目根据目标文本生成初始技术栈与特性待办。 | ai-scanner | code | 86% |
| ai.surveyMarkdown | Render AI survey data into Markdown with tech stack, structure, modules, features, completion, recommendations, and commands.
> 将 AI 调研数据渲染为包含技术栈、结构、模块、特性、完成度、建议与命令的 Markdown。 | ai-scanner | code | 88% |
| agents.callAny | Try prioritized agents with spinners, timeouts, and verbose errors until one succeeds.
> 按优先级尝试代理，带旋转提示、超时与详细错误，直到成功。 | agents | code | 87% |
| agents.callWithRetry | Retry single-agent execution with configurable attempts and delays.
> 对单个代理执行提供可配置次数与间隔的重试。 | agents | code | 85% |
| agents.checkAvailable | Detect installed AI CLIs and report availability list or detailed status.
> 检测已安装的 AI CLI 并输出可用性列表或详细状态。 | agents | code | 84% |
| structure.scan | Gather entry points, src/test directories, and config files across common patterns.
> 按常见模式收集入口、源/测试目录与配置文件。 | project-scanner | code | 86% |
| structure.isEmpty | Determine if project lacks source files across multiple languages/directories.
> 判断项目在多种语言/目录下是否无源文件。 | project-scanner | code | 83% |
| features.loadSave | Read/write ai/feature_list.json with schema validation and metadata updates.
> 读取/写入带架构校验和元数据更新的 ai/feature_list.json。 | feature-list | code | 88% |
| features.selection | Select next feature prioritizing needs_review then failing by priority.
> 选择下一个特性，按 needs_review 优先且再按优先级排序。 | feature-list | code | 87% |
| features.dependencyQueries | Find dependents, same-module peers, and generate deprecation or dependency-aware updates.
> 查找依赖者、同模块特性，并生成废弃或依赖相关更新。 | feature-list | code | 86% |
| features.testRequirements | Auto-generate testRequirements and module-based test patterns for discovered features.
> 为发现的特性自动生成测试需求与基于模块的测试模式。 | feature-list | code | 86% |
| features.stats | Compute feature status counts and completion percentages excluding deprecated items.
> 计算特性状态数量及剔除废弃项的完成百分比。 | feature-list | code | 85% |
| progress.logOps | Format, append, and parse single-line progress log entries with escape handling.
> 以转义处理格式化、追加并解析单行进度日志。 | progress-log | code | 86% |
| progress.recent | Retrieve recent progress entries and render for display.
> 获取近期进度条目并格式化展示。 | progress-log | code | 84% |
| init.detectAnalyze | Choose between survey reuse, empty-goal generation, or fresh AI scan before init.
> 初始化前在复用调研、目标生成或全新 AI 扫描之间选择。 | init-helpers | code | 87% |
| init.mergeFeatures | Merge discovered features into existing list respecting mode (merge/new/scan) and goal updates.
> 根据模式（merge/new/scan）与目标更新将发现特性合并进现有列表。 | init-helpers | code | 87% |
| init.generateHarness | Detect capabilities, generate or AI-merge init.sh, update CLAUDE.md, log init, and suggest commit.
> 检测能力，生成或 AI 合并 init.sh，更新 CLAUDE.md，记录初始化并给出提交建议。 | init-helpers | code | 88% |
| initScript.generate | Produce init.sh from capabilities with bootstrap/dev/check/build/status commands and quick/full/E2E flags.
> 基于能力生成含 bootstrap/dev/check/build/status 命令及快速/完整/E2E 选项的 init.sh。 | init-script | code | 87% |
| prompts.harnessDocs | Generate harness instructions section and CLAUDE.md content from goal.
> 根据目标生成框架说明章节与 CLAUDE.md 内容。 | prompts | code | 84% |
| prompts.featureGuidance | Emit feature guidance with acceptance checklist, dependencies, notes, and workflow steps.
> 输出包含验收清单、依赖、备注与流程步骤的特性指引。 | prompts | code | 85% |
| tdd.guidance | Convert acceptance to unit/E2E cases, suggest test files, and map criteria to tests.
> 将验收准则转为单元/E2E 用例，建议测试文件并建立准则到测试的映射。 | tdd-guidance | code | 87% |
| tdd.unitSkeletons | Generate unit test skeletons for Vitest/Jest/Mocha/Pytest/Go/Cargo frameworks.
> 为 Vitest/Jest/Mocha/Pytest/Go/Cargo 生成单元测试骨架。 | tdd-guidance | code | 85% |
| tdd.e2eSkeletons | Generate Playwright-style E2E skeletons with page object template and tag support.
> 生成含页面对象模板与标签支持的 Playwright 风格 E2E 骨架。 | tdd-guidance | code | 84% |
| tests.discovery | Map source changes to test candidates, detect existing tests, and choose patterns or files for selective runs.
> 将源码变更映射到候选测试，检测现有测试，并选择模式或文件进行选择性运行。 | test-discovery | code | 88% |
| tests.selectiveCommand | Build selective test commands via AI-discovered templates or framework fallbacks.
> 使用 AI 发现的模板或框架回退生成选择性测试命令。 | test-discovery | code | 87% |
| tests.e2eCommand | Assemble E2E commands with tag-based grep modes (full/smoke/tags/skip).
> 组合按标签筛选的 E2E 命令，支持 full/smoke/tags/skip 模式。 | test-discovery | code | 86% |
| verification.runAutomated | Execute tests/typecheck/lint/build/E2E (or init.sh) with progress bars and CI env handling.
> 通过进度条和 CI 环境执行测试/类型检查/Lint/构建/E2E（或 init.sh）。 | verification | code | 90% |
| verification.analyzeWithAI | Build verification prompt with diff, automated results, related files, and call AI with retries/backoff.
> 构建含 diff、自动检查结果、相关文件的验证提示，并带重试/回退调用 AI。 | verification | code | 90% |
| verification.verifyFeature | Full verification pipeline using git diff, selective tests, AI analysis, result formatting, and saving.
> 使用 Git diff、选择性测试、AI 分析、结果格式化与保存的完整验证管线。 | verification | code | 91% |
| verification.autonomous | Autonomous verification mode that lets AI explore codebase with optional automated checks.
> 自主验证模式，可选运行自动检查后让 AI 自行探索代码库。 | verification | code | 88% |
| verification.tdd | TDD verification that runs specified test files (and E2E if required) to derive verdict without AI.
> 通过运行指定测试文件（及必要的 E2E）得出结论的 TDD 验证，无需 AI。 | verification | code | 87% |
| verification.diffTruncation | Intelligently truncate diffs preserving structure for prompts and fallback quick-check prompts.
> 智能截断 diff 保留结构用于提示，并提供快速检查提示。 | verification-support | code | 86% |
| verification.reports | Generate markdown verification reports and compact summaries.
> 生成 Markdown 验证报告及精简摘要。 | verification-support | code | 85% |
| verification.store | Persist verification runs per feature, maintain index, migrate legacy results, and query history/stats.
> 按特性持久化验证运行、维护索引、迁移旧结果并查询历史/统计。 | verification-support | code | 87% |
| capabilities.detect | AI-driven discovery of test/build/typecheck/lint/E2E commands with confidence scoring and config tracking.
> AI 驱动检测测试/构建/类型检查/Lint/E2E 命令并给出置信度与配置文件追踪。 | project-capabilities | code | 88% |
| capabilities.cache | Load/save/invalidate capabilities cache with staleness checks against git commit and tracked files.
> 加载/保存/失效能力缓存，并基于 Git 提交与跟踪文件判断陈旧性。 | project-capabilities | code | 86% |
| impact.analysis | Compute directly and potentially affected features, recommend needs_review/deprecation/notes updates.
> 计算直接与潜在受影响特性，建议 needs_review/废弃/备注更新。 | impact-analyzer | code | 86% |
| impact.graphOps | Build dependency graph, detect cycles, compute readiness/topological order and dependency depth.
> 构建依赖图、检测循环，计算可工作性/拓扑顺序及依赖深度。 | impact-analyzer | code | 86% |
| git.statusOps | Detect git repo, dirty state, changed/staged files, and current branch.
> 检测 Git 仓库、脏状态、变更/暂存文件及当前分支。 | utilities | code | 85% |
| git.commitOps | Stage paths or all changes and create commits with hash retrieval.
> 暂存指定或全部变更并创建提交，返回哈希。 | utilities | code | 85% |
| file.safety | Safe path validation/joining, existence checks, and guarded file reads.
> 安全的路径校验/拼接、存在性检查与受控文件读取。 | utilities | code | 85% |
| timeout.config | Configurable operation timeouts via env/.env with formatting and agent priority parsing.
> 通过环境变量/.env 配置操作超时，支持格式化与代理优先级解析。 | utilities | code | 86% |
| progress.ui | Spinner, progress bar, and step progress utilities for CLI-friendly feedback.
> 提供 CLI 友好的旋转指示、进度条与分步进度工具。 | utilities | code | 84% |
| test.gate | Validate required unit/E2E test files exist for a feature and discover matching tests.
> 校验特性所需的单元/E2E 测试文件是否存在并发现匹配测试。 | utilities | code | 86% |
| upgrade.check | Check npm for newer agent-foreman versions, prompt to upgrade, update plugin, and run installs.
> 检查 npm 新版本、提示升级、更新插件并执行安装。 | utilities | code | 83% |

## Completion Assessment

**Overall: 90%**

**Notes:**
- Extensive Vitest suite covers core utilities, CLI behaviors, and integration flows.
> 大量 Vitest 测试覆盖核心工具、CLI 行为与集成流程。
- Critical paths rely on external AI CLI availability (Codex/Gemini/Claude) for scan and verification.
> 核心路径依赖外部 AI CLI（Codex/Gemini/Claude）的可用性来完成扫描与验证。
- Feature/test gating and verification storage are implemented with migration support, indicating mature workflow.
> 特性/测试门控与验证存储含迁移支持，表明流程较成熟。

## Recommendations

- 1) Add fallback/manual modes or clearer errors when no external AI agents are installed to keep workflows usable offline.
> 1) 在未安装外部 AI 代理时增加回退/手动模式或更清晰的错误提示，保证离线可用性。
- 2) Extend capability cache validation by hashing relevant config contents to reduce false staleness or misses.
> 2) 通过对相关配置内容做哈希校验来强化能力缓存验证，减少误判或漏检。
- 3) Consider shipping example feature_list/init.sh templates and minimal fixtures to ease first-run experience and testing without AI.
> 3) 提供示例 feature_list/init.sh 模板与最小示例，便于在无 AI 时快速上手与测试。

## Commands

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build

# Run tests
npm test
```

---

*Generated by agent-foreman with AI analysis*