# agent-foreman

> ⚠️ **DEPRECATED**: This project is no longer maintained. Please migrate to [ralph-dev](https://github.com/mylukin/ralph-dev) - a simplified and improved version.

---

## 🚨 Migration Notice

This project has been deprecated due to its complexity. A new, simplified version is now available:

**👉 [https://github.com/mylukin/ralph-dev](https://github.com/mylukin/ralph-dev)**

Please migrate to `ralph-dev` for continued support and updates.

---

<details>
<summary><b>Legacy Documentation (archived)</b></summary>

> Stop AI agents from half-building features. Ship complete code in one session.

[![npm version](https://img.shields.io/npm/v/agent-foreman.svg)](https://www.npmjs.com/package/agent-foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[Chinese](./README_zh.md) | [Detailed Guide](./docs/USAGE.md)

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

## Quick Start

```bash
/plugin install agent-foreman        # 1. Install
/agent-foreman:init Build auth API   # 2. Initialize
/agent-foreman:run                   # 3. Let AI work
```

---

## Installation

```bash
# Quick install (binary)
curl -fsSL https://raw.githubusercontent.com/mylukin/agent-foreman/main/scripts/install.sh | bash

# Via npm
npm install -g agent-foreman

# Or use npx directly
npx agent-foreman --help
```

Manual download: [GitHub Releases](https://github.com/mylukin/agent-foreman/releases)

---

## Usage

### Plugin Commands (Recommended)

```
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman
```

| Command | Description |
|---------|-------------|
| `/agent-foreman:status` | View project status and progress |
| `/agent-foreman:init` | Initialize harness with project goal |
| `/agent-foreman:analyze` | Analyze existing project structure |
| `/agent-foreman:spec` | Transform requirements into tasks |
| `/agent-foreman:next` | Get next priority task |
| `/agent-foreman:run` | Auto-complete all pending tasks |

**Transform requirements into tasks:**
```
/agent-foreman:spec Build a user authentication system
```

```
Requirement → [PM→UX→Tech→QA] → Spec Files → BREAKDOWN Tasks → /run → Implementation
```

<details>
<summary><b>CLI Commands (standalone)</b></summary>

For standalone CLI usage without Claude Code:

| Command | Description |
|---------|-------------|
| `init [goal]` | Initialize or upgrade the harness |
| `next [feature_id]` | Show next feature to work on |
| `status` | Show current project status |
| `check [feature_id]` | Verify code changes or task completion |
| `done <feature_id>` | Verify, mark complete, and auto-commit |
| `fail <feature_id>` | Mark a task as failed |
| `impact <feature_id>` | Analyze impact of changes |
| `tdd [mode]` | View or set TDD mode |
| `agents` | Show available AI agents |
| `install` | Install Claude Code plugin |
| `uninstall` | Uninstall Claude Code plugin |

</details>

---

## Workflow

```
next → implement → check → done → repeat
```

| Step | Command | What Happens |
|------|---------|--------------|
| 1 | `next` | Get task with acceptance criteria |
| 2 | implement | Write code to satisfy criteria |
| 3 | `check` | Verify implementation |
| 4 | `done` | Mark complete, auto-commit |

---

## Best Practices

1. **One feature at a time** - Complete before switching
2. **Update status promptly** - Mark passing when criteria met
3. **Review impact** - Run impact analysis after changes
4. **Clean commits** - One feature = one atomic commit
5. **Read first** - Always check feature list and progress log

---

## Reference

<details>
<summary><b>Core Files</b></summary>

| File | Purpose |
|------|---------|
| `ai/tasks/index.json` | Task index with status summary |
| `ai/tasks/{module}/{id}.md` | Individual task definitions |
| `ai/progress.log` | Session handoff audit log |
| `ai/init.sh` | Environment bootstrap script |
| `CLAUDE.md` | AI agent instructions |

</details>

<details>
<summary><b>Status Values</b></summary>

| Status | Meaning |
|--------|---------|
| `failing` | Not yet implemented |
| `passing` | Acceptance criteria met |
| `blocked` | External dependency blocking |
| `needs_review` | May be affected by changes |
| `failed` | Verification failed |
| `deprecated` | No longer needed |

</details>

<details>
<summary><b>Why It Works</b></summary>

AI agents need the same tooling that makes human teams effective:

| Human Practice | AI Equivalent |
|----------------|---------------|
| Scrum board | `ai/tasks/index.json` |
| Sprint notes | `progress.log` |
| CI/CD pipeline | `init.sh check` |
| Code review | Acceptance criteria |

</details>

---

## License

MIT

## Author

Lukin ([@mylukin](https://github.com/mylukin))

---

Inspired by Anthropic's blog post: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

</details>
