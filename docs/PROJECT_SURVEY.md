# Project Survey (AI-Enhanced)

## Summary

TypeScript CLI that equips AI agents with a long-task harness: surveying projects, initializing feature backlogs, guiding next steps, and verifying work with automated checks plus AI analysis. Includes capability detection, selective testing, git automation, and markdown reporting while integrating with Claude Code via plugin docs. Modular utilities cover progress logging, schema validation, impact analysis, and init script generation to keep multi-session development aligned.

> Analyzed by: codex

## Tech Stack

| Aspect | Value |
|--------|-------|
| Language | TypeScript |
| Framework | none |
| Build Tool | tsc |
| Test Framework | Vitest |
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
- **Description**: Yargs-driven CLI entrypoint implementing survey/init/step/status/impact/complete/check/agents/capability commands and goal detection

### AI Scanner
- **Path**: `src/ai-scanner.ts`
- **Status**: complete
- **Description**: Autonomous AI project survey generation, feature extraction, and survey markdown rendering

### Init Helpers
- **Path**: `src/init-helpers.ts`
- **Status**: complete
- **Description**: Project detection, feature merging/creation, and harness file generation including init.sh and CLAUDE.md

### Project Scanner
- **Path**: `src/project-scanner.ts`
- **Status**: complete
- **Description**: Directory structure scanning for entry/src/test/config files and empty-project detection

### File Utilities
- **Path**: `src/file-utils.ts`
- **Status**: complete
- **Description**: Safe path handling, existence checks, and directory/file readers

### Timeout Config
- **Path**: `src/timeout-config.ts`
- **Status**: complete
- **Description**: Timeout defaults/env overrides and agent priority loading

### Verification Report
- **Path**: `src/verification-report.ts`
- **Status**: complete
- **Description**: Markdown reporting and summaries for verification runs

### Types
- **Path**: `src/types.ts`
- **Status**: complete
- **Description**: Core domain type definitions for features, surveys, and CLI options

### Feature List
- **Path**: `src/feature-list.ts`
- **Status**: complete
- **Description**: Feature list CRUD, selection, status/verification updates, and stats

### Prompts
- **Path**: `src/prompts.ts`
- **Status**: complete
- **Description**: Markdown prompt generators for harness docs, guidance, and summaries

### Agents
- **Path**: `src/agents.ts`
- **Status**: complete
- **Description**: AI agent command detection, invocation, retry, and status display

### Upgrade
- **Path**: `src/upgrade.ts`
- **Status**: complete
- **Description**: Upgrade checks against npm and Claude plugin with interactive prompts

### Git Utils
- **Path**: `src/git-utils.ts`
- **Status**: complete
- **Description**: Git repo checks, change detection, staging, commits, and init helpers

### Init Script Generator
- **Path**: `src/init-script.ts`
- **Status**: complete
- **Description**: Generate ai/init.sh scripts from capabilities or minimal templates

### Verification Types
- **Path**: `src/verification-types.ts`
- **Status**: complete
- **Description**: Verification capability and result data models

### Verifier
- **Path**: `src/verifier.ts`
- **Status**: complete
- **Description**: Automated checks plus AI verification (diff-based and autonomous) with retries and persistence

### Impact Analyzer
- **Path**: `src/impact-analyzer.ts`
- **Status**: complete
- **Description**: Dependency graph analysis and recommendations for affected features

### Schema Validator
- **Path**: `src/schema.ts`
- **Status**: complete
- **Description**: JSON schema validation for feature_list.json and helpers

### Progress Indicators
- **Path**: `src/progress.ts`
- **Status**: complete
- **Description**: TTY-aware spinner, progress bar, and step progress utilities

### Progress Log
- **Path**: `src/progress-log.ts`
- **Status**: complete
- **Description**: Progress log formatting, parsing, entry creation, and retrieval

### Project Capabilities
- **Path**: `src/project-capabilities.ts`
- **Status**: complete
- **Description**: Capability cache handling and AI-driven detection of test/lint/build/typecheck commands

### Test Discovery
- **Path**: `src/test-discovery.ts`
- **Status**: complete
- **Description**: Selective test discovery from changes or patterns and command generation

### Verification Prompts
- **Path**: `src/verification-prompts.ts`
- **Status**: complete
- **Description**: Diff truncation, verification prompt building, and AI response parsing

### Verification Store
- **Path**: `src/verification-store.ts`
- **Status**: complete
- **Description**: Per-feature verification persistence, migration, history, and stats

### Plugin Definitions
- **Path**: `plugins/agent-foreman`
- **Status**: complete
- **Description**: Claude Code agent, commands, and skills documentation for survey/init/step/auto-complete flows

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
| init.capabilities_bridge | Add bridge function to convert ExtendedCapabilities to init.sh script | init | ✅ passing |
| init.detect_during_init | Run capabilities detection during init command and use results for init.sh | init | ✅ passing |
| test.init_capabilities_coverage | Add unit tests for unified capabilities detection during init | test | ✅ passing |

## Completion Assessment

**Overall: 100%**

**Notes:**
- All features are passing
- Completed 81/81 features
- Last updated: 2025-12-02

## Recommendations

- Add a local mock or dry-run agent option to exercise survey/verification flows when external AI CLIs are unavailable
- Validate generated ai/init.sh commands against project dependencies and surface clearer errors when required tools are missing
- Document common selective test patterns and timeout/env tuning in USAGE to simplify quick-mode adoption for new projects

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