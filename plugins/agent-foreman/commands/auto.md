---
description: Automatically complete all pending features from the feature list in priority order
---

# Auto-Complete All Features

Run through and complete all pending features from the feature list automatically.

## When to Use

- Starting a development session to complete multiple features
- Running autonomous development on a project
- Batch processing all remaining features

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
This verifies the implementation using quick mode (runs only related tests based on testPattern) and marks it as passing if successful.

Use `--full` flag for comprehensive testing: `agent-foreman complete <feature_id> --full`

### Step 5: Loop or Exit
- If more features remain with status `failing` or `needs_review` → **Go back to Step 1**
- If all features are `passing` or `deprecated` → **Stop**
- If verification fails → **Stop and report the failure**

## Feature Selection Priority

1. `needs_review` - May be broken by recent changes (highest priority)
2. `failing` - Not yet implemented
3. By `priority` field - Lower number = higher priority

## Exit Conditions

Stop the loop when:

- All features are `passing` or `deprecated`
- A feature fails verification
- User interrupts the process

## Important Rules

1. **Never skip steps** - Always run `status` before `step`, always run `complete` after implementation
2. **One feature at a time** - Complete current feature before moving to next
3. **Follow acceptance criteria** - Implement exactly what the criteria specify
4. **Do not modify acceptance criteria** - Only implement, never change the requirements
5. **Never kill running processes** - Let `agent-foreman` commands complete naturally, even if they appear slow or timed out. Just wait for completion.
