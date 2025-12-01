# Project Survey (AI-Enhanced)

## Summary

agent-foreman is a TypeScript CLI that scaffolds and runs a long-task harness for AI-assisted, feature-driven development, coordinating surveys, progress logging, and verification.
> agent-foreman 是一个 TypeScript CLI，用于搭建并运行 AI 辅助、以功能为驱动的长任务脚手架，协同调研、进度记录与验证。
It orchestrates AI project scans, manages feature lists and progress logs, detects verification capabilities, and automates diff-based or autonomous AI verification with git integration.
> 它编排 AI 项目扫描，管理功能列表与进度日志，检测验证能力，并结合 git 自动执行基于 diff 或自主模式的 AI 验证。

> Analyzed by: codex

## Tech Stack

| Aspect | Value |
|--------|-------|
| Language | TypeScript
> 使用 TypeScript 进行开发 |
| Framework | none
> 无特定框架，主要是 CLI 工具 |
| Build Tool | tsc
> 使用 tsc 进行构建 |
| Test Framework | Vitest
> 使用 Vitest 进行测试 |
| Package Manager | npm
> 使用 npm 作为包管理器 |

## Directory Structure

### Entry Points
- `src/index.ts`

### Source Directories
- `src/`

## Modules

### CLI
- **Path**: `src/index.ts`
- **Status**: complete
- **Description**: Command-line entrypoint registering survey/init/step/status/impact/complete/check/agents/detect-capabilities with rich output and JSON modes.

### AI Scanner
- **Path**: `src/ai-scanner.ts`
- **Status**: complete
- **Description**: Builds autonomous exploration prompts, calls available agents, parses JSON surveys, and renders survey markdown (English/Chinese support).

### Init Helpers
- **Path**: `src/init-helpers.ts`
- **Status**: complete
- **Description**: Detects project state, runs AI analysis or survey reuse, merges/creates feature lists, and generates harness artifacts (init.sh, CLAUDE.md, logs).

### File Utils
- **Path**: `src/file-utils.ts`
- **Status**: complete
- **Description**: Safe path helpers, file existence/read wrappers, and pattern-based file discovery with root containment checks.

### Project Scanner
- **Path**: `src/project-scanner.ts`
- **Status**: complete
- **Description**: Identifies entry points, source/test directories, config files, and detects empty projects via globbing.

### Timeout Config
- **Path**: `src/timeout-config.ts`
- **Status**: complete
- **Description**: Central timeout and agent-priority management with .env loading, formatting, and validation.

### Test Discovery
- **Path**: `src/test-discovery.ts`
- **Status**: complete
- **Description**: Maps source changes to likely tests, gathers git-changed files, and builds selective test commands per framework.

### Verification Report
- **Path**: `src/verification-report.ts`
- **Status**: complete
- **Description**: Formats verification results into markdown and compact summaries with status, criteria, and automated checks.

### Feature List
- **Path**: `src/feature-list.ts`
- **Status**: complete
- **Description**: CRUD and analytics for ai/feature_list.json: load/save, merge, stats, grouping, creation, deprecation, and conversions.

### Prompts
- **Path**: `src/prompts.ts`
- **Status**: complete
- **Description**: Generates harness documentation, commit messages, feature guidance, impact guidance, and session summaries.

### Agents
- **Path**: `src/agents.ts`
- **Status**: complete
- **Description**: Spawns Claude/Gemini/Codex CLIs with retry, timeout, availability checks, and status display.

### Upgrade
- **Path**: `src/upgrade.ts`
- **Status**: complete
- **Description**: Checks npm for updates, prompts users, upgrades package and optional plugin, and reports versions.

### Git Utils
- **Path**: `src/git-utils.ts`
- **Status**: complete
- **Description**: Git repo detection, change checks, add/commit helpers, branch lookup, and init support.

### Verification Prompts
- **Path**: `src/verification-prompts.ts`
- **Status**: complete
- **Description**: Builds AI verification prompts, truncates diffs intelligently, parses AI JSON, and quick-check prompts.

### Debug Logging
- **Path**: `src/debug.ts`
- **Status**: complete
- **Description**: DEBUG env-based namespaced logger with helpers for key subsystems.

