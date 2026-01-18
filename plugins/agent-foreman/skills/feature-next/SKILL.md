---
name: feature-next
description: Implements a single task following the next → implement → check → done workflow with TDD support. Use when working on one specific task, implementing a single feature from the backlog, or following TDD red-green-refactor cycle. Triggers on 'next task', 'next feature', 'implement feature', 'work on feature', 'single task mode', 'what should I work on'.
allowed-tools: [Bash, Read, Glob, Grep, Write, Edit]
user-invocable: true
---

# Task Next

**One command**: `agent-foreman next`

## ⚠️ STRICT WORKFLOW - NO IMPROVISATION

**You MUST follow this exact sequence. Do NOT skip or reorder steps.**

```
next → implement → check → done
```

| ❌ FORBIDDEN | ✅ REQUIRED |
|--------------|-------------|
| Skip `check` step | Run `agent-foreman check` before `done` |
| Go straight to implementation | Run `agent-foreman next` first |
| Invent extra steps | Use only the 4 steps above |

## ⛔ CLI-ONLY ENFORCEMENT

**NEVER bypass CLI for workflow decisions:**

| ❌ FORBIDDEN | ✅ REQUIRED |
|--------------|-------------|
| Read `ai/tasks/index.json` to select task | Use `agent-foreman next` |
| Read `index.json` to check status | Use `agent-foreman status` |
| Read `index.json` for TDD mode | Check CLI output for `!!! TDD ENFORCEMENT ACTIVE !!!` |
| Edit task files to change status | Use `agent-foreman done/fail` |

**Allowed:** Reading task `.md` files for acceptance criteria AFTER running `agent-foreman next`.

---

## Quick Start

```bash
agent-foreman next           # Auto-select next priority
agent-foreman next auth.login  # Specific task
```

## Workflow

```
next → implement → check → done
```

```bash
agent-foreman next              # 1. Get task + acceptance criteria
# ... implement the task ...    # 2. Write code
agent-foreman check <id>        # 3. Verify implementation
agent-foreman done <id>         # 4. Mark complete + commit
```

### Check TDD Mode First

Look for "!!! TDD ENFORCEMENT ACTIVE !!!" in `agent-foreman next` output.

### TDD Workflow (when strict mode active)

```bash
# STEP 1: Get task + TDD guidance
agent-foreman next <task_id>

# STEP 2: RED - Write failing tests FIRST
# Create test file at suggested path
# Run tests: <your-test-command>
# Verify tests FAIL (confirms tests are valid)

# STEP 3: GREEN - Implement minimum code
# Write minimum code to pass tests
# Run tests: <your-test-command>
# Verify tests PASS

# STEP 4: REFACTOR - Clean up
# Clean up code while keeping tests passing

# STEP 5: Verify + Complete
agent-foreman check <task_id>
agent-foreman done <task_id>
```

**CRITICAL: DO NOT write implementation code before tests exist in strict TDD mode!**

## Priority Order

1. `needs_review` → may be broken
2. `failing` → not implemented
3. Lower `priority` number → higher priority (0 is highest)

---

## ⚠️ BREAKDOWN → VALIDATE → IMPLEMENT Workflow

**When `next` shows "VALIDATION PHASE REMINDER":**

```bash
# All BREAKDOWNs complete → Run validation FIRST
agent-foreman validate

# Then proceed with implementation
agent-foreman next
```

**ALWAYS run `done` after completing each task (including BREAKDOWN tasks).**

## Options

| Flag | Effect |
|------|--------|
| `--check` | Run tests before showing task |
| `--dry-run` | Preview without changes |
| `--json` | Output as JSON for scripting |
| `--quiet` | Suppress decorative output |
| `--allow-dirty` | Allow with uncommitted changes |
| `--refresh-guidance` | Force regenerate TDD guidance |

## Complete Options

```bash
agent-foreman done <id>            # Mark complete + commit
agent-foreman done <id> --full     # Run all tests
agent-foreman done <id> --skip-e2e # Skip E2E tests
agent-foreman done <id> --no-commit # Manual commit
```
