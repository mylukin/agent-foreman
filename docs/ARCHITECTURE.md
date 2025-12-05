# Project Survey (AI-Enhanced)

## Summary

agent-foreman is a Long Task Harness for AI agents enabling feature-driven development with external memory. It provides a CLI tool that manages feature backlogs, tracks progress across sessions, and uses AI agents (Claude, Gemini, Codex) for autonomous verification of feature completion. The system includes TDD guidance generation, selective test execution, impact analysis, and Claude Code plugin integration.

> Analyzed by: claude

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

### commands
- **Path**: `src/commands`
- **Status**: complete
- **Description**: CLI command handlers (analyze, init, next, status, impact, check, done, scan, agents)

### verifier
- **Path**: `src/verifier`
- **Status**: complete
- **Description**: AI-powered feature verification system with automated checks and autonomous exploration

### capabilities
- **Path**: `src/capabilities`
- **Status**: complete
- **Description**: Project capability detection with AI discovery, caching, and git invalidation

### tdd-guidance
- **Path**: `src/tdd-guidance`
- **Status**: complete
- **Description**: TDD guidance generation - converts acceptance criteria to test case suggestions

### verification-store
- **Path**: `src/verification-store`
- **Status**: complete
- **Description**: Persistence layer for verification results with per-feature subdirectories

### agents
- **Path**: `src/agents.ts`
- **Status**: complete
- **Description**: AI agent subprocess management (Claude, Gemini, Codex CLI integration)

### feature-list
- **Path**: `src/feature-list.ts`
- **Status**: complete
- **Description**: Feature list operations - load, save, merge, status management

### progress-log
- **Path**: `src/progress-log.ts`
- **Status**: complete
- **Description**: Progress log operations for session handoff and audit

### ai-scanner
- **Path**: `src/ai-scanner.ts`
- **Status**: complete
- **Description**: AI-powered autonomous project scanner for codebase analysis

### init-helpers
- **Path**: `src/init-helpers.ts`
- **Status**: complete
- **Description**: Helper functions for harness initialization with AI-assisted merging

### test-discovery
- **Path**: `src/test-discovery.ts`
- **Status**: complete
- **Description**: Test discovery and selective test execution based on changes

### impact-analyzer
- **Path**: `src/impact-analyzer.ts`
- **Status**: complete
- **Description**: Dependency graph and impact analysis for feature changes

### git-utils
- **Path**: `src/git-utils.ts`
- **Status**: complete
- **Description**: Git operations for auto-commit, diff, and status checking

### upgrade
- **Path**: `src/upgrade.ts`
- **Status**: complete
- **Description**: Auto-upgrade utility with npm version checking and interactive prompts

### schema
- **Path**: `src/schema.ts`
- **Status**: complete
- **Description**: JSON Schema validation for feature_list.json using ajv

### prompts
- **Path**: `src/prompts.ts`
- **Status**: complete
- **Description**: Prompt templates for CLAUDE.md generation and documentation

### timeout-config
- **Path**: `src/timeout-config.ts`
- **Status**: complete
- **Description**: Centralized timeout configuration with environment variable support

### debug
- **Path**: `src/debug.ts`
- **Status**: complete
- **Description**: Debug logging utility with namespace-based conditional logging

### test-gate
- **Path**: `src/test-gate.ts`
- **Status**: complete
- **Description**: Test file gate verification before feature completion

### plugins
- **Path**: `plugins/agent-foreman`
- **Status**: complete
- **Description**: Claude Code plugin with commands, skills, and agent definitions

## Feature Completion Status

