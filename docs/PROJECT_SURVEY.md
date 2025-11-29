# Project Survey (AI-Enhanced)

## Summary

Agent-foreman is a TypeScript CLI harness that uses AI agents to survey projects, generate/manage feature backlogs, and orchestrate verification with progress logging and git integration.
> agent-foreman 是一个 TypeScript CLI 脚手架，利用 AI 调研项目、生成/管理特性清单，并结合进度日志与 Git 集成来编排验证流程。

> Analyzed by: codex

## Tech Stack

| Aspect | Value |
|--------|-------|
| Language | TypeScript/Node.js |
| Framework | None (CLI utilities) |
| Build Tool | tsc |
| Test Framework | vitest |
| Package Manager | npm |

## Directory Structure

### Entry Points
- `src/index.ts`

### Source Directories
- `src/`

## Modules

### CLI
- **Path**: `src/index.ts`
- **Status**: complete
- **Description**: Command-line entrypoint offering survey, init, step, status, impact, verify, complete, detect-capabilities, agents, and slash-command installation flows.

### AI Scanner
- **Path**: `src/ai-scanner.ts`
- **Status**: complete
- **Description**: Builds autonomous exploration prompts, parses AI survey responses, and renders bilingual or Chinese survey markdown.

### AI Capability Discovery
- **Path**: `src/ai-capability-discovery.ts`
- **Status**: complete
- **Description**: Collects config/build/source samples, crafts discovery prompts, parses AI JSON, and falls back to minimal capability profiles.

### Capability Detector & Cache
- **Path**: `src/capability-detector.ts; src/capability-cache.ts`
- **Status**: complete
- **Description**: Preset and AI-based verification capability detection with confidence scoring, git-aware caching, staleness checks, and formatting helpers.

### Agents Manager
- **Path**: `src/agents.ts`
- **Status**: complete
- **Description**: Defines default Claude/Gemini/Codex configs, availability checks, process spawning with retries/timeouts, and status printing.

### Feature List
- **Path**: `src/feature-list.ts`
- **Status**: complete
- **Description**: Loads/saves validated feature_list.json, selects next feature by priority/status, merges discoveries, and supports CRUD/status/verification updates.

### Progress Log
- **Path**: `src/progress-log.ts`
- **Status**: complete
- **Description**: Formats/parses single-line progress entries, appends/read logs, fetches recent activity, and provides entry builders.

### Progress UI
- **Path**: `src/progress.ts`
- **Status**: complete
- **Description**: TTY-aware spinner, progress bar, and step progress utilities for long tasks.

### Init Helpers
- **Path**: `src/init-helpers.ts`
- **Status**: complete
- **Description**: Detects project state, runs AI scans or goal generation, merges/creates feature lists, writes init.sh/CLAUDE.md/progress logs via AI-assisted merges.

### Init Script Generator
- **Path**: `src/init-script.ts`
- **Status**: complete
- **Description**: Generates full or minimal ai/init.sh with bootstrap/dev/check/verify/build/status/help functions and TypeScript checks.

### Project Scanner
- **Path**: `src/project-scanner.ts`
- **Status**: complete
- **Description**: Finds entry points, source/test/config directories and detects empty projects using glob scans.

### Prompts
- **Path**: `src/prompts.ts`
- **Status**: complete
- **Description**: Creates harness documentation sections, commit messages, feature guidance, impact guidance, and session summaries.

### Schema & Types
- **Path**: `src/schema.ts; src/types.ts`
- **Status**: complete
- **Description**: JSON schema validation for feature lists plus core domain/type definitions for features, surveys, capabilities, and verification data.

### Verification Prompts
- **Path**: `src/verification-prompts.ts`
- **Status**: complete
- **Description**: Intelligent diff truncation, AI verification prompt building, response parsing, and quick-check prompt helpers.

### Verification Store
- **Path**: `src/verification-store.ts`
- **Status**: complete
- **Description**: Persists verification results to ai/verification/results.json with CRUD helpers and summary stats.

### Verifier
- **Path**: `src/verifier.ts`
- **Status**: complete
- **Description**: Runs git diff capture, capability detection, automated checks, AI analysis with retry/backoff, result formatting, and summary embedding.

### Git Utils
- **Path**: `src/git-utils.ts`
- **Status**: complete
- **Description**: Git repo checks, change detection, staging, committing, branch lookup, and staged-change detection helpers.

### File Utils
- **Path**: `src/file-utils.ts`
- **Status**: complete
- **Description**: Path safety validation, safe joins/reads, existence checks, pattern finds, and directory checks.

### Impact Analyzer
- **Path**: `src/impact-analyzer.ts`
- **Status**: complete
- **Description**: Dependency graph analysis to find affected features, recommendations, readiness checks, ordering, and depth calculations.

### Plugins
- **Path**: `plugins/agent-foreman`
- **Status**: complete
- **Description**: Claude plugin assets (agent profile, slash commands, skills) documenting workflows for survey/init/feature steps.

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

## Completion Assessment

**Overall: 100%**

**Notes:**
- All features are passing
- Completed 57/57 features
- Last updated: 2025-11-29

## Recommendations

- Ensure Claude/Gemini/Codex CLIs are installed and authenticated for AI features.
> 确保已安装并授权 Claude/Gemini/Codex CLI，以便使用 AI 功能。
- Keep ai/feature_list.json and ai/progress.md under version control to preserve external memory.
> 将 ai/feature_list.json 与 ai/progress.md 納入版本控制，保存外部记忆。
- Periodically run agent-foreman detect-capabilities --force when build/test tooling changes.
> 当构建/测试工具变更时，定期运行 agent-foreman detect-capabilities --force。

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