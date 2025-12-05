---
name: init-harness
description: Initialize or upgrade the long-task harness for a project
---

# ⚡ Init Harness

**One command**: `agent-foreman init`

## Quick Start

```bash
agent-foreman init
```

Creates: `ai/feature_list.json`, `ai/progress.log`, `ai/init.sh`, `CLAUDE.md`

## Modes

| Mode | Command | Effect |
|------|---------|--------|
| Merge (default) | `agent-foreman init` | Keep existing + add new features |
| Fresh | `agent-foreman init --mode new` | Replace all features |
| Preview | `agent-foreman init --mode scan` | Show without changes |

## Auto-Detection

1. `ARCHITECTURE.md` exists → use it (fast)
2. Source code exists → AI scan + auto-save ARCHITECTURE.md
3. Empty project → generate from goal

## Pre-Init (Recommended)

For existing projects:
```bash
agent-foreman analyze    # First: understand project
agent-foreman init      # Then: create harness
```

## Created Files

```
ai/
├── feature_list.json   # Feature backlog
├── progress.log        # Session audit log
├── init.sh             # Bootstrap script
└── capabilities.json   # Detected test/lint/build
CLAUDE.md               # AI agent instructions
docs/ARCHITECTURE.md    # Auto-generated architecture doc
```
