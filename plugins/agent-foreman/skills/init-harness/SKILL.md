---
name: init-harness
description: Initialize or upgrade the long-task harness for a project
---

# Init Harness Skill

Set up or upgrade the long-task harness infrastructure for feature-driven development.

## When to Use

Invoke this skill when:

- **Starting a new project** that needs structured feature tracking
- **Adding harness to existing project** for better organization
- **Upgrading harness** after significant project changes
- **Re-scanning features** when new routes or tests are added

## Auto-Detection Flow

The `init` command automatically chooses the best approach:

```text
agent-foreman init "goal"
        │
        ▼
┌───────────────────┐
│ PROJECT_SURVEY.md │
│     exists?       │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
   YES          NO
    │           │
    ▼           ▼
┌─────────┐  ┌───────────────┐
│ Use     │  │ Has source    │
│ survey  │  │ code files?   │
│ (fast)  │  └───────┬───────┘
└─────────┘          │
              ┌──────┴──────┐
              │             │
             YES            NO
              │             │
              ▼             ▼
        ┌─────────────┐  ┌─────────────┐
        │ AI scan     │  │ Generate    │
        │ + auto-save │  │ from goal   │
        │ survey      │  │ (10-20 feat)│
        └─────────────┘  └─────────────┘
```

## Modes

### Merge Mode (default)

```bash
agent-foreman init "Project goal"
```

- Keeps existing features unchanged
- Adds newly discovered features
- Preserves all status and notes
- Best for existing projects

### New Mode

```bash
agent-foreman init "Project goal" --mode new
```

- Creates fresh feature list
- Replaces all existing features
- Re-discovers from routes/tests
- Best for major replanning

### Scan Mode

```bash
agent-foreman init "Project goal" --mode scan
```

- Only observes, does not modify
- Shows what would be discovered
- Useful for preview before commit
- **Does not create git commit**

## Created Files

### 1. `ai/feature_list.json`

Feature backlog with schema validation:

```json
{
  "features": [
    {
      "id": "auth.login",
      "description": "User can log in with email and password",
      "module": "auth",
      "priority": 1,
      "status": "failing",
      "acceptance": [
        "User enters valid credentials",
        "System returns JWT token",
        "User is redirected to dashboard"
      ],
      "dependsOn": [],
      "version": 1,
      "origin": "init-from-goal"
    }
  ],
  "metadata": {
    "projectGoal": "Build user authentication system",
    "createdAt": "2024-01-15T10:00:00Z",
    "updatedAt": "2024-01-15T10:00:00Z",
    "version": "1.0.0"
  }
}
```

### 2. `ai/progress.log`

Session handoff audit log:

```text
INIT 2024-01-15T10:00:00Z goal="Build user authentication" note="mode=merge, features=15"

STEP 2024-01-15T11:30:00Z feature=auth.login status=passing tests="npm test" summary="Implemented login endpoint"
```

### 3. `ai/init.sh`

Bootstrap script with detected commands:

```bash
#!/usr/bin/env bash
bootstrap() { npm install }
dev() { npm run dev }
check() { npm run test }
```

### 4. `CLAUDE.md`

Instructions for AI agents working on the project.

## Git Integration

### Suggested Commit

After creating all files, `init` suggests a git commit command:

```text
📝 Suggested git commit:
   git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"
```

**Output:**

```text
✓ Feature list saved with 15 features
✓ Generated ai/init.sh
✓ Generated CLAUDE.md
✓ Updated ai/progress.log

📝 Suggested git commit:
   git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"

🎉 Harness initialized successfully!
```

**Note:** The commit is not automatic - run the suggested command to commit the harness files.

## Feature Discovery Sources

| Scenario | Source | Features Generated |
|----------|--------|-------------------|
| Has `PROJECT_SURVEY.md` | Survey document | Based on existing analysis |
| Has source code | AI scan + **auto-saves survey** | From routes, tests, patterns |
| Empty project | Goal description | 10-20 features from goal |

## Feature ID Convention

IDs use dot notation: `module.submodule.action`

Examples:

- `auth.login`
- `auth.password.reset`
- `api.users.create`
- `chat.message.edit`

## Usage Examples

### New Project (Empty Directory)

```bash
# Create project
mkdir my-api && cd my-api
git init

# Initialize with goal (AI generates features)
agent-foreman init "Build a REST API for task management"

# Output:
# ✓ Feature list saved with 12 features
# ✓ Generated ai/init.sh
# ✓ Generated CLAUDE.md
# ✓ Updated ai/progress.log
# 📝 Suggested git commit:
#    git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"
# 🎉 Harness initialized successfully!

# Check what was created
agent-foreman status
```

### Existing Project (With Code)

```bash
# First, survey to understand the project (recommended)
agent-foreman survey

# Then initialize (uses survey for faster feature generation)
agent-foreman init "Continue development on e-commerce platform"

# Start working
agent-foreman step
```

### Major Replanning

```bash
# Preview what would be discovered
agent-foreman init "New direction for the project" --mode scan

# If satisfied, do a full reset
agent-foreman init "New direction for the project" --mode new
```

## Post-Initialization

After initialization:

1. **Review** `ai/feature_list.json` - Adjust priorities, add missing features
2. **Edit** acceptance criteria - Make them specific and testable
3. **Add** dependencies - Set `dependsOn` for features that require others
4. **Configure** `ai/init.sh` - Ensure commands work for your project

## Important Notes

- For existing projects, run `/project-survey` first for better results
- Always review auto-discovered features
- Manually add features that weren't discovered
- Set realistic priorities (1 = highest)
- Git commit is suggested (not automatic), except in scan mode where no commit is suggested

---

*Part of the agent-foreman plugin*
