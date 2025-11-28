# agent-foreman

> Long Task Harness for AI agents - feature-driven development with external memory

[![npm version](https://img.shields.io/npm/v/agent-foreman.svg)](https://www.npmjs.com/package/agent-foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[中文文档](./README_zh.md)

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

## Why It Works

The core insight is simple: **AI agents need the same tooling that makes human engineering teams effective**.

Human engineers don't rely on memory either. We use:
- Git for version history
- Issue trackers for task management
- Documentation for handoffs
- Tests for verification

agent-foreman brings these same patterns to AI:

| Human Practice | AI Equivalent |
|----------------|---------------|
| Scrum board | `feature_list.json` |
| Sprint notes | `progress.md` |
| CI/CD pipeline | `init.sh check` |
| Code review | Acceptance criteria |

### Why JSON Instead of Markdown?

From Anthropic's research:

> "Models are more likely to respect and accurately update JSON structures than markdown checklists."

When features are stored as JSON with explicit `status` fields, AI agents:
- Don't accidentally delete items
- Update status correctly
- Respect the schema

This is the difference between projects that work and projects that mysteriously lose features between sessions.

## Installation

```bash
# Global installation
npm install -g agent-foreman

# Or use with npx
npx agent-foreman --help
```

## Claude Code Plugin

agent-foreman is available as a Claude Code plugin:

```bash
# Install plugin
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman
```

---

## Using with Claude Code

### Initializing Projects

#### Empty Project

For a brand new project with no existing code:

```bash
mkdir my-project && cd my-project
agent-foreman init "Build a REST API for task management" --mode new
```

**Prompt for Claude Code:**

```text
Use foreman to initialize this project.
Goal: Build a REST API for task management
```

#### Existing Project

For projects with existing code:

```bash
agent-foreman survey
agent-foreman init "Your project goal"
```

**Prompt for Claude Code:**

```text
Use foreman to initialize this project.
```

---

### Task Loop Prompts

#### Single Task Completion

```text
Use foreman to get the next task, implement it, and mark it complete.
```

#### Continuous Task Loop

**The Magic Prompt - Auto-complete all tasks:**

```text
Use foreman to check the project status, then continuously work through
all tasks one by one until everything is complete. For each task:
1. Run `agent-foreman step` to get the next task
2. Implement the feature according to acceptance criteria
3. Run tests to verify
4. Run `agent-foreman complete <feature_id>` to mark done
5. Repeat until all tasks are passing
```

#### Quick Status Check

```text
Use foreman to check the current project status.
```

#### Analyze and Plan

```text
Use foreman to analyze this project and give me a comprehensive status report.
```

---

### Managing Tasks

#### Adding New Tasks

Edit `ai/feature_list.json` directly or use Claude Code:

```text
Add a new feature to the task list:
- ID: auth.oauth
- Description: Implement OAuth2 authentication with Google
- Module: auth
- Priority: 5
- Acceptance criteria: User can login with Google account
```

**Feature JSON Structure:**

```json
{
  "id": "auth.oauth",
  "description": "Implement OAuth2 authentication with Google",
  "module": "auth",
  "priority": 5,
  "status": "failing",
  "acceptance": [
    "User can click 'Login with Google' button",
    "System redirects to Google OAuth flow",
    "User is authenticated and redirected back"
  ],
  "dependsOn": ["auth.login"],
  "tags": ["oauth", "google"],
  "version": 1,
  "origin": "manual",
  "notes": ""
}
```

#### Changing Task Goals

```text
Update the project goal to: "Build a full-stack task management app with React frontend"
Also update relevant features to align with the new goal.
```

#### Modifying Existing Tasks

```text
Update feature 'api.users.create':
- Change description to: "Create user with email verification"
- Add acceptance criteria: "Send verification email after registration"
- Set priority to 3
```

#### Marking Tasks as Blocked

```text
Mark feature 'payment.stripe' as blocked with note: "Waiting for Stripe API keys"
```

---

### Auto-Complete All Tasks

#### Method 1: Continuous Loop Prompt

The most effective prompt for fully automated task completion:

```text
I want you to act as an autonomous developer. Use the agent-foreman
harness to continuously complete all remaining tasks:

1. Check status with `agent-foreman status`
2. Get next task with `agent-foreman step`
3. Implement the feature completely
4. Run tests with `./ai/init.sh check`
5. Mark complete with `agent-foreman complete <id>`
6. Commit the changes
7. Loop back to step 2 until all tasks pass

Do not stop until all features are passing. Ask me only if you
encounter a blocker that requires my input.
```

#### Method 2: Using the Foreman Agent

```text
Use the foreman agent to automatically complete all pending tasks
in this project. Work through them one by one until 100% complete.
```

#### Method 3: Batch Completion (for implemented features)

If features are already implemented but not marked:

```text
All features in this project are already implemented and tested.
Use foreman to mark each one as complete, going through them
one by one until all are passing.
```

---

### Workflow Summary

```text
┌─────────────────────────────────────────────────────────────┐
│                    AGENT-FOREMAN WORKFLOW                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  status  │───▶│   step   │───▶│implement │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                               │                     │
│       │                               ▼                     │
│       │                         ┌──────────┐               │
│       │                         │   test   │               │
│       │                         └──────────┘               │
│       │                               │                     │
│       │                               ▼                     │
│       │    ┌──────────┐        ┌──────────┐               │
│       │◀───│   next   │◀───────│ complete │               │
│       │    └──────────┘        └──────────┘               │
│       │                               │                     │
│       ▼                               ▼                     │
│  ┌─────────────────────────────────────────┐               │
│  │  🎉 All features passing! (100%)        │               │
│  │  📊 PROJECT_SURVEY.md auto-updated      │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands Reference

| Command | Description |
|---------|-------------|
| `survey` | Generate project survey report |
| `init <goal>` | Initialize or upgrade the harness |
| `step` | Show next feature to work on |
| `status` | Show current project status |
| `impact <feature_id>` | Analyze impact of changes |
| `complete <feature_id>` | Mark a feature as complete |

### Init Modes

| Mode | Description |
|------|-------------|
| `--mode merge` | Merge with existing (default) |
| `--mode new` | Create new, fail if exists |
| `--mode scan` | Scan only, no AI features |

---

## Core Files

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with status |
| `ai/progress.md` | Session handoff audit log |
| `ai/init.sh` | Environment bootstrap script |
| `docs/PROJECT_SURVEY.md` | AI-generated project survey |

---

## Feature Status Values

| Status | Meaning |
|--------|---------|
| `failing` | Not yet implemented |
| `passing` | Acceptance criteria met |
| `blocked` | External dependency blocking |
| `needs_review` | May be affected by changes |
| `deprecated` | No longer needed |

---

## Supported Tech Stacks

| Language | Frameworks |
|----------|------------|
| Node.js/TypeScript | Express, Vue, React, Astro, Next.js, Nuxt |
| Go | Echo, Gin, Fiber |
| Python | FastAPI, Flask, Django |

---

## Best Practices

1. **One feature at a time** - Complete before switching
2. **Update status promptly** - Mark passing when criteria met
3. **Review impact** - Run impact analysis after changes
4. **Clean commits** - One feature = one atomic commit
5. **Read first** - Always check feature list and progress log

---

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
