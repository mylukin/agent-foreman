---
description: Automatically complete all pending features from the feature list in priority order
---

# EXECUTE THIS LOOP

Start immediately. Do not ask for confirmation.

```bash
# STEP 1: Check status
agent-foreman status

# STEP 2: Get next feature
agent-foreman step

# STEP 3: Implement feature
# (satisfy ALL acceptance criteria shown)

# STEP 4: Complete feature
agent-foreman complete <feature_id>

# STEP 5: Decision
# - More features remaining? → Go to STEP 1
# - All passing/deprecated? → STOP, report success
# - Verification failed? → STOP, report failure
```

## Rules (MUST Follow)

| Rule | Action |
|------|--------|
| No skipping | Always: status → step → implement → complete |
| One at a time | Complete current before next |
| No editing criteria | Implement exactly as specified |
| Never kill processes | Let commands finish naturally |

## Exit Conditions

| Condition | Action |
|-----------|--------|
| All features `passing`/`deprecated` | ✅ STOP - Success |
| Verification fails | ❌ STOP - Report failure |
| User interrupts | ⏹️ STOP - Clean state |

## Priority Order (Auto-Selected)

1. `needs_review` → highest
2. `failing` → next
3. Lower `priority` number
