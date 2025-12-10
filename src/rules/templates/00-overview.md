# Long-Task Harness

This project uses the **agent-foreman** harness for feature-driven development with AI agents.

## Core Files

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with status tracking |
| `ai/progress.log` | Session handoff audit log |
| `ai/init.sh` | Bootstrap script (install/dev/check) |

## Feature Status Values

- `failing` - Not yet implemented or incomplete
- `passing` - Acceptance criteria met
- `blocked` - External dependency blocking
- `needs_review` - Potentially affected by recent changes
- `failed` - Implementation attempted but verification failed
- `deprecated` - No longer needed

## Feature Selection Priority

When running `agent-foreman next`, features are selected in this order:
1. **Status first**: `needs_review` > `failing` (other statuses excluded)
2. **Then priority number**: Lower number = higher priority (1 is highest)

Example: A feature with `priority: 1` runs before `priority: 10`
