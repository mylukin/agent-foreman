---
description: Work on the next priority feature with guided implementation workflow
---

# EXECUTE NOW

Run this command immediately:

```bash
agent-foreman next
```

Wait for completion. Review the feature shown.

## If User Specifies Feature

| User Says | Execute |
|-----------|---------|
| Feature ID provided | `agent-foreman next <feature_id>` |
| "check" / "test first" | `agent-foreman next --check` |
| "preview" / "dry-run" | `agent-foreman next --dry-run` |
| (default) | `agent-foreman next` |

## After Next Command

### Check TDD Mode First

Look for "!!! TDD ENFORCEMENT ACTIVE !!!" in the output.

**If TDD strict mode active → MUST follow TDD Workflow:**

1. **RED** - Write failing tests FIRST (DO NOT write implementation yet)
2. **Run tests** - Verify they FAIL
3. **GREEN** - Implement MINIMUM code to pass tests
4. **Run tests** - Verify they PASS
5. **REFACTOR** - Clean up, run tests after each change
6. **Verify** with: `agent-foreman check <feature_id>`
7. **Complete** with: `agent-foreman done <feature_id>`

**If TDD not strict → Standard Workflow:**

1. **Read** the acceptance criteria shown
2. **Implement** the feature to satisfy ALL criteria
3. **Verify** with: `agent-foreman check <feature_id>`
4. **Complete** with: `agent-foreman done <feature_id>`

## Complete Options

| User Says | Execute |
|-----------|---------|
| (default, skip verification) | `agent-foreman done <id>` |
| "verify first" / "run tests" | `agent-foreman done <id> --no-skip-check` |
| "full test" / "all tests" | `agent-foreman done <id> --full --no-skip-check` |
| "skip e2e" | `agent-foreman done <id> --skip-e2e` |
| "no commit" / "manual commit" | `agent-foreman done <id> --no-commit` |
| "no loop" / "single feature" | `agent-foreman done <id> --no-loop` |

## Priority Order (Auto-Selected)

1. `needs_review` → may be broken (highest)
2. `failing` → not implemented
3. Lower `priority` number
