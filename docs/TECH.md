# Technical Architecture

## Overview

agent-foreman is a TypeScript CLI tool that manages long-running AI agent tasks through feature-driven development with external memory.

> agent-foreman 是一个 TypeScript CLI 工具，通过功能驱动开发和外部记忆管理长时间运行的 AI 代理任务。

---

## System Architecture

```text
┌─────────────────────────────────────────────────────────┐
│                     CLI Layer                            │
│  Commands: analyze, init, next, status, done, etc.      │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                  Core Business Logic                     │
│  feature-list, verifier, agents, ai-scanner              │
└───────────────────────┬─────────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────────┐
│                Infrastructure Layer                      │
│  git-utils, file-utils, progress-log, capability-cache   │
└─────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Category | Technology |
|----------|-----------|
| Language | TypeScript (ES2022, strict mode) |
| Runtime | Node.js |
| CLI Framework | yargs |
| Validation | ajv + ajv-formats |
| Testing | Vitest |
| Build | tsc |

---

## Module Overview

### CLI Entry (`src/index.ts`)

Main entry point implementing all CLI commands via yargs.

### Feature Management

| Module | Purpose |
|--------|---------|
| `feature-list.ts` | CRUD operations for features, priority selection |
| `schema.ts` | JSON Schema validation for feature_list.json |
| `impact-analyzer.ts` | Dependency graph analysis |

### AI Integration

| Module | Purpose |
|--------|---------|
| `agents.ts` | Multi-agent abstraction (Claude, Gemini, Codex) |
| `ai-scanner.ts` | Autonomous project exploration |
| `capabilities/ai-discovery.ts` | AI-based capability detection |

### Verification System

| Module | Purpose |
|--------|---------|
| `verifier/core.ts` | Core verification orchestration |
| `verifier/prompts.ts` | AI prompt construction |
| `verifier/tdd.ts` | TDD verification mode |
| `verifier/autonomous.ts` | Autonomous verification mode |
| `verification-store/` | Result persistence (per-feature directories) |
| `capabilities/` | Three-tier capability detection with caching |
| `test-discovery.ts` | Test file discovery and selective execution |

### Infrastructure

| Module | Purpose |
|--------|---------|
| `git-utils.ts` | Git operations (diff, commit, status) |
| `file-utils.ts` | Safe file operations with path validation |
| `progress-log.ts` | Session handoff logging |
| `progress.ts` | TTY progress indicators |

---

## External AI Agents

agent-foreman supports multiple AI CLI tools with automatic failover:

| Agent | Priority | Command |
|-------|----------|---------|
| Codex | 1 (highest) | `codex exec --skip-git-repo-check --full-auto -` |
| Gemini | 2 | `gemini --output-format text --yolo` |
| Claude | 3 | `claude --print --output-format text --dangerously-skip-permissions` |

**Note:** Priority can be customized via `AGENT_FOREMAN_AGENTS` environment variable (comma-separated list).

**Selection Logic:**

1. Check availability in priority order
2. Use first available agent
3. Fallback to next on failure

---

## Capability Detection (Three-Tier)

```text
┌──────────────────────────────────────────────────────┐
│              Capability Detection Flow                │
├──────────────────────────────────────────────────────┤
│                                                       │
│  1. Cache Check                                       │
│     └─ Read ai/capabilities.json                     │
│     └─ If valid and not stale → use cached          │
│                    │                                  │
│                    ▼ (cache miss)                    │
│  2. Preset Detection                                 │
│     └─ Pattern matching on config files              │
│     └─ If high confidence → use preset              │
│                    │                                  │
│                    ▼ (low confidence)                │
│  3. AI Discovery                                     │
│     └─ Spawn AI agent to analyze project            │
│     └─ Parse JSON response                          │
│     └─ Cache results                                │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## Verification Flow

```text
agent-foreman done <feature_id>
                │
                ▼
┌─────────────────────────────────┐
│  1. Get git diff + changed files │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  2. Detect project capabilities  │
│     (tests, typecheck, lint)     │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  3. Run automated checks         │
│     npm test, tsc, eslint, etc.  │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  4. AI Analysis                  │
│     - Feature + acceptance       │
│     - Git diff                   │
│     - Check results              │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  5. Return verdict               │
│     pass | fail | needs_review   │
└─────────────────────────────────┘
```

---

## Data Persistence

### Feature List (`ai/feature_list.json`)

JSON file validated against JSON Schema. Supports:

- Full CRUD operations
- Status transitions
- Dependency tracking
- Verification summaries

### Progress Log (`ai/progress.log`)

Append-only text file with single-line entries:

```text
TIMESTAMP TYPE key=value key=value summary="..."
```

### Capability Cache (`ai/capabilities.json`)

Cached capability detection results with:

- Git commit tracking for staleness
- 24-hour TTL
- Forced refresh option

### Verification Results (`ai/verification/`)

Per-feature verification results stored in directories:

```text
ai/verification/
├── index.json                 # Index of all results
└── {featureId}/
    ├── 001.json               # Verification metadata
    └── 001.md                 # Verification report
```

Legacy format (`ai/verification/results.json`) is auto-migrated to new format.

---

## Error Handling

### Retry Logic

AI operations use exponential backoff:

- Initial: 2 seconds
- Factor: 2x
- Max retries: 3
- Max delay: 8 seconds

### Transient Error Detection

Patterns indicating retry-able failures:

- "timeout"
- "rate limit"
- "connection"
- "ECONNRESET"

### Graceful Degradation

Graceful degradation strategies:

- AI agent failover (Codex → Gemini → Claude)
- Preset fallback when AI unavailable
- Minimal capability profile as last resort

---

## Security Considerations

### Path Traversal Prevention

All file operations validate paths against:

- Null byte injection
- Parent directory traversal (`..`)
- Absolute path outside project

### Command Injection Prevention

All subprocess calls use:

- `spawnSync` with argument arrays (not shell strings)
- No shell interpolation

### Git Safety

Git safety measures:

- No force pushes
- No hook bypassing
- Respects git hooks

---

## Plugin System

agent-foreman integrates with Claude Code as a plugin:

```text
plugins/agent-foreman/
├── agents/foreman.md      # Agent definition
├── skills/                 # 4 skills
│   ├── project-analyze/
│   ├── init-harness/
│   ├── feature-next/
│   └── feature-run/
└── commands/               # 5 slash commands
    ├── analyze.md
    ├── init.md
    ├── next.md
    ├── run.md
    └── status.md
```

---

## Testing Strategy

### Unit Tests

- Pure function testing
- Mocked file system and git
- Mocked AI responses

### Integration Tests

- Real file system (temp directories)
- Real git operations
- Mocked AI

### Coverage

Target: High coverage on core modules
Framework: Vitest with v8 coverage

---

## Performance Optimizations

1. **Capability Caching** - Avoid re-detection on every verification
2. **Selective Testing** - Run only related tests with `--quick` mode
3. **Intelligent Diff Truncation** - Keep AI prompts within limits
4. **Parallel Tool Calls** - Where dependencies allow

---

*For usage documentation, see [USAGE.md](./USAGE.md)*
