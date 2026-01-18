---
name: run
description: Auto-complete all pending tasks or work on specific task
allowed-tools: [Bash, Read, Glob, Grep, Write, Edit, Skill]
argument-hint: "[task_id]"
---

# STEP 0: INVOKE SKILL (MANDATORY)

**BEFORE doing anything else, you MUST invoke the `feature-run` skill:**

```
Skill({ skill: "feature-run" })
```

The instructions below are a fallback only if the skill fails to load.

---

# FALLBACK: EXECUTE TASK WORKFLOW

Start immediately. Do not ask for confirmation.

## Mode Detection

**If task_id provided** (e.g., `/agent-foreman:run <task_id>`):

- Work on that specific task only
- Complete it and stop

**If no task_id** (e.g., `/agent-foreman:run`):

- Auto-complete all pending tasks in priority order
- **UNATTENDED MODE** - no questions, no stopping for errors

---

## Single Task Mode

```bash
agent-foreman next <task_id>    # 1. Get task
# ... implement task ...         # 2. Write code
agent-foreman check <task_id>   # 3. Verify
agent-foreman done <task_id>    # 4. Complete
```

---

## All Tasks Mode

```bash
agent-foreman status            # 1. Check pending count
agent-foreman next              # 2. Get next task
# ... implement task ...         # 3. Write code
agent-foreman check <id>        # 4. Verify
agent-foreman done <id>         # 5. Complete
# Loop to step 1 until done
```

---

## Rules

| Rule | Action |
|------|--------|
| One at a time | Complete current before next |
| No skipping | status → next → implement → check → done |
| No editing criteria | Implement exactly as specified |
| Never kill processes | Let commands finish naturally |

---

## Exit Conditions

| Condition | Action |
|-----------|--------|
| All tasks processed | STOP - Show summary |
| Single task completed | STOP - Task done |
| User interrupts | STOP - Clean state |

## Priority Order

1. `needs_review` → highest
2. `failing` → next
3. Lower `priority` number

---

## UNATTENDED MODE RULES (CRITICAL)

When in ALL-TASKS mode (no task_id provided):

### NO QUESTIONS ALLOWED

| Situation | Action |
|-----------|--------|
| Ambiguous requirement | Make reasonable decision, proceed |
| Missing file/dependency | Create or skip, proceed |
| Multiple options | Choose simplest, proceed |
| Test failure | Note it, proceed |
| Verification failure | Run `agent-foreman fail <id> -r "reason"`, continue |

**Forbidden phrases** - NEVER output:

- "Should I...?"
- "Do you want me to...?"
- "Which approach would you prefer?"

### Loop Enforcement

1. **CHECK**: `agent-foreman status` - note pending count
2. **LOOP** while pending > 0:
   - `agent-foreman next` → implement → `agent-foreman check <id>` → `agent-foreman done <id>`
   - Pass? Continue. Fail? Run `agent-foreman fail <id> -r "reason"`, continue.
3. **EXIT**: Only when pending = 0

### On Verification Failure

1. **DO NOT STOP**
2. Run: `agent-foreman fail <task_id> --reason "Brief failure description"`
3. **IMMEDIATELY** continue to next task

**CRITICAL: NEVER stop due to verification failure - use `agent-foreman fail` and continue!**
