---
name: feature-auto-complete
description: Automatically complete all pending features from the feature list in priority order
---

# Feature Auto-Complete

Automatically work through and complete all pending features from the feature list in priority order.

## When to Use

- Starting a development session and want to complete multiple features
- Running autonomous development on a project
- Batch processing all remaining features
- When you want hands-off feature completion

## STRICT Workflow Instructions

**You MUST follow these steps exactly in order. Do NOT skip any step.**

### Step 1: Check Status
```bash
agent-foreman status
```
Review the output to understand remaining features.

### Step 2: Get Next Feature
```bash
agent-foreman step
```
This will show the next priority feature with its acceptance criteria.

### Step 3: Implement Feature
Read and understand the acceptance criteria carefully. Implement the feature to satisfy ALL acceptance criteria.

### Step 4: Complete Feature
```bash
agent-foreman complete <feature_id>
```
This verifies the implementation and marks it as passing if successful.

### Step 5: Loop or Exit
- If more features remain with status `failing` or `needs_review` → **Go back to Step 1**
- If all features are `passing` or `deprecated` → **Stop**
- If verification fails → **Stop and report the failure**

## Workflow Diagram

```text
┌─────────────────────────────────────────────────────┐
│                  AUTO-COMPLETE LOOP                  │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Step 1: agent-foreman status                       │
│          (check remaining features)                  │
│                    ↓                                 │
│  Step 2: agent-foreman step                         │
│          (get next priority feature)                 │
│                    ↓                                 │
│  Step 3: Implement feature                          │
│          (satisfy ALL acceptance criteria)           │
│                    ↓                                 │
│  Step 4: agent-foreman complete <feature_id>        │
│          (verify + mark passing + auto-commit)       │
│                    ↓                                 │
│  Step 5: Check if more features remain              │
│          YES → Go to Step 1                         │
│          NO  → Done! All features complete          │
│                                                      │
└─────────────────────────────────────────────────────┘
```

## Feature Selection Priority

1. `needs_review` - May be broken by recent changes (highest)
2. `failing` - Not yet implemented
3. By `priority` field - Lower number = higher priority

## Exit Conditions

The auto-complete loop stops when:

- All features are `passing` or `deprecated`
- A feature fails verification
- User interrupts the process

## Important Rules

1. **Never skip steps** - Always run `status` before `step`, always run `complete` after implementation
2. **One feature at a time** - Complete current feature before moving to next
3. **Follow acceptance criteria** - Implement exactly what the criteria specify
4. **Do not modify acceptance criteria** - Only implement, never change the requirements

## Progress Tracking

Each completed feature is logged to `ai/progress.log`:

```log
2025-01-15T10:30:00Z STEP feature=auth.login status=passing summary="Auto-completed login flow"
2025-01-15T11:00:00Z STEP feature=auth.logout status=passing summary="Auto-completed logout flow"
```

## Related Commands

```bash
# Check project status
agent-foreman status

# Work on single feature
agent-foreman step

# Complete a specific feature (auto-runs verification)
# Uses quick mode by default - runs only related tests based on testPattern
agent-foreman complete <feature_id>

# Full mode - run all tests (slower, for final verification)
agent-foreman complete <feature_id> --full
```

## Test Pattern Auto-Generation

During `agent-foreman init`, each feature automatically gets a `testPattern` field based on its module:

```json
{
  "id": "auth.login",
  "module": "auth",
  "testPattern": "tests/auth/**/*.test.*"  // Auto-generated
}
```

This enables quick mode to run only related tests, making verification faster.
