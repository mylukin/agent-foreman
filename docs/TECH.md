# Technical Architecture

## Overview

agent-foreman is a TypeScript CLI tool that manages long-running AI agent tasks through feature-driven development with external memory.

> agent-foreman 是一个 TypeScript CLI 工具，通过功能驱动开发和外部记忆管理长时间运行的 AI 代理任务。

---

## System Architecture

```text
┌──────────────────────────────────────────────────────────────────────┐
│                           CLI Layer                                   │
│  Core: analyze, init, next, check, done, status, impact, scan        │
│  Utility: agents, upgrade, install, uninstall                        │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│                      Core Business Logic                              │
│  features/, verifier/, agents/, scanner/, capabilities/               │
└─────────────────────────────┬────────────────────────────────────────┘
                              │
┌─────────────────────────────▼────────────────────────────────────────┐
│                      Infrastructure Layer                             │
│  git-utils, file-utils, progress-log, storage/, schemas/              │
└──────────────────────────────────────────────────────────────────────┘
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

### Task Management (`src/features/`)

| Module | Purpose |
|--------|---------|
| `features/index.ts` | CRUD operations for tasks, priority selection |
| `features/selection.ts` | Feature selection logic |
| `features/mutations.ts` | Status updates and modifications |
| `schemas/` | JSON Schema validation (feature-list, frontmatter, index) |
| `impact-analyzer.ts` | Dependency graph analysis |
| `storage/` | Markdown parsing/serialization for task files |

### AI Integration (`src/agents/`)

| Module | Purpose |
|--------|---------|
| `agents/config.ts` | Agent configuration (Claude, Codex, Gemini) |
| `agents/executor.ts` | Agent execution with retry logic |
| `agents/detection.ts` | Agent availability detection |
| `agents/orchestrator.ts` | Multi-agent orchestration |
| `scanner/` | Autonomous project exploration |
| `capabilities/ai-discovery.ts` | AI-based capability detection |

### Verification System (`src/verifier/`)

| Module | Purpose |
|--------|---------|
| `verifier/core.ts` | Core verification orchestration |
| `verifier/ai-analysis.ts` | AI analysis with retry logic |
| `verifier/check-executor.ts` | Automated check execution |
| `verification-prompts.ts` | AI prompt construction |
| `verification-store/` | Result persistence (directory) |
| `capabilities/` | Two-tier capability detection (cache + AI) |
| `capabilities/cache.ts` | Disk cache with git-based staleness |
| `testing/` | Test file discovery and selective execution |
| `tdd-guidance/` | TDD guidance generation |

### Infrastructure

| Module | Purpose |
|--------|---------|
| `git-utils.ts` | Git operations (diff, commit, status) |
| `file-utils.ts` | Safe file operations with path validation |
| `progress-log.ts` | Session handoff logging |
| `progress/` | TTY progress indicators (spinner, step-progress) |

---

## External AI Agents

agent-foreman supports multiple AI CLI tools with automatic failover:

| Agent | Priority | Command |
|-------|----------|---------|
| Claude | 1 (highest) | `claude --print --output-format text --permission-mode bypassPermissions` |
| Codex | 2 | `codex exec --skip-git-repo-check --full-auto -` |
| Gemini | 3 | `gemini --output-format text --yolo` |

**Selection Logic:**

1. Check availability in priority order (Claude → Codex → Gemini)
2. Use first available agent
3. Fallback to next on failure
4. Configurable via `AGENT_FOREMAN_AGENTS` environment variable

---

## Capability Detection (Two-Tier)

```text
┌──────────────────────────────────────────────────────┐
│              Capability Detection Flow                │
├──────────────────────────────────────────────────────┤
│                                                       │
│  0. Memory Cache (fastest)                           │
│     └─ In-process cache with 1-minute TTL           │
│     └─ If valid → use memory cached                 │
│                    │                                  │
│                    ▼ (memory miss)                   │
│  1. Disk Cache Check                                 │
│     └─ Read ai/capabilities.json                    │
│     └─ Check staleness via git commit tracking      │
│     └─ If valid and not stale → use cached          │
│                    │                                  │
│                    ▼ (cache miss or stale)          │
│  2. AI Discovery                                     │
│     └─ Spawn AI agent to analyze project            │
│     └─ Parse JSON response                          │
│     └─ Cache results to disk                        │
│     └─ Update memory cache                          │
│                                                       │
└──────────────────────────────────────────────────────┘
```

---

## Verification Flow

```text
agent-foreman check <task_id>
                │
                ▼
