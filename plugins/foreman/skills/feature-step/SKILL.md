---
name: feature-step
description: Work on the next priority feature with guided implementation
---

# Feature Step

Select and work on the next priority feature from the backlog.

## When to Use

- Starting a development session
- After completing a feature to get the next task
- Checking feature details before implementation

## Command

```bash
# Auto-select next priority feature
agent-foreman step

# Work on specific feature
agent-foreman step <feature_id>

# Run tests first
agent-foreman step --check

# Preview without changes
agent-foreman step --dry-run
```

## Feature Selection Priority

1. `needs_review` - May be broken by recent changes
2. `failing` - Not yet implemented
3. By `priority` field - Lower number = higher priority

## Workflow

1. `agent-foreman step` - Get next task
2. Review acceptance criteria
3. Implement the feature
4. `agent-foreman complete <feature_id>` - Verify + mark passing + auto-commit

**Note:** `complete` runs AI-powered verification automatically (tests, typecheck, lint, build + AI analysis).

## Related Commands

```bash
# Check project status
agent-foreman status

# Preview verification without completing
agent-foreman verify <feature_id>

# Verify + mark complete + auto-commit
agent-foreman complete <feature_id>

# Skip verification (not recommended)
agent-foreman complete <feature_id> --skip-verify

# Add notes when completing
agent-foreman complete <feature_id> --notes "Added extra validation"
```