### Verification Store
- **Path**: `src/verification-store.ts`
- **Status**: complete
- **Description**: Persists verification runs per feature, migrates legacy stores, maintains index, and provides history/stats.

### Progress Indicators
- **Path**: `src/progress.ts`
- **Status**: complete
- **Description**: TTY-aware spinner, progress bar, and step progress helpers for long operations.

### Init Script Generator
- **Path**: `src/init-script.ts`
- **Status**: complete
- **Description**: Produces bootstrap init.sh scripts from detected commands or minimal templates.

### AI Capability Discovery
- **Path**: `src/ai-capability-discovery.ts`
- **Status**: complete
- **Description**: Collects project context, builds AI prompts, parses responses, and returns extended capability guesses.

### Capability Cache
- **Path**: `src/capability-cache.ts`
- **Status**: complete
- **Description**: Caches detected capabilities with git-tracked invalidation and build-file tracking.

### Verifier
- **Path**: `src/verifier.ts`
- **Status**: complete
- **Description**: Runs automated checks, gathers diffs, orchestrates AI analysis (diff-based or autonomous), and saves results.

### Impact Analyzer
- **Path**: `src/impact-analyzer.ts`
- **Status**: complete
- **Description**: Finds dependent/sibling features, impact chains, blocking dependencies, and ready-to-work items.

### Schema Validation
- **Path**: `src/schema.ts`
- **Status**: complete
- **Description**: Defines and validates feature_list.json schema, IDs, and status values with Ajv.

### Progress Log
- **Path**: `src/progress-log.ts`
- **Status**: complete
- **Description**: Formats/parses progress.log entries, appends events, reads recents, and creates typed log entries.

### Capability Detector
- **Path**: `src/capability-detector.ts`
- **Status**: complete
- **Description**: Three-tier capability detection (cache, presets, AI), language inference, command normalization, and formatting.

### Domain Types
- **Path**: `src/types.ts`
- **Status**: complete
- **Description**: Shared domain types for features, surveys, commands, and impact analysis.