┌─────────────────────────────────────────────┐
│  1. Get git diff + Detect capabilities       │
│     (executed in PARALLEL for performance)   │
└───────────────┬─────────────────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  2. Run automated checks         │
│     npm test, tsc, eslint, etc.  │
│     (selective or full mode)     │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  3. AI Analysis                  │
│     - Task + acceptance criteria │
│     - Git diff + related files   │
│     - Check results              │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  4. Save verification result     │
│     ai/verification/results.json │
└───────────────┬─────────────────┘
                │
                ▼
┌─────────────────────────────────┐
│  5. Return verdict               │
│     pass | fail | needs_review   │
└─────────────────────────────────┘

agent-foreman done <task_id>
                │
                ▼
┌─────────────────────────────────┐
│  1. TDD Gate check (if strict)   │
│  2. Run verification (optional)  │
│  3. Set status based on verdict  │
│     - pass → "passing"           │
│     - needs_review → "needs_review" │
│  4. Auto-commit changes          │
│  5. Log to progress.log          │
└─────────────────────────────────┘
```

---

## Data Persistence

### Task Storage (`ai/tasks/`)

Modular markdown-based storage with `index.json` and `{module}/{id}.md` files. Supports:

- Full CRUD operations
- Status transitions
- Dependency tracking
- Verification summaries
- Custom file paths via `filePath` field (for non-standard filenames)

### Progress Log (`ai/progress.log`)

Append-only text file with single-line entries:

```text
TIMESTAMP TYPE key=value key=value summary="..."
```

### Capability Cache (`ai/capabilities.json`)

Cached capability detection results with:

- Git commit tracking for staleness (no time-based TTL)
- Memory cache with 1-minute TTL for in-process reuse
- Forced refresh option (`--force` flag)
- Tracked config files for granular invalidation

### Verification Results (`ai/verification/results.json`)

Historical verification results per task.

---

## Error Handling

### Retry Logic

AI operations use exponential backoff:

- Initial: 1 second (`baseDelayMs: 1000`)
- Factor: 2x exponential
- Max retries: 3
- Max delay: 10 seconds
- Jitter: ±10% to prevent thundering herd

### Transient Error Detection

Patterns indicating retry-able failures (19+ patterns):

- Timeout: `timeout`, `timed out`, `ETIMEDOUT`
- Network: `ECONNRESET`, `ECONNREFUSED`, `ENETUNREACH`, `socket hang up`
- Connection: `connection reset`, `connection refused`, `connection closed`
- Rate limiting: `rate limit`, `too many requests`, `429`
- Server errors: `502`, `503`, `504`
- Capacity: `overloaded`, `capacity`, `temporarily unavailable`

### Graceful Degradation

Graceful degradation strategies:

- AI agent failover (Claude → Codex → Gemini)
- Direct command execution fallback when AI unavailable
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

agent-foreman integrates with Claude Code and OpenCode as plugins:

```text
plugins/agent-foreman/
├── agents/foreman.md      # Agent definition
├── skills/                 # 4 skills
│   ├── project-analyze/
│   ├── init-harness/
│   ├── feature-next/
│   └── feature-run/
├── commands/               # 5 slash commands (Claude)
│   ├── analyze.md
│   ├── init.md
│   ├── next.md
│   ├── run.md
│   └── status.md
├── opencode/               # OpenCode integration
│   └── command/
│       └── agent-foreman.md
├── opencode-plugin.js      # OpenCode plugin (tools)
└── README_OPENCODE.md      # OpenCode installation guide
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

## Known Issues & Risks

### `init.sh` Syntax Errors
When using an AI agent (especially Gemini or less capable models) to generate the `init.sh` script, the agent may hallucinate placeholder syntax (e.g., `<number>`) that is invalid in Bash. This can cause syntax errors when running `./ai/init.sh`.

**Mitigation:**
- Manually inspect `ai/init.sh` after generation.
- Future versions may include automated bash validation to prevent invalid scripts from being written.

---

*For usage documentation, see [USAGE.md](./USAGE.md)*