| ID | Description | Module | Status |
|----|-------------|--------|--------|
| cli.analyze | Generate AI-powered project survey and write docs/PROJECT_SURVEY.md with summary stats output. | cli | ✅ passing |
| cli.init | Initialize or upgrade harness by analyzing project/goal, merging features, generating init.sh, CLAUDE.md, and progress log. | cli | ✅ passing |
| cli.next | Select next feature (or specific ID), optionally run checks, show status, TDD guidance, and feature briefings. | cli | ✅ passing |
| cli.status | Display project goal, feature stats, completion bar, recent activity, and optional JSON/quiet modes. | cli | ✅ passing |
| cli.impact | Report dependent and same-module features with recommendations for change impact. | cli | ✅ passing |
| cli.done | Verify feature (tests/AI), enforce test file gate, update status, log progress, and auto-commit with suggestion fallback. | cli | ✅ passing |
| cli.check | Run feature verification without marking done, supporting autonomous mode, quick/full tests, and E2E control. | cli | ✅ passing |
| cli.agents | List available AI agents and their availability. | cli | ✅ passing |
| cli.scan | Scan or refresh cached project capabilities with optional verbose output. | cli | ✅ passing |
| goal.autodetect | Infer project goal from package.json description or README before falling back to directory name. | cli | ✅ passing |
| ai.scanProject | Run autonomous agent to survey repository structure, configs, and code, returning structured tech/modules/features. | ai-scanner | ✅ passing |
| ai.generateFromSurvey | Convert existing PROJECT_SURVEY.md and goal into feature list via AI. | ai-scanner | ✅ passing |
| ai.generateFromGoal | Create initial tech stack and feature backlog from goal text for empty projects. | ai-scanner | ✅ passing |
| ai.surveyMarkdown | Render AI survey data into Markdown with tech stack, structure, modules, features, completion, recommendations, and commands. | ai-scanner | ✅ passing |
| agents.callAny | Try prioritized agents with spinners, timeouts, and verbose errors until one succeeds. | agents | ✅ passing |
| agents.callWithRetry | Retry single-agent execution with configurable attempts and delays. | agents | ✅ passing |
| agents.checkAvailable | Detect installed AI CLIs and report availability list or detailed status. | agents | ✅ passing |
| structure.scan | Gather entry points, src/test directories, and config files across common patterns. | project-scanner | ✅ passing |
| structure.isEmpty | Determine if project lacks source files across multiple languages/directories. | project-scanner | ✅ passing |
| features.loadSave | Read/write ai/feature_list.json with schema validation and metadata updates. | feature-list | ✅ passing |
| features.selection | Select next feature prioritizing needs_review then failing by priority. | feature-list | ✅ passing |
| features.dependencyQueries | Find dependents, same-module peers, and generate deprecation or dependency-aware updates. | feature-list | ✅ passing |
| features.testRequirements | Auto-generate testRequirements and module-based test patterns for discovered features. | feature-list | ✅ passing |
| features.stats | Compute feature status counts and completion percentages excluding deprecated items. | feature-list | ✅ passing |
| progress.logOps | Format, append, and parse single-line progress log entries with escape handling. | progress-log | ✅ passing |
| progress.recent | Retrieve recent progress entries and render for display. | progress-log | ✅ passing |
| init.detectAnalyze | Choose between survey reuse, empty-goal generation, or fresh AI scan before init. | init-helpers | ✅ passing |
| init.mergeFeatures | Merge discovered features into existing list respecting mode (merge/new/scan) and goal updates. | init-helpers | ✅ passing |
| init.generateHarness | Detect capabilities, generate or AI-merge init.sh, update CLAUDE.md, log init, and suggest commit. | init-helpers | ✅ passing |
| initScript.generate | Produce init.sh from capabilities with bootstrap/dev/check/build/status commands and quick/full/E2E flags. | init-script | ✅ passing |
| prompts.harnessDocs | Generate harness instructions section and CLAUDE.md content from goal. | prompts | ✅ passing |
| prompts.featureGuidance | Emit feature guidance with acceptance checklist, dependencies, notes, and workflow steps. | prompts | ✅ passing |
| tdd.guidance | Convert acceptance to unit/E2E cases, suggest test files, and map criteria to tests. | tdd-guidance | ✅ passing |
| tdd.unitSkeletons | Generate unit test skeletons for Vitest/Jest/Mocha/Pytest/Go/Cargo frameworks. | tdd-guidance | ✅ passing |
| tdd.e2eSkeletons | Generate Playwright-style E2E skeletons with page object template and tag support. | tdd-guidance | ✅ passing |
| tests.discovery | Map source changes to test candidates, detect existing tests, and choose patterns or files for selective runs. | test-discovery | ✅ passing |
| tests.selectiveCommand | Build selective test commands via AI-discovered templates or framework fallbacks. | test-discovery | ✅ passing |
| tests.e2eCommand | Assemble E2E commands with tag-based grep modes (full/smoke/tags/skip). | test-discovery | ✅ passing |
| verification.runAutomated | Execute tests/typecheck/lint/build/E2E (or init.sh) with progress bars and CI env handling. | verification | ✅ passing |
| verification.analyzeWithAI | Build verification prompt with diff, automated results, related files, and call AI with retries/backoff. | verification | ✅ passing |
| verification.verifyFeature | Full verification pipeline using git diff, selective tests, AI analysis, result formatting, and saving. | verification | ✅ passing |
| verification.autonomous | Autonomous verification mode that lets AI explore codebase with optional automated checks. | verification | ✅ passing |
| verification.tdd | TDD verification that runs specified test files (and E2E if required) to derive verdict without AI. | verification | ✅ passing |
| verification.diffTruncation | Intelligently truncate diffs preserving structure for prompts and fallback quick-check prompts. | verification-support | ✅ passing |
| verification.reports | Generate markdown verification reports and compact summaries. | verification-support | ✅ passing |
| verification.store | Persist verification runs per feature, maintain index, migrate legacy results, and query history/stats. | verification-support | ✅ passing |
| capabilities.detect | AI-driven discovery of test/build/typecheck/lint/E2E commands with confidence scoring and config tracking. | project-capabilities | ✅ passing |
| capabilities.cache | Load/save/invalidate capabilities cache with staleness checks against git commit and tracked files. | project-capabilities | ✅ passing |
| impact.analysis | Compute directly and potentially affected features, recommend needs_review/deprecation/notes updates. | impact-analyzer | ✅ passing |
| impact.graphOps | Build dependency graph, detect cycles, compute readiness/topological order and dependency depth. | impact-analyzer | ✅ passing |
| git.statusOps | Detect git repo, dirty state, changed/staged files, and current branch. | utilities | ✅ passing |
| git.commitOps | Stage paths or all changes and create commits with hash retrieval. | utilities | ✅ passing |
| file.safety | Safe path validation/joining, existence checks, and guarded file reads. | utilities | ✅ passing |
| timeout.config | Configurable operation timeouts via env/.env with formatting and agent priority parsing. | utilities | ✅ passing |
| progress.ui | Spinner, progress bar, and step progress utilities for CLI-friendly feedback. | utilities | ✅ passing |
| test.gate | Validate required unit/E2E test files exist for a feature and discover matching tests. | utilities | ✅ passing |
| upgrade.check | Check npm for newer agent-foreman versions, prompt to upgrade, update plugin, and run installs. | utilities | ✅ passing |
| refactor.verifier.split | Split verifier.ts (1,568 lines) into 8 focused modules under src/verifier/ directory. | refactor | ✅ passing |
| refactor.index.split | Split index.ts (1,530 lines) into 11 focused modules under src/commands/ directory. | refactor | ✅ passing |
| refactor.capabilities.split | Split project-capabilities.ts (837 lines) into 5 focused modules under src/capabilities/ directory. | refactor | ✅ passing |
| refactor.verification-store.split | Split verification-store.ts (773 lines) into 4 focused modules under src/verification-store/ directory. | refactor | ✅ passing |
| refactor.tdd-guidance.split | Split tdd-guidance.ts (705 lines) into 5 focused modules under src/tdd-guidance/ directory. | refactor | ✅ passing |

## Completion Assessment

**Overall: 100%**

**Notes:**
- All features are passing
- Completed 62/62 features
- Last updated: 2025-12-05

## Recommendations

- Consider adding E2E tests for CLI commands
- Add more comprehensive error handling documentation
- Consider adding telemetry for usage analytics
- Document the plugin development workflow for third-party extensions

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