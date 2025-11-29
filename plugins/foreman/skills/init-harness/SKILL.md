---
name: init-harness
description: Initialize or upgrade the long-task harness for a project
---

# Init Harness

Set up feature-driven development infrastructure with ai/feature_list.json, ai/progress.md, and ai/init.sh.

## When to Use

- Starting a new project that needs structured feature tracking
- Adding harness to an existing project
- Re-scanning features after significant changes

## Command

```bash
# Default: merge mode (keeps existing features, adds new ones)
agent-foreman init

# Fresh start (replaces all features)
agent-foreman init --mode new

# Preview only (no changes)
agent-foreman init --mode scan
```

## How It Works

1. If `PROJECT_SURVEY.md` exists → uses survey (fast)
2. If source code exists → AI scan + auto-saves survey
3. If empty project → generates features from goal

## Created Files

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with status tracking |
| `ai/progress.md` | Session handoff audit log |
| `ai/init.sh` | Bootstrap script (install/dev/check) |
| `CLAUDE.md` | Instructions for AI agents |
| `docs/PROJECT_SURVEY.md` | Auto-generated when scanning existing project |

**Tip:** For existing projects, run `agent-foreman survey` first for better results.