### Verification Types
- **Path**: `src/verification-types.ts`
- **Status**: complete
- **Description**: Type contracts for verification capabilities, results, metadata, and AI responses.

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
| git.tests | Unit tests for git utility functions with 100% branch coverage | git | ✅ passing |
| security.command_injection | Fix command injection vulnerabilities by using spawnSync with argument arrays | security | ✅ passing |
| security.path_traversal | Add path traversal validation for file operations | security | ✅ passing |
| quality.error_logging | Add proper error logging to all silent catch blocks | quality | ✅ passing |
| quality.file_utils | Create shared file-utils.ts module to eliminate code duplication | quality | ✅ passing |
| quality.refactor_runinit | Refactor runInit function into smaller focused functions | quality | ✅ passing |
| cli.quiet_json_output | Add --quiet and --json output modes for scripting | cli | ✅ passing |
| agents.windows_support | Add Windows support for agent detection | agents | ✅ passing |
| test.init_script | Add unit tests for init-script.ts | test | ✅ passing |
| test.prompts | Add unit tests for prompts.ts | test | ✅ passing |
| test.integration | Add integration tests for CLI commands | test | ✅ passing |
| test.verifier_coverage | Add comprehensive unit tests for verifier.ts to achieve 100% coverage | test | ✅ passing |
| test.debug_coverage | Add unit tests for debug.ts to achieve 100% coverage | test | ✅ passing |
| test.init_helpers_coverage | Add more unit tests for init-helpers.ts to achieve 100% coverage | test | ✅ passing |
| test.verification_store_coverage | Add unit tests for verification-store.ts to achieve 100% coverage | test | ✅ passing |
| test.capability_discovery_coverage | Add unit tests for capability-discovery.ts to achieve 100% coverage | test | ✅ passing |
| test.agents_coverage | Add unit tests for agents.ts to achieve 100% coverage | test | ✅ passing |
| test.capability_detector_coverage | Add unit tests for capability-detector.ts to achieve 100% coverage | test | ✅ passing |
| test.capability_cache_coverage | Add unit tests for capability-cache.ts to achieve 100% coverage | test | ✅ passing |
| verify.integrate_complete | Integrate AI verification into complete command for single-step workflow | verification | ✅ passing |
| verify.smart_diff_truncation | Implement intelligent diff truncation for large diffs in AI prompts | verification | ✅ passing |
| verify.ai_retry_logic | Add retry logic with exponential backoff for AI verification calls | verification | ✅ passing |
| docs.clean_survey_format | Clean up PROJECT_SURVEY.md format by separating translations | docs | ✅ passing |
| test.e2e_cli_flows | Add end-to-end integration tests for CLI command flows | test | ✅ passing |
| ux.progress_indicators | Add progress indicators for long-running operations | ux | ✅ passing |
| cli.auto_upgrade | Automatically detect and silently upgrade to newer npm package versions on CLI startup | cli | ✅ passing |
| test.test_discovery_coverage | Add comprehensive unit tests for test-discovery.ts to achieve >90% coverage | test | ✅ passing |
| test.verifier_selective_coverage | Add unit tests for selective test execution features in verifier.ts | test | ✅ passing |
| test.overall_coverage_target | Achieve overall project code coverage of >85% | test | ✅ passing |
| test.verifier_autonomous_coverage | Add unit tests for autonomous verification mode in verifier.ts | test | ✅ passing |
| test.upgrade_coverage | Add unit tests for interactive upgrade functionality in upgrade.ts | test | ✅ passing |
| test.progress_coverage | Add unit tests for progress indicator edge cases in progress.ts | test | ✅ passing |
| test.timeout_config_coverage | Add unit tests for timeout configuration in timeout-config.ts | test | ✅ passing |
| test.git_utils_coverage | Add unit tests for remaining git utility functions in git-utils.ts | test | ✅ passing |
| test.ai_scanner_coverage | Add unit tests for AI scanner edge cases in ai-scanner.ts | test | ✅ passing |
| test.overall_coverage_90 | Achieve overall project code coverage of >90% | test | ✅ passing |
| config.agent_priority_env | Add single environment variable for agent priority and enablement | config | ✅ passing |
| config.agent_priority_function | Create getAgentPriority() function to centralize agent order retrieval | config | ✅ passing |
| config.refactor_hardcoded_priority | Refactor agent calling functions to use centralized priority configuration | config | ✅ passing |
| config.update_env_example | Update .env.example with agent configuration documentation | config | ✅ passing |
| test.agent_priority_coverage | Add unit tests for agent priority configuration | test | ✅ passing |
| verify.store_types | Add new TypeScript interfaces for per-feature verification storage | verification | ✅ passing |
| verify.report_generator | Create markdown report generator for verification results | verification | ✅ passing |
| verify.store_refactor | Refactor verification-store.ts for per-feature subdirectory storage | verification | ✅ passing |
| verify.store_migration | Add migration from old results.json to new per-feature structure | verification | ✅ passing |
| test.verify_store_refactor | Add unit tests for refactored verification storage | test | ✅ passing |

## Completion Assessment

**Overall: 100%**

**Notes:**
- All features are passing
- Completed 78/78 features
- Last updated: 2025-12-01

## Recommendations

- Add offline fallback paths or clearer user messaging when no AI agents are installed to improve robustness.
> 在未安装 AI 代理时增加离线回退路径或更明确提示，以提升健壮性。
- Expand integration tests to exercise autonomous verification and capability detection with mocked agent responses end-to-end.
> 扩展集成测试，使用模拟代理响应端到端覆盖自主验证与能力检测。
- Consider packaging a default init.sh template into dist to avoid runtime generation dependencies.
> 考虑将默认 init.sh 模板打包进 dist，减少运行时生成依赖。

## Commands

```bash
# Install dependencies
npm install
> 使用 npm install 安装依赖

# Start development server
npm run dev
> 使用 npm run dev 启动开发模式

# Build for production
npm run build
> 使用 npm run build 构建产物

# Run tests
npm test
> 使用 npm test 运行测试
```

---

*Generated by agent-foreman with AI analysis*