---
description: Initialize or upgrade the long-task harness for feature-driven development
---

# EXECUTE NOW

Run this command immediately:

```bash
agent-foreman init
```

Wait for completion. Do not interrupt.

**TDD Mode Prompt**: During init, you will be asked about TDD mode. **Default: recommended mode** (tests suggested but not required). The prompt auto-skips after 10 seconds with default.

## TDD Mode Configuration

| User Says | TDD Mode | Effect |
|-----------|----------|--------|
| "strict TDD" / "require tests" / "enforce TDD" | `strict` | Tests REQUIRED for all features |
| "recommended" / "optional tests" / "no strict" / (default) | `recommended` | Tests suggested but not enforced |
| "disable TDD" / "no TDD" | `disabled` | No TDD guidance |

When prompted "Enable strict TDD mode?":
- Press **Y** for strict mode - tests required
- Press **N** (default) for recommended mode - tests optional
- Wait 10s for auto-skip with recommended mode

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

- `ai/feature_list.json` - Feature backlog (with tddMode in metadata)
- `ai/progress.log` - Session log
- `ai/init.sh` - Bootstrap script
- `CLAUDE.md` - AI instructions

## Manual TDD Mode Change

To change TDD mode after init, edit `ai/feature_list.json`:

```json
{
  "metadata": {
    "tddMode": "strict"  // or "recommended" or "disabled"
  }
}
```
