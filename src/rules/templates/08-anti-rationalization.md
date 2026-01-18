# Anti-Rationalization Guide

This guide helps AI agents recognize and avoid common workflow violations through self-checking patterns.

> This guide helps AI agents recognize and avoid common workflow violations through self-checking patterns.
> 本指南帮助 AI 代理通过自检模式识别并避免常见的工作流违规行为。

---

## Red Flags Self-Check

**STOP if you find yourself thinking any of the following:**

| 🚩 Thought Pattern | ❌ Why It's Wrong | ✅ What To Do Instead |
|-------------------|-------------------|----------------------|
| "I'll just quickly check the index.json to see what's next" | Bypasses CLI audit trail and selection logic | Run `agent-foreman next` |
| "Let me read the task file to see its current status" | Status should come from CLI, not files | Run `agent-foreman status` |
| "I'll skip the check since I'm confident the code works" | Confidence doesn't replace verification | Run `agent-foreman check <task_id>` |
| "I already know what needs to be done, no need for next" | CLI provides TDD guidance and dependencies | Always run `agent-foreman next` first |
| "I'll just update the status field directly to save time" | Breaks state sync and audit trail | Use `agent-foreman done` or `agent-foreman fail` |
| "This small fix doesn't need the full workflow" | All changes need verification | Follow workflow: next → implement → check → done |

---

## Excuse vs Reality Tables

### Workflow Shortcuts

| Excuse | Reality | Correct Action |
|--------|---------|----------------|
| "The task is simple, I don't need `next`" | `next` shows TDD mode, dependencies, and guidance | Run `agent-foreman next <task_id>` |
| "I'll just run tests myself instead of `check`" | `check` runs typecheck, lint, and selective tests | Run `agent-foreman check <task_id>` |
| "I verified manually, so I'll skip `check`" | CLI verification is the only accepted verification | Run `agent-foreman check` before `done` |
| "The tests passed so I'll mark it done directly" | Only `agent-foreman done` properly completes tasks | Run `agent-foreman done <task_id>` |

### File Reading Violations

| Excuse | Reality | Correct Action |
|--------|---------|----------------|
| "Reading index.json is faster" | CLI has caching and proper state management | Use `agent-foreman status` |
| "I need to see all tasks at once" | Status shows summary, next shows current task | Use CLI commands |
| "I want to check TDD mode quickly" | TDD mode is shown in `next` output | Run `agent-foreman next` |
| "I need the task's acceptance criteria" | `next` output includes all criteria | Run `agent-foreman next <task_id>` |

---

## Pre-Flight Checklist

Before implementing ANY task, verify these conditions:

### ✅ Mandatory Pre-Implementation Checks

```
□ Did I run `agent-foreman next` to get the task?
□ Did I check if TDD mode is strict in the output?
□ Did I read the acceptance criteria from CLI output?
□ Did I note any dependencies mentioned?
```

### ✅ Mandatory Pre-Completion Checks

```
□ Did I run `agent-foreman check <task_id>` after implementing?
□ Did the check command pass?
□ Am I using `agent-foreman done` (not editing files)?
```

---

## Internal Monologue Checks

### Dangerous Patterns to Catch

When you catch yourself with these thoughts, **STOP and use the CLI**:

1. **"Let me just look at..."**
   - If looking at `ai/tasks/` files for workflow decisions → Use CLI
   - If looking at task files for acceptance criteria → Only after running `next`

2. **"I'll quickly..."**
   - "Quickly check status" → `agent-foreman status`
   - "Quickly see what's next" → `agent-foreman next`
   - "Quickly update status" → `agent-foreman done` or `fail`

3. **"I already know..."**
   - "I already know the task" → Still run `next` for TDD guidance
   - "I already know it works" → Still run `check` for verification
   - "I already know the status" → Status may have changed, use CLI

4. **"To save time..."**
   - Time saved by skipping steps is lost to inconsistent state
   - CLI commands are fast; the overhead is minimal
   - Audit trail matters more than microseconds

---

## Forbidden Pattern Examples

### ❌ WRONG: Reading Files for Workflow Decisions

```typescript
// FORBIDDEN - Reading index.json directly
const index = JSON.parse(fs.readFileSync('ai/tasks/index.json'));
const nextTask = Object.entries(index.features)
  .filter(([_, f]) => f.status === 'failing')
  .sort((a, b) => a[1].priority - b[1].priority)[0];
```

### ✅ CORRECT: Using CLI

```bash
# Correct - Let CLI handle selection
agent-foreman next
```

---

### ❌ WRONG: Manual Status Edits

```typescript
// FORBIDDEN - Editing task files directly
const taskContent = fs.readFileSync('ai/tasks/auth/login.md');
const updated = taskContent.replace('status: failing', 'status: passing');
fs.writeFileSync('ai/tasks/auth/login.md', updated);
```

### ✅ CORRECT: Using CLI Commands

```bash
# Correct - Use CLI for status changes
agent-foreman done auth.login
```

---

### ❌ WRONG: Skipping Verification

```typescript
// FORBIDDEN - Assuming code works without verification
// "I tested it manually, looks good"
exec('agent-foreman done auth.login --skip-check');  // Don't skip!
```

### ✅ CORRECT: Full Verification Flow

```bash
# Correct - Always verify before completing
agent-foreman check auth.login
agent-foreman done auth.login  # Now safe (check was just run)
```

---

## Recovery Actions

### If You Realize You Violated a Rule

1. **If you read files instead of using CLI:**
   - Discard any conclusions drawn from file reading
   - Run the appropriate CLI command
   - Trust CLI output over what you read

2. **If you skipped `next`:**
   - Run `agent-foreman next <task_id>` now
   - Check for TDD mode requirements
   - Note any dependencies you may have missed

3. **If you skipped `check`:**
   - Run `agent-foreman check <task_id>` immediately
   - If it fails, fix the issues
   - Only then proceed to `done`

4. **If you edited files directly:**
   - Your changes may cause state inconsistency
   - Run `agent-foreman status` to verify state
   - Use CLI commands to restore proper state

---

## Why This Matters

| Bypass Type | Consequence |
|-------------|-------------|
| Skip `next` | Miss TDD guidance, dependencies, current status |
| Skip `check` | Unverified code may break other features |
| Read files directly | Miss CLI's state normalization and validation |
| Edit files directly | Break audit trail, state sync, verification |
| Skip workflow | Inconsistent state across sessions and agents |

**Remember**: The workflow exists to ensure quality and coordination. Every shortcut creates technical debt that future agents (or you) will have to fix.

---

## Summary: The Golden Rules

1. **CLI for workflow, always** - Never read task files for workflow decisions
2. **next before implement** - Always run `next` to get task and guidance
3. **check before done** - Always verify with `check` before completing
4. **CLI for status changes** - Only `done` and `fail` change task status
5. **Trust the process** - The workflow is designed for multi-agent coordination
