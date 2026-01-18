---
name: init
description: Initialize task harness with ai/tasks/ directory structure
allowed-tools: [Bash, Read, Glob, Grep, Write, Edit, Skill]
argument-hint: "[--mode new|scan] [--task-type ops|data|infra|manual]"
---

# STEP 0: INVOKE SKILL (MANDATORY)

**BEFORE doing anything else, you MUST invoke the `init-harness` skill:**

```
Skill({ skill: "init-harness" })
```

The instructions below are a fallback only if the skill fails to load.

---

# FALLBACK: EXECUTE NOW

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

When prompted "Select TDD enforcement level":
- Press **1** for strict mode - tests required
- Press **2** (default) for recommended mode - tests optional
- Press **3** for disabled - no TDD guidance
- Wait 10s for auto-skip with recommended mode

## Context-Based Behavior

The command auto-detects and handles:

| Context | Behavior |
|---------|----------|
| `docs/ARCHITECTURE.md` exists | Use it for fast init |
| Source code exists | AI scan + auto-save ARCHITECTURE.md |
| Empty project | Generate features from goal |
| `ai/tasks/` exists | Merge mode (keep existing + add new) |

## If User Specifies Mode

| User Says | Execute |
|-----------|---------|
| "fresh" / "new" / "replace" | `agent-foreman init --mode new` |
| "preview" / "scan" / "dry-run" | `agent-foreman init --mode scan` |
| (default) | `agent-foreman init` |

## Task Type Option

For non-code projects, specify the task type:

| User Says | Execute |
|-----------|---------|
| "ops" / "operational" / "runbook" | `agent-foreman init --task-type ops` |
| "data" / "ETL" / "pipeline" | `agent-foreman init --task-type data` |
| "infra" / "infrastructure" | `agent-foreman init --task-type infra` |
| "manual" / "checklist" | `agent-foreman init --task-type manual` |
| (default) | `agent-foreman init` (code type) |

## After Completion

Report what was created:

- `ai/tasks/` - Task backlog (modular markdown)
- `ai/progress.log` - Session log
- `ai/init.sh` - Bootstrap script
- `CLAUDE.md` - AI instructions
