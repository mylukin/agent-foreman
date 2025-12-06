---
description: Work on features - auto-complete all pending features or work on a specific one
---

# EXECUTE FEATURE WORKFLOW

Start immediately. Do not ask for confirmation.

## Mode Detection

**If a feature_id is provided** (e.g., `/agent-foreman:run auth.login`):
- Work on that specific feature only
- Complete it and stop

**If no feature_id** (e.g., `/agent-foreman:run`):
- Auto-complete all pending features in priority order
- Loop until all done

---

## Single Feature Mode

When feature_id is provided:

```bash
# STEP 1: Get the specified feature
agent-foreman next <feature_id>

# STEP 2: Implement feature
# (satisfy ALL acceptance criteria shown)

# STEP 3: Complete feature
agent-foreman done <feature_id>
```

---

## All Features Mode

When no feature_id:

```bash
# STEP 1: Check status
agent-foreman status

# STEP 2: Get next feature
agent-foreman next

# STEP 3: Implement feature
# (satisfy ALL acceptance criteria shown)

# STEP 4: Complete feature (--loop flag maintains context across compaction)
agent-foreman done <feature_id> --loop

# STEP 5: Handle result
# - Verification passed? → Continue to STEP 1
# - Verification failed? → Mark as failed, continue to STEP 1
# - All features processed? → STOP, show summary
```

---

## Rules (MUST Follow)

| Rule | Action |
|------|--------|
| No skipping | Always: status → next → implement → done |
| One at a time | Complete current before next |
| No editing criteria | Implement exactly as specified |
| Never kill processes | Let commands finish naturally |

## On Verification Failure

When `agent-foreman done` reports verification failure:

1. **DO NOT STOP** - Continue to the next feature
2. Mark the failed feature as `failed`:
   - Edit `ai/feature_list.json`
   - Change `"status": "failing"` to `"status": "failed"`
   - Add to notes: `"Verification failed: [reason from output]"`
3. Log the failure in `ai/progress.log`:
   ```
   YYYY-MM-DDTHH:MM:SSZ VERIFY feature=<id> verdict=fail summary="Marked as failed"
   ```
4. Continue to the next feature immediately

## Exit Conditions

| Condition | Action |
|-----------|--------|
| All features processed | ✅ STOP - Show summary |
| Single feature completed | ✅ STOP - Feature done |
| User interrupts | ⏹️ STOP - Clean state |

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

## Priority Order (Auto-Selected)

1. `needs_review` → highest
2. `failing` → next
3. Lower `priority` number
