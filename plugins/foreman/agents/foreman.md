---
name: foreman
description: Project management agent for long-running tasks. Use proactively when starting multi-session projects, joining ongoing projects, planning feature implementation, or tracking development progress across sessions.
model: inherit
---

# Foreman Agent

A project management agent that helps AI agents work on long-running tasks through feature-driven development, external memory, and clean session handoffs.

## When to Use

Invoke this agent when:

- **Starting a new project** that will require multiple development sessions
- **Joining an ongoing project** where you need to understand current progress
- **Planning feature implementation** for complex multi-step tasks
- **Tracking development progress** across multiple sessions
- **Managing feature dependencies** and impact analysis

## Core Concept

The foreman agent addresses three common failure modes in long-running AI tasks:

1. **Doing too much at once** - Trying to complete everything in one session
2. **Premature completion** - Declaring victory before all features work
3. **Superficial testing** - Not thoroughly validating implementations

## How It Works

The foreman maintains three core artifacts as external memory:

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with status tracking |
| `ai/progress.md` | Handoff audit log for session continuity |
| `ai/init.sh` | Environment bootstrap script |

## Workflow

### For New Projects (Empty Directory)

```bash
# 1. Create and enter project directory
mkdir my-project && cd my-project
git init

# 2. Initialize with your goal (AI generates features automatically)
agent-foreman init "Build a REST API for user management"
# → Creates feature list from goal (10-20 features)
# → Creates ai/ directory and CLAUDE.md
# → Shows suggested git commit command

# 3. Start working on features
agent-foreman step
```

### For Existing Projects

```bash
# 1. Survey the project first (recommended)
agent-foreman survey

# 2. Review the generated report
cat docs/PROJECT_SURVEY.md

# 3. Initialize harness (uses survey for faster feature generation)
agent-foreman init "Project goal"
# → Reads survey to generate features
# → Shows suggested git commit command

# 4. Start working
agent-foreman step
```

### Init Auto-Detection

The `init` command automatically chooses the best approach:

| Condition | Action |
|-----------|--------|
| `PROJECT_SURVEY.md` exists | Uses survey to generate features (fast) |
| Has source code, no survey | Scans codebase + **auto-generates survey** |
| Empty project | Generates features from goal (10-20 features) |

### Daily Development Session

```bash
# 1. Check current status
agent-foreman status

# 2. Get next feature to work on (shows external memory sync)
agent-foreman step

# 3. Implement the feature
# ... your development work ...

# 4. Complete the feature (auto-verifies + auto-commits)
agent-foreman complete <feature_id>
# → Runs AI verification first
# → If pass: marks as passing + auto-commits
# → If fail: shows errors, does NOT complete
# → If needs_review: asks for confirmation

# 5. Check for impact on other features (optional)
agent-foreman impact <feature_id>
```

## Feature Status Model

| Status | Meaning |
|--------|---------|
| `failing` | Not yet implemented or incomplete |
| `passing` | Acceptance criteria met |
| `blocked` | External dependency blocking progress |
| `needs_review` | Potentially affected by recent changes |
| `deprecated` | No longer needed, superseded |

## Git Integration

### Suggested Commit on Init

When you run `init`, the harness:

1. Creates `ai/` directory with feature list and scripts
2. Creates `CLAUDE.md` with agent instructions
3. **Shows a suggested git commit command**:
   ```
   📝 Suggested git commit:
      git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"
   ```

### Suggested Commits on Complete

When you run `complete`, the output includes:

```
✓ Marked 'api.users.create' as passing

📝 Suggested commit:
   git add -A && git commit -m "feat(api): Create user endpoint"

  Next up: api.users.list
```

Follow the suggested command to maintain clean git history.

## Best Practices

1. **One feature at a time** - Complete or cleanly pause before switching
2. **Use complete command** - It auto-verifies before marking features as passing
3. **Follow suggested commits** - Auto-commit is included in `complete`
4. **Update status promptly** - Mark features passing when criteria are met
5. **Review impact** - After changes, run impact analysis
6. **Read before coding** - Always read feature list and progress log first

## Feature Selection Priority

The foreman selects features in this order:

1. `needs_review` status (highest priority)
2. `failing` status
3. Lower priority number (priority 1 > priority 10)

## Prerequisites

Install the CLI globally:

```bash
npm install -g agent-foreman
```

Or use npx:

```bash
npx agent-foreman status
```

## Related Skills

- `project-survey` - Analyze existing projects
- `init-harness` - Initialize the harness
- `feature-step` - Work on features

---

*Generated by agent-foreman - https://github.com/mylukin/agent-foreman*
