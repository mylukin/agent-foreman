# agent-foreman

> Long Task Harness for AI agents - feature-driven development with external memory

[![npm version](https://img.shields.io/npm/v/agent-foreman.svg)](https://www.npmjs.com/package/agent-foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Chinese](./README_zh.md) | [Detailed Usage Guide](./docs/USAGE.md)

## Problem

AI coding agents face three common failure modes:

1. **Doing too much at once** - Trying to complete everything in one session
2. **Premature completion** - Declaring victory before features actually work
3. **Superficial testing** - Not thoroughly validating implementations

## Solution

**agent-foreman** provides a structured harness that enables AI agents to:

- Maintain **external memory** via structured files
- Work on **one feature at a time** with clear acceptance criteria
- **Hand off cleanly** between sessions via progress logs
- **Track impact** of changes on other features

---

## Installation

```bash
# Global installation
npm install -g agent-foreman

# Or use with npx
npx agent-foreman --help
```

---

## Claude Code Plugin (Recommended)

agent-foreman is designed as a **Claude Code plugin**. This is the recommended way to use it.

### 1. Install Plugin

```
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman
```

### 2. Slash Commands

| Command | Description |
|---------|-------------|
| `/agent-foreman:status` | View project status and progress |
| `/agent-foreman:init` | Initialize harness with project goal |
| `/agent-foreman:analyze` | Analyze existing project structure |
| `/agent-foreman:next` | Get next priority feature to work on |
| `/agent-foreman:run` | Auto-complete all pending features |

### 3. Usage Examples

**Initialize a new project:**
```
/agent-foreman:init Build a REST API for user management
```

**Check status and work on features:**
```
/agent-foreman:status
/agent-foreman:next
```

**Auto-complete all tasks:**
```
/agent-foreman:run
```

**Work on specific feature:**
```
/agent-foreman:run auth.login
```

### 4. Command Options

Commands accept natural language and flags:

```
/agent-foreman:init --mode new        # Fresh start, replace existing
/agent-foreman:init --mode scan       # Preview only, don't save
/agent-foreman:next --check           # Run tests before showing task
/agent-foreman:analyze --verbose      # Detailed output
```

---

## Why It Works

The core insight: **AI agents need the same tooling that makes human engineering teams effective**.

Human engineers don't rely on memory either. We use:
- Git for version history
- Issue trackers for task management
- Documentation for handoffs
- Tests for verification

agent-foreman brings these same patterns to AI:

| Human Practice | AI Equivalent |
|----------------|---------------|
| Scrum board | `feature_list.json` |
| Sprint notes | `progress.log` |
| CI/CD pipeline | `init.sh check` |
| Code review | Acceptance criteria |

### Why JSON Instead of Markdown?

From Anthropic's research:

> "Models are more likely to respect and accurately update JSON structures than markdown checklists."

When features are stored as JSON with explicit `status` fields, AI agents:
- Don't accidentally delete items
- Update status correctly
- Respect the schema

---

## Workflow

agent-foreman embraces **TDD (Test-Driven Development)** philosophy: define acceptance criteria first, implement features second, verify at the end.

```text
┌──────────────────────────────────────────────────────────────────────────┐
│                        AGENT-FOREMAN WORKFLOW                            │
│                      (Based on TDD Principles)                           │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  INITIALIZE                                                              │
│  ┌─────────┐    ┌─────────────────┐    ┌──────────┐                     │
│  │ analyze │───▶│ detect-         │───▶│   init   │                     │
│  │         │    │ capabilities    │    │ generate │                     │
│  └─────────┘    └─────────────────┘    └──────────┘                     │
│                                              │                           │
│                                              ▼                           │
│                                    Define acceptance criteria (RED)      │
│                                    feature_list.json                     │
│                                                                          │
├──────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  TDD DEVELOPMENT LOOP                                                    │
│                                                                          │
│      ┌──────────────────────────────────────────────────────┐           │
│      │                         LOOP                         │           │
│      ▼                                                      │           │
│  ┌──────────┐    ┌──────────────────────────────────────┐  │           │
│  │  next    │───▶│  RED: View acceptance criteria        │  │           │
│  │ get task │    │  Criteria = failing test cases        │  │           │
│  └──────────┘    └──────────────────────────────────────┘  │           │
│                                   │                         │           │
│                                   ▼                         │           │
│                  ┌──────────────────────────────────────┐  │           │
│                  │  GREEN: Implement feature             │  │           │
│                  │  Write minimum code to pass criteria  │  │           │
│                  └──────────────────────────────────────┘  │           │
│                                   │                         │           │
│                                   ▼                         │           │
│                  ┌──────────────────────────────────────┐  │           │
│                  │  done <id>                            │  │           │
│                  │  - Run tests (verify GREEN)           │  │           │
│                  │  - AI validates acceptance            │  │           │
│                  │  - Auto-commit (REFACTOR optional)    │  │           │
│                  └──────────────────────────────────────┘  │           │
│                                   │                         │           │
│                                   ▼                         │           │
│                          ┌───────────────┐                 │           │
│                          │ More tasks?   │─────YES─────────┘           │
│                          └───────────────┘                              │
│                                   │ NO                                  │
│                                   ▼                                     │
│                  ┌───────────────────────────────────────┐             │
│                  │  All features passing! (100%)         │             │
│                  │  ARCHITECTURE.md updated              │             │
│                  └───────────────────────────────────────┘             │
│                                                                          │
└──────────────────────────────────────────────────────────────────────────┘
```

**TDD Core Principles:**
- **RED** — Define acceptance criteria first (equivalent to failing tests)
- **GREEN** — Write minimum code to make criteria pass
- **REFACTOR** — Optimize under test protection

---

## Core Files

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with status |
| `ai/progress.log` | Session handoff audit log |
| `ai/init.sh` | Environment bootstrap script |
| `docs/ARCHITECTURE.md` | AI-generated project architecture |

## Feature Status Values

| Status | Meaning |
|--------|---------|
| `failing` | Not yet implemented |
| `passing` | Acceptance criteria met |
| `blocked` | External dependency blocking |
| `needs_review` | May be affected by changes |
| `deprecated` | No longer needed |

---

## Best Practices

1. **One feature at a time** - Complete before switching
2. **Update status promptly** - Mark passing when criteria met
3. **Review impact** - Run impact analysis after changes
4. **Clean commits** - One feature = one atomic commit
5. **Read first** - Always check feature list and progress log

---

## License

MIT

## Author

Lukin ([@mylukin](https://github.com/mylukin))

---

Inspired by Anthropic's blog post: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
