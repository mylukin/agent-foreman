---
description: Initialize or upgrade the long-task harness for feature-driven development
---

# EXECUTE NOW

Run this command immediately:

```bash
agent-foreman init
```

Wait for completion. Do not interrupt.

## Context-Based Behavior

The command auto-detects and handles:

| Context | Behavior |
|---------|----------|
| `docs/ARCHITECTURE.md` exists | Use it for fast init |
| Source code exists | AI scan + auto-save ARCHITECTURE.md |
| Empty project | Generate features from goal |
| `ai/feature_list.json` exists | Merge mode (keep existing + add new) |

## If User Specifies Mode

| User Says | Execute |
|-----------|---------|
| "fresh" / "new" / "replace" | `agent-foreman init --mode new` |
| "preview" / "scan" / "dry-run" | `agent-foreman init --mode scan` |
| (default) | `agent-foreman init` |

## After Completion

Report what was created:

- `ai/feature_list.json` - Feature backlog
- `ai/progress.log` - Session log
- `ai/init.sh` - Bootstrap script
- `CLAUDE.md` - AI instructions
