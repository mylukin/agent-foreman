# agent-foreman

> Long Task Harness for AI agents - feature-driven development with external memory
>
> AI 代理的长任务管理框架 - 基于功能驱动的开发，提供外部记忆

[![npm version](https://img.shields.io/npm/v/agent-foreman.svg)](https://www.npmjs.com/package/agent-foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Problem

AI coding agents face three common failure modes when working on long-running tasks:

1. **Doing too much at once** - Trying to complete everything in one session, resulting in messy, incomplete code
2. **Premature completion** - Declaring victory before all features actually work
3. **Superficial testing** - Not thoroughly validating implementations

## Solution

**agent-foreman** provides a structured harness that enables AI agents to:

- Maintain **external memory** via structured files
- Work on **one feature at a time** with clear acceptance criteria
- **Hand off cleanly** between sessions via progress logs
- **Track impact** of changes on other features

## Installation

```bash
# Global installation
npm install -g agent-foreman

# Or use with npx
npx agent-foreman --help
```

## Quick Start

### New Project

```bash
# Initialize the harness
agent-foreman init "Build a REST API for task management"

# Check status
agent-foreman status

# Start working on features
agent-foreman step
```

### Existing Project

```bash
# Survey the project first
agent-foreman survey

# Initialize (merge mode preserves existing features)
agent-foreman init "Project goal" --mode merge

# Start working
agent-foreman step
```

## Commands

| Command | Description |
|---------|-------------|
| `survey [output]` | Generate project survey report |
| `init <goal>` | Initialize or upgrade the harness |
| `step [feature_id]` | Show next feature to work on |
| `status` | Show current project status |
| `impact <feature_id>` | Analyze impact of changes |
| `complete <feature_id>` | Mark a feature as complete |

## Core Files

The harness maintains three core artifacts:

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with status tracking |
| `ai/progress.log` | Session handoff audit log |
| `ai/init.sh` | Environment bootstrap script |

## Feature Status

| Status | Meaning |
|--------|---------|
| `failing` | Not yet implemented |
| `passing` | Acceptance criteria met |
| `blocked` | External dependency blocking |
| `needs_review` | May be affected by changes |
| `deprecated` | No longer needed |

## Workflow

### Session Start

```bash
# 1. Check status
agent-foreman status

# 2. Get next feature
agent-foreman step
```

### Feature Implementation

```bash
# 3. Implement the feature
# ... your development work ...

# 4. Run tests
./ai/init.sh check

# 5. Mark complete
agent-foreman complete auth.login

# 6. Check impact
agent-foreman impact auth.login
```

### Session End

```bash
# 7. Commit with feature ID
git add .
git commit -m "feat(auth): implement user login

Feature: auth.login"
```

## Claude Code Plugin

agent-foreman is also available as a Claude Code plugin:

```bash
# Install plugin
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman
```

### Available Skills

| Skill | Description |
|-------|-------------|
| `/project-survey` | Analyze existing projects |
| `/init-harness` | Initialize the harness |
| `/feature-step` | Work on features |

## Using with Claude Code (Detailed Guide)

This section explains how to use agent-foreman with Claude Code to complete tasks one by one in a structured workflow.

> 本节介绍如何使用 agent-foreman 与 Claude Code 配合，逐个完成任务。

### Step 1: Initialize the Harness

First, initialize the harness in your project:

```bash
# For new projects - specify your project goal
agent-foreman init "Build a REST API for user management"

# For existing projects - scan first, then init with merge mode
agent-foreman survey
agent-foreman init "Your project goal" --mode merge
```

This creates:
- `ai/feature_list.json` - Your feature backlog
- `ai/progress.log` - Session handoff log
- `ai/init.sh` - Bootstrap script

### Step 2: Check Project Status

Ask Claude Code to check the current status:

```
> Use foreman to check the current project status
> 使用 foreman 检查当前项目状态
```

Or run directly:

```bash
agent-foreman status
```

Output example:
```
📊 Project Status
   ✓ Passing: 5
   ✗ Failing: 18
   ⚠ Needs Review: 0

   Completion: [████░░░░░░░░░░░░░░░░░░░░░░░░░░] 22%
```

### Step 3: Get Next Task

Ask Claude Code to find the next priority task:

```
> Use foreman to get the next task to work on
> 使用 foreman 获取下一个需要完成的任务
```

Or run directly:

```bash
agent-foreman step
```

Output example:
```
═══════════════════════════════════════════════════════════════
                     NEXT TASK
═══════════════════════════════════════════════════════════════

📋 Feature: cli.survey
   Module: cli | Priority: 10
   Status: failing

   Description:
   Generate AI-powered project survey report

   Acceptance Criteria:
   1. Generate AI-powered project survey report works as expected

═══════════════════════════════════════════════════════════════
   When done, run: agent-foreman complete cli.survey
═══════════════════════════════════════════════════════════════
```

### Step 4: Implement the Feature

Work on implementing the feature. Claude Code will help you with the implementation based on the acceptance criteria.

### Step 5: Mark Task as Complete

After implementing and testing the feature:

```bash
agent-foreman complete <feature_id>
```

Example:
```bash
agent-foreman complete cli.survey
```

Output:
```
✓ Marked 'cli.survey' as passing

📝 Suggested commit:
   git add -A && git commit -m "feat(cli): Generate AI-powered project survey report"

  Next up: cli.init
```

### Step 6: Repeat Until Done

Continue the cycle:

```
step → implement → complete → step → implement → complete → ...
```

When all features are complete:
```
🎉 All features are now passing!

📊 Regenerating project survey...
✓ Updated docs/PROJECT_SURVEY.md (100% complete)
```

### Complete Workflow Example

Here's a complete example of using agent-foreman with Claude Code:

```
User: Use foreman to check and analyze the current project
Claude: [Runs foreman status and analysis]

User: What's the next task to complete?
Claude: [Runs agent-foreman step, shows next feature]

User: Complete this task
Claude: [Implements the feature, runs tests]
Claude: [Runs agent-foreman complete <feature_id>]

User: Continue to the next task
Claude: [Runs agent-foreman step for next feature]
... repeat until all tasks are done ...
```

### Batch Completion (for already implemented features)

If your features are already implemented but not marked as passing:

```bash
# Complete features one by one
agent-foreman complete cli.survey
agent-foreman complete cli.init
agent-foreman complete cli.step
# ... continue until all done
```

### Using the Foreman Agent

You can also use the specialized foreman agent in Claude Code:

```
User: Use the foreman agent to analyze the project and complete all tasks
Claude: [Spawns foreman agent to handle the workflow]
```

The foreman agent will:
1. Read `ai/feature_list.json` and `ai/progress.log`
2. Identify the next priority feature
3. Help implement and test it
4. Mark it complete and move to the next

### Tips for Success

1. **One task at a time** - Focus on completing one feature before moving to the next
2. **Check acceptance criteria** - Make sure you meet all criteria before marking complete
3. **Run tests** - Use `./ai/init.sh check` to verify your implementation
4. **Commit often** - Create atomic commits for each completed feature
5. **Review impact** - Run `agent-foreman impact <id>` after making changes

## Supported Tech Stacks

| Language | Frameworks |
|----------|------------|
| Node.js/TypeScript | Express, Vue, React, Astro, Next.js, Nuxt |
| Go | Echo, Gin, Fiber |
| Python | FastAPI, Flask, Django |

## Feature List Schema

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
        "System returns JWT token"
      ],
      "dependsOn": ["auth.register"],
      "version": 1,
      "origin": "manual"
    }
  ],
  "metadata": {
    "projectGoal": "Build authentication system",
    "version": "1.0.0"
  }
}
```

## Best Practices

1. **One feature at a time** - Complete before switching
2. **Update status promptly** - Mark passing when criteria met
3. **Review impact** - Run impact analysis after changes
4. **Clean commits** - One feature = one atomic commit
5. **Read first** - Always check feature list and progress log

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## License

MIT

## Author

Lukin ([@mylukin](https://github.com/mylukin))

---

Inspired by Anthropic's blog post: [Effective harnesses for long-running agents](https://www.anthropic.com)
