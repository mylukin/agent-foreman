---
name: status
description: Show task completion status and progress summary
allowed-tools: [Bash, Read, Glob, Grep]
argument-hint: "[--json|--quiet]"
---

# EXECUTE NOW

Run this command immediately:

```bash
agent-foreman status
```

Wait for completion. Review the status shown.

## If User Specifies Options

| User Says | Execute |
|-----------|---------|
| "json" / "as json" | `agent-foreman status --json` |
| "quiet" / "minimal" | `agent-foreman status --quiet` |
| (default) | `agent-foreman status` |

## Status Output

The command displays:
- **Project goal** - What the project aims to achieve
- **Task counts** - Passing, failing, blocked, needs_review, failed, deprecated
- **Completion percentage** - Visual progress bar
- **Recent activity** - Latest entries from progress log

## Task Status Indicators

| Symbol | Status | Meaning |
|--------|--------|---------|
| ✓ | Passing | Acceptance criteria met |
| ✗ | Failing | Not yet implemented |
| ⚠ | Needs Review | May be affected by changes |
| ⚡ | Failed | Verification failed |
| ⏸ | Blocked | External dependency blocking |
| ⊘ | Deprecated | No longer needed |

**Note:** Read-only operation. No code changes. No commits.
