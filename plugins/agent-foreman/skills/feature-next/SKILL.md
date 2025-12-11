---
name: feature-next
description: Work on the next priority feature with guided implementation
---

# 🚀 Feature Next

**One command**: `agent-foreman next`

## Quick Start

```bash
agent-foreman next           # Auto-select next priority
agent-foreman next auth.login  # Specific feature
```

## Workflow

### Check TDD Mode First

Look for "!!! TDD ENFORCEMENT ACTIVE !!!" in agent-foreman next output.

### TDD Workflow (when strict mode active)

```
next → RED (tests) → GREEN (implement) → REFACTOR → check → done
```

```bash
agent-foreman next              # 1. Get task + TDD guidance
# Create test file FIRST        # 2. Write failing tests
# Run tests - MUST FAIL         # 3. Verify RED phase
# ... implement minimum code    # 4. GREEN - pass tests
# Run tests - MUST PASS         # 5. Verify GREEN phase
# Refactor under test safety    # 6. Clean up
agent-foreman check <id>        # 7. Verify implementation
agent-foreman done <id>         # 8. Mark complete + commit
```

### Standard Workflow (when TDD not strict)

```
next → implement → check → done
```

```bash
agent-foreman next              # 1. Get task + acceptance criteria
# ... implement the feature ... # 2. Write code
agent-foreman check <id>        # 3. Verify implementation
agent-foreman done <id>         # 4. Mark complete + commit
```

## Priority Order

1. `needs_review` → may be broken
2. `failing` → not implemented
3. Lower `priority` number = higher priority (1 is highest, 10 is lower)

## Options

| Flag | Effect |
|------|--------|
| `--check` | Run tests before showing feature |
| `--dry-run` | Preview without changes |

## Complete Options

```bash
agent-foreman done <id>             # Skip verification + commit (default)
agent-foreman done <id> --no-skip-check  # Run verification before marking complete
agent-foreman done <id> --full --no-skip-check  # Run all tests + verification
agent-foreman done <id> --skip-e2e  # Skip E2E tests
agent-foreman done <id> --no-commit # Manual commit
agent-foreman done <id> --no-loop   # Disable continuation reminder
```
