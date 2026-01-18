---
name: next
description: Get next task and implement with TDD workflow
allowed-tools: [Bash, Read, Glob, Grep, Write, Edit, Skill]
argument-hint: "[task_id] [--check|--dry-run|--json|--quiet]"
---

# ⚠️ STRICT WORKFLOW - NO IMPROVISATION

**You MUST follow this exact sequence. Do NOT skip or reorder steps.**

```
next → implement → check → done
```

---

# STEP 0: INVOKE SKILL (MANDATORY)

**BEFORE doing anything else, you MUST invoke the `feature-next` skill:**

```
Skill({ skill: "feature-next" })
```

The instructions below are a fallback only if the skill fails to load.

---

# FALLBACK: EXECUTE NOW

```bash
agent-foreman next
```

Wait for completion. Review the task shown.

**Check for TDD Mode**: Look for "!!! TDD ENFORCEMENT ACTIVE !!!" in output.

## Options

| User Says | Execute |
|-----------|---------|
| Task ID provided | `agent-foreman next <task_id>` |
| "check" / "test first" | `agent-foreman next --check` |
| "preview" / "dry-run" | `agent-foreman next --dry-run` |
| "json" / "as json" | `agent-foreman next --json` |
| "quiet" / "minimal" | `agent-foreman next --quiet` |
| "refresh guidance" / "regenerate" | `agent-foreman next --refresh-guidance` |
| "allow dirty" / "uncommitted ok" | `agent-foreman next --allow-dirty` |

## After Next

1. **Read** acceptance criteria shown
2. **Implement** to satisfy ALL criteria
3. **Verify**: `agent-foreman check <task_id>`
4. **Complete**: `agent-foreman done <task_id>`

## Complete Options

| User Says | Execute |
|-----------|---------|
| "full test" / "all tests" | `agent-foreman done <id> --full` |
| "skip e2e" | `agent-foreman done <id> --skip-e2e` |
| "no commit" / "manual commit" | `agent-foreman done <id> --no-commit` |

## Priority Order

1. `needs_review` → highest
2. `failing` → next
3. Lower `priority` number
