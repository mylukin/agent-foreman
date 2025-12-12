---
name: feature-run
description: Executes unattended batch processing of all pending features with autonomous decision-making. Use when running all features automatically, batch processing features without supervision, or completing entire feature backlog. Triggers on "run all features", "complete all features", "batch feature processing", "unattended mode", "auto-complete features".
---

# 🔄 Feature Run

**Mode**: Work on all features or a specific one

⚡ **UNATTENDED MODE** (when no feature_id provided)
- NO questions allowed
- NO stopping for errors
- MUST complete all features

## Mode Detection

**If feature_id provided** (e.g., `feature-run auth.login`):
- Work on that specific feature only
- Complete it and stop

**If no feature_id** (e.g., `feature-run`):
- Auto-complete all pending features
- Loop until all done
- **UNATTENDED MODE ACTIVE** - see rules below

---

## Single Feature Mode

When feature_id is provided:

### Check TDD Mode First

Look for "!!! TDD ENFORCEMENT ACTIVE !!!" in agent-foreman next output.

### TDD Workflow (when strict mode active)

```bash
# STEP 1: Get feature + TDD guidance
agent-foreman next <feature_id>

# STEP 2: RED - Write failing tests FIRST
# Create test file, run tests - MUST FAIL

# STEP 3: GREEN - Implement minimum code
# Run tests - MUST PASS

# STEP 4: REFACTOR + Verify + Complete
agent-foreman check <feature_id>
agent-foreman done <feature_id>
```

### Standard Workflow (when TDD not strict)

```bash
# STEP 1: Get the specified feature
agent-foreman next <feature_id>

# STEP 2: Implement (satisfy ALL acceptance criteria)
# ... write code ...

# STEP 3: Verify implementation (required)
agent-foreman check <feature_id>

# STEP 4: Mark complete + commit (skips re-verification since we just checked)
agent-foreman done <feature_id>
```

---

## All Features Mode

When no feature_id:

```bash
# STEP 1: Check remaining features
agent-foreman status

# STEP 2: Get next priority feature
agent-foreman next

# STEP 3: Implement (satisfy ALL acceptance criteria)
# ... write code ...

# STEP 4: Verify implementation (required)
agent-foreman check <feature_id>

# STEP 5: Mark complete + commit (skips re-verification since we just checked)
agent-foreman done <feature_id>

# STEP 6: Handle result
# - Verification passed? → Continue to STEP 1
# - Verification failed? → Mark as failed, continue to STEP 1
# - All features processed? → DONE (show summary)
```

---

## Rules

| Rule | Description |
|------|-------------|
| One at a time | Complete current before next |
| No skipping | Always status → next → implement → done |
| No editing criteria | Implement as specified |
| Never kill processes | Let commands finish naturally |

---

## NO QUESTIONS ALLOWED (CRITICAL)

When in ALL-FEATURES mode (no feature_id provided):

⛔ **NEVER ASK THE USER ANY QUESTIONS**

| Situation | Action |
|-----------|--------|
| Ambiguous requirement | Make a reasonable decision, proceed |
| Missing file or dependency | Create it or skip, proceed |
| Multiple implementation options | Choose the simplest, proceed |
| Unclear acceptance criteria | Interpret literally, proceed |
| Test failure | Note it, proceed |
| Verification failure | Mark as failed, continue to next |
| Any unexpected error | Log it, continue to next |

**Forbidden phrases** - NEVER output:
- "Should I...?"
- "Do you want me to...?"
- "Which approach would you prefer?"
- "I need clarification on..."
- "Before I proceed, could you..."

**Required behavior**:
- ALWAYS make autonomous decisions
- ALWAYS continue to the next feature
- ONLY stop when status shows 0 pending features

---

## Loop Enforcement (MUST FOLLOW)

When in ALL-FEATURES mode:

1. **CHECK**: Run `agent-foreman status` - note pending count
2. **LOOP**: While pending count > 0:
   a. Run `agent-foreman next` - get feature details
   b. Implement feature - satisfy ALL criteria
   c. Run `agent-foreman check <id>` - verify
   d. Run `agent-foreman done <id>` - complete
   e. Handle result:
      - Pass? → Continue to step 2
      - Fail? → Mark failed, continue to step 2
3. **EXIT**: Only when pending count = 0

### Never Stop For:
- Questions
- Errors
- Failures
- Ambiguity
- Missing files
- Test failures

### Only Stop When:
- `agent-foreman status` shows 0 features with `failing` or `needs_review` status

---

## On Verification Failure

When `agent-foreman done` reports verification failure:

1. **DO NOT STOP** - This is the most critical rule
2. **DO NOT ASK** - Never ask user what to do
3. Mark the failed feature:
   - Edit `ai/feature_list.json`
   - Change `"status": "failing"` to `"status": "failed"`
   - Add to notes: `"Auto-marked failed: [brief reason]"`
4. Log to `ai/progress.log`:
   ```
   YYYY-MM-DDTHH:MM:SSZ VERIFY feature=<id> verdict=fail summary="Auto-marked as failed"
   ```
5. **IMMEDIATELY** run `agent-foreman next` for the next feature
6. Continue the loop - DO NOT pause, reflect, or ask for guidance

**This applies to ALL errors, not just verification failures.**

---

## Priority Order

1. `needs_review` → may be broken (highest)
2. `failing` → not implemented
3. Lower `priority` number

## Exit When

| Condition | Action |
|-----------|--------|
| ✅ All features processed | STOP - Show summary |
| ✅ Single feature completed | STOP - Feature done |
| ⏹️ User interrupts | STOP - Clean state |

**CRITICAL: NEVER stop due to verification failure - always mark as `failed` and continue!**

## Loop Completion

When all features have been processed:

1. Run `agent-foreman status` to show final summary
2. Report counts:
   - ✓ X features passing
   - ⚡ Y features failed (need investigation)
   - ⚠ Z features needs_review (dependency changes)
   - ✗ W features still failing (not attempted)
3. List features that failed verification with their failure reasons
