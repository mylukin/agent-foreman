---
description: Initialize or upgrade the long-task harness for feature-driven development
---

# Initialize Harness

Set up or upgrade the long-task harness infrastructure for feature-driven development.

## When to Use

- **Starting a new project** that needs structured feature tracking
- **Adding harness to existing project** for better organization
- **Upgrading harness** after significant project changes
- **Re-scanning features** when new routes or tests are added

## Command

```bash
agent-foreman init "Your project goal"
```

### Modes

| Mode | Command | Description |
|------|---------|-------------|
| Merge (default) | `agent-foreman init "goal"` | Keeps existing features, adds new ones |
| New | `agent-foreman init "goal" --mode new` | Fresh start, replaces all features |
| Scan | `agent-foreman init "goal" --mode scan` | Preview only, no changes |

## Auto-Detection Flow

```text
agent-foreman init "goal"
        |
        v
  Has PROJECT_SURVEY.md? --> YES --> Use survey (fast)
        |
       NO
        v
  Has source code? --> YES --> AI scan + auto-save survey
        |
       NO
        v
  Generate from goal (10-20 features)
```

## Created Files

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with schema validation |
| `ai/progress.md` | Session handoff audit log |
| `ai/init.sh` | Bootstrap script with detected commands |
| `CLAUDE.md` | Instructions for AI agents |

## Feature List Schema

```json
{
  "id": "auth.login",
  "description": "User can log in with email and password",
  "module": "auth",
  "priority": 1,
  "status": "failing",
  "acceptance": ["User enters valid credentials", "System returns JWT token"],
  "dependsOn": [],
  "version": 1,
  "origin": "init-from-goal"
}
```

## Workflow

### New Project

```bash
mkdir my-project && cd my-project
git init
agent-foreman init "Build a REST API for task management"
```

### Existing Project

```bash
# Recommended: survey first for better results
agent-foreman survey

# Then initialize (uses survey for faster feature generation)
agent-foreman init "Continue development on e-commerce platform"
```

## Post-Initialization

1. **Review** `ai/feature_list.json` - Adjust priorities, add missing features
2. **Edit** acceptance criteria - Make them specific and testable
3. **Add** dependencies - Set `dependsOn` for features that require others
4. **Configure** `ai/init.sh` - Ensure commands work for your project

## Git Integration

After initialization, a suggested git commit is shown:

```text
git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"
```

**Note:** The commit is suggested, not automatic.
