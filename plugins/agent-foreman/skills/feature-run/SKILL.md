---
name: feature-run
description: Automatically complete all pending features from the feature list in priority order
---

# 🔄 Feature Run

**Loop**: `status → step → implement → complete → repeat`

## EXECUTE THIS LOOP

```bash
# STEP 1: Check remaining features
agent-foreman status

# STEP 2: Get next priority feature
agent-foreman step

# STEP 3: Implement (satisfy ALL acceptance criteria)
# ... write code ...

# STEP 4: Verify + commit
agent-foreman complete <feature_id>

# STEP 5: Loop or exit
# - More features? → Go to STEP 1
# - All passing? → DONE
# - Verification failed? → STOP
```

## Rules

| Rule | Description |
|------|-------------|
| One at a time | Complete current before next |
| No skipping | Always status → step → complete |
| No editing criteria | Implement as specified |
| Never kill processes | Let commands finish naturally |

## Priority Order

1. `needs_review` → may be broken (highest)
2. `failing` → not implemented
3. Lower `priority` number

## Exit When

- ✅ All features `passing` or `deprecated`
- ❌ Verification fails
- ⏹️ User interrupts
