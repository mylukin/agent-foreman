---
name: init-harness
description: Creates AI agent task management structure with feature backlog (ai/tasks/), TDD enforcement, and progress tracking. Use when setting up agent-foreman, initializing feature-driven development, creating task backlog, or enabling TDD mode. Triggers on 'init harness', 'setup feature tracking', 'create feature backlog', 'enable strict TDD', 'initialize agent-foreman'.
allowed-tools: [Bash, Read, Glob, Grep, Write, Edit]
user-invocable: true
---

# ⚡ Init Harness

**One command**: `agent-foreman init`

## Quick Start

```bash
agent-foreman init
```

Creates: `ai/tasks/`, `ai/progress.log`, `ai/init.sh`, `CLAUDE.md`

## TDD Mode (Default: Recommended)

During init, you'll be prompted for TDD mode. **Recommended is the default** (tests suggested but not required).

| User Says | TDD Mode | Effect |
|-----------|----------|--------|
| "strict TDD" / "require tests" | `strict` | Tests REQUIRED - check/done fail without tests |
| "recommended" / "optional tests" / (default) | `recommended` | Tests suggested but not enforced |
| "disable TDD" / "no TDD" | `disabled` | No TDD guidance |

The prompt auto-skips after 10 seconds with recommended mode.

## Modes

| Mode | Command | Effect |
|------|---------|--------|
| Merge (default) | `agent-foreman init` | Keep existing + add new features |
| Fresh | `agent-foreman init --mode new` | Replace all features |
| Preview | `agent-foreman init --mode scan` | Show without changes |

## Task Types

| Type | Command | Use Case |
|------|---------|----------|
| Code (default) | `agent-foreman init` | Software development |
| Ops | `agent-foreman init --task-type ops` | Operational tasks, runbooks |
| Data | `agent-foreman init --task-type data` | ETL, data pipelines |
| Infra | `agent-foreman init --task-type infra` | Infrastructure provisioning |
| Manual | `agent-foreman init --task-type manual` | Manual-only verification |

## Auto-Detection

1. `ARCHITECTURE.md` exists → use it (fast)
2. Source code exists → AI scan + auto-save ARCHITECTURE.md
3. Empty project → generate from goal

## Pre-Init (Recommended)

For existing projects:
```bash
agent-foreman init --analyze    # First: understand project
agent-foreman init              # Then: create harness
```

## Created Files

```
ai/
├── tasks/              # Task backlog (modular markdown)
│   ├── index.json      # Task index
│   └── {module}/       # Module directories
│       └── {id}.md     # Individual tasks
├── progress.log        # Session audit log
├── init.sh             # Bootstrap script
└── capabilities.json   # Detected test/lint/build
CLAUDE.md               # AI agent instructions
docs/ARCHITECTURE.md    # Auto-generated architecture doc
```
