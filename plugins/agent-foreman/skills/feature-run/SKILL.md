---
name: feature-run
description: Executes unattended batch processing of all pending tasks with autonomous decision-making. Use when running all tasks automatically, batch processing without supervision, completing entire feature backlog, or working on a specific task by ID. Triggers on 'run all tasks', 'complete all features', 'batch processing', 'unattended mode', 'auto-complete tasks', 'run feature'.
allowed-tools: [Bash, Read, Glob, Grep, Write, Edit, Task]
user-invocable: true
---

# Task Run

**Mode**: Work on all tasks or a specific one

## ⚠️ STRICT WORKFLOW - NO IMPROVISATION

**You MUST follow this exact sequence for EVERY task. Do NOT skip or reorder steps.**

```
next → implement → check → done
```

| ❌ FORBIDDEN | ✅ REQUIRED |
|--------------|-------------|
| Skip `check` step | Run `agent-foreman check` before `done` |
| Go straight to implementation | Run `agent-foreman next` first |
| Invent extra steps | Use only the 4 steps above |
| Reorder the workflow | Execute in exact sequence |

## ⛔ CLI-ONLY ENFORCEMENT

**NEVER bypass CLI for workflow decisions:**

| ❌ FORBIDDEN | ✅ REQUIRED |
|--------------|-------------|
| Read `ai/tasks/index.json` to select task | Use `agent-foreman next` |
| Read `index.json` to check status | Use `agent-foreman status` |
| Read task files to check status | Use CLI commands |
| Edit task files to change status | Use `agent-foreman done/fail` |

**This applies to ALL iterations in the loop.**

---

⚡ **UNATTENDED MODE** (when no task_id provided)
- NO questions allowed
- NO stopping for errors
- MUST complete all tasks

## Mode Detection

**If task_id provided** (e.g., `feature-run auth.login`):
- Work on that specific task only
- Complete it and stop

**If no task_id** (e.g., `feature-run`):
- Auto-complete all pending tasks
- Loop until all done
- **UNATTENDED MODE ACTIVE** - see rules below

---

## Single Task Mode

When task_id is provided:

```bash
# STEP 1: Delegate to implementer agent
Task(
  subagent_type="agent-foreman:implementer",
  prompt="TASK: <task_id>
Execute: next <task_id> → implement → check → return result"
)

# STEP 2: Parse result and complete
# - If success + verification_passed: agent-foreman done <task_id>
# - Otherwise: agent-foreman fail <task_id> -r "<notes>"
```

---

## All Tasks Mode

When no task_id:

```bash
# STEP 1: Show initial state (once only)
agent-foreman status

# STEP 2: LOOP
  # 2a: Delegate to implementer agent (auto-select task)
  Task(
    subagent_type="agent-foreman:implementer",
    prompt="Execute: next → implement → check → return result"
  )

  # 2b: Parse ---IMPLEMENTATION RESULT--- from agent output
  # Extract: task_id, status, verification_passed, notes

  # 2c: Check if implementer returned "No pending tasks"
  #     If yes → EXIT to STEP 3
  #     If no → Continue to 2d

  # 2d: Handle result
  # - success + verification_passed → agent-foreman done <task_id>
  # - Otherwise → agent-foreman fail <task_id> -r "<notes>"

  # 2e: Continue loop (go to step 2a, NOT step 1)

# STEP 3: FINISH
# Show final summary with agent-foreman status (once only)
```

---

## Rules

| Rule | Description |
|------|-------------|
| One at a time | Complete current before next |
| No skipping | Always next → implement → check → done (status only at start/end) |
| No editing criteria | Implement as specified |
| Never kill processes | Let commands finish naturally |

## Priority Order

1. `needs_review` → may be broken (highest)
2. `failing` → not implemented
3. Lower `priority` number → higher priority (0 is highest)

---

## TDD Mode

TDD workflow is handled internally by the `agent-foreman:implementer` agent. No action required from the orchestrator.

---

## Unattended Mode Rules

When in ALL-TASKS mode (no task_id provided):

- **NO questions** - The implementer agent handles decisions autonomously
- **NO stopping** - Always continue to next task after done/fail
- **Exit only** when implementer returns "No pending tasks available"

---

## Loop Enforcement (MUST FOLLOW)

When in ALL-TASKS mode:

1. **START**: Run `agent-foreman status` once - show initial state
2. **LOOP**:
   a. **Delegate**: Call `Task(subagent_type="agent-foreman:implementer")` - agent runs next → implement → check
   b. **Parse result**: Extract `task_id`, `status`, `verification_passed`, `notes`
   c. **Check exit**: If `status: blocked` and `notes` contains "No pending tasks" → EXIT to step 3
   d. **Complete**: Based on result:
      - `success` + `verification_passed: true` → `agent-foreman done <task_id>`
      - Otherwise → `agent-foreman fail <task_id> -r "<notes>"`
   e. **Continue**: Go to step 2a (NOT step 1)
3. **FINISH**: Run `agent-foreman status` once - show final summary

### Result Parsing

The implementer agent returns structured output:

```yaml
---IMPLEMENTATION RESULT---
task_id: <task_id>
status: success|partial|blocked|failed
verification_passed: true|false
files_modified: [list]
notes: <description>
---END IMPLEMENTATION RESULT---
```

### Never Stop For

- Agent errors
- Verification failures
- Missing tasks
- Any unexpected output

### Only Stop When

- Implementer agent returns `status: blocked` with `notes: No pending tasks available`

---

## On Agent Result Handling

When the implementer agent returns its result:

### If `status: success` and `verification_passed: true`

```bash
agent-foreman done <task_id>
```

Then continue to next iteration.

### If verification failed or status is not success

```bash
agent-foreman fail <task_id> --reason "<notes from agent>"
```

Then **IMMEDIATELY** continue to next iteration.

### Result Handling Rules

1. **DO NOT STOP** - This is the most critical rule
2. **DO NOT ASK** - Never ask user what to do
3. **ALWAYS parse the result** - Extract task_id and status from agent output
4. **ALWAYS continue** - Move to next task after done/fail

**This applies to ALL agent results, including errors or malformed output.**

---

## Exit When

| Condition | Action |
|-----------|--------|
| All tasks processed | STOP - Show summary |
| Single task completed | STOP - Task done |
| User interrupts | STOP - Clean state |

**CRITICAL: NEVER stop due to verification failure - always use `agent-foreman fail` and continue!**

## Loop Completion

When all tasks have been processed:

1. Run `agent-foreman status` to show final summary
2. Report counts:
   - X tasks passing
   - Y tasks failed (need investigation)
   - Z tasks needs_review (dependency changes)
   - W tasks still failing (not attempted)
3. List tasks that failed verification with their failure reasons
