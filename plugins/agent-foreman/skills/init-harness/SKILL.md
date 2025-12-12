---
name: init-harness
description: Creates AI agent task management structure with feature backlog, TDD enforcement, and progress tracking. Use when setting up agent-foreman, initializing feature-driven development, creating feature_list.json, or enabling TDD mode. Triggers on "init harness", "setup feature tracking", "create feature backlog", "enable strict TDD".
---

# ⚡ Init Harness

**One command**: `agent-foreman init`

## Quick Start

```bash
agent-foreman init
```

Creates: `ai/feature_list.json`, `ai/progress.log`, `ai/init.sh`, `CLAUDE.md`

## TDD Mode (Default: Recommended)

During init, you'll be prompted for TDD mode. **Recommended is the default** (tests suggested but not required).

| User Says | TDD Mode | Effect |
|-----------|----------|--------|
| "strict TDD" / "require tests" | `strict` | Tests REQUIRED - check/done fail without tests |
| "recommended" / "optional tests" / (default) | `recommended` | Tests suggested but not enforced |
| "disable TDD" / "no TDD" | `disabled` | No TDD guidance |

### Strict Mode Behavior

- `agent-foreman check` blocks if test files missing
- `agent-foreman done` blocks if test files missing
- Features auto-migrate to `testRequirements.unit.required: true`
- TDD workflow: RED → GREEN → REFACTOR enforced

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
├── feature_list.json   # Feature backlog (with tddMode)
├── progress.log        # Session audit log
├── init.sh             # Bootstrap script
└── capabilities.json   # Detected test/lint/build
CLAUDE.md               # AI agent instructions
docs/ARCHITECTURE.md    # Auto-generated architecture doc
```

## Change TDD Mode Later

Edit `ai/feature_list.json`:
```json
{
  "metadata": {
    "tddMode": "strict"
  }
}
```
