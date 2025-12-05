# Product Requirements Document

## Overview

**agent-foreman** is a long-task harness for AI coding agents that enables feature-driven development with external memory.

> **agent-foreman** 是一个面向 AI 编程代理的长任务管理工具，通过外部记忆实现功能驱动开发。

## Problem Statement

AI coding agents face three common failure modes when working on long-running tasks:

| Failure Mode | Description |
|--------------|-------------|
| **Doing too much at once** | Trying to complete everything in one session, resulting in messy, incomplete code |
| **Premature completion** | Declaring victory before all features actually work |
| **Superficial testing** | Not thoroughly validating implementations |

> AI 编程代理在处理长时间任务时面临三种常见失败模式：一次做太多、过早宣布完成、测试不充分。

## Solution

Provide a structured harness with:

1. **External Memory** - Structured JSON files that persist across sessions
2. **Feature-Driven Workflow** - One task at a time with clear acceptance criteria
3. **Clean Handoffs** - Progress logs for session continuity
4. **Impact Tracking** - Dependency analysis for change management

> 提供结构化的工具框架，包括：外部记忆、功能驱动工作流、干净的会话交接、变更影响追踪。

---

## Core Artifacts

### 1. `ai/feature_list.json` - Feature Backlog

A JSON-based feature backlog that AI agents can reliably update.

**Why JSON instead of Markdown?**

From Anthropic's research:
> "Models are more likely to respect and accurately update JSON structures than markdown checklists."

**Schema:**

```json
{
  "features": [
    {
      "id": "module.feature.action",
      "description": "Human-readable description",
      "module": "parent-module",
      "priority": 1,
      "status": "failing",
      "acceptance": ["Criterion 1", "Criterion 2"],
      "dependsOn": ["other.feature.id"],
      "supersedes": [],
      "tags": [],
      "version": 1,
      "origin": "manual",
      "notes": "",
      "testRequirements": {
        "unit": { "required": false, "pattern": "tests/module/**/*.test.ts" }
      }
    }
  ],
  "metadata": {
    "projectGoal": "Project goal description",
    "createdAt": "2024-01-01T00:00:00.000Z",
    "updatedAt": "2024-01-01T00:00:00.000Z",
    "version": "1.0.0"
  }
}
```

**Optional fields:** `testRequirements`, `e2eTags`, `testFiles`, `verification`

### 2. `ai/progress.log` - Session Audit Log

Single-line entries for session handoff:

```text
2025-01-15T10:00:00Z INIT goal="Build REST API" note="initialized harness" summary="Created long-task harness"
2025-01-15T10:30:00Z STEP feature=auth.login status=passing summary="Implemented login"
2025-01-15T11:00:00Z CHANGE feature=auth.login action=refactor reason="Improved error handling" summary="refactor on auth.login"
2025-01-15T12:00:00Z REPLAN summary="Splitting auth into submodules" note="Original scope too large"
2025-01-15T13:00:00Z VERIFY feature=auth.login action=pass summary="Verified auth.login: pass"
```

**Log Types:** `INIT` | `STEP` | `CHANGE` | `REPLAN` | `VERIFY`

### 3. `ai/init.sh` - Bootstrap Script

Environment entry point with three standard functions:

```bash
bootstrap() { # Install dependencies }
dev()       { # Start development server }
check()     { # Run tests + verification }
```

### 4. `CLAUDE.md` - AI Instructions

Project-specific instructions for AI agents, including workflow rules and file schemas.

---

## Feature Status Values

| Status | Meaning | Action |
|--------|---------|--------|
| `failing` | Not yet implemented | Work on it |
| `passing` | Acceptance criteria met | Done |
| `blocked` | External dependency blocking | Skip for now |
| `needs_review` | May be affected by recent changes | Re-verify |
| `deprecated` | No longer needed | Ignore |

---

## Workflows

### New Project

```bash
mkdir my-project && cd my-project
agent-foreman init "Build a REST API"
agent-foreman next
```

### Existing Project

```bash
agent-foreman analyze        # Analyze existing code
agent-foreman init          # Create harness from survey
agent-foreman next          # Start working
```

### Development Loop

```bash
agent-foreman status        # 1. Check progress
agent-foreman next          # 2. Get next feature
# ... implement feature ... # 3. Do the work
agent-foreman done <id> # 4. Verify + complete + auto-commit
```

---

## Feature Selection Priority

1. `needs_review` status (highest - may be broken)
2. `failing` status (new work needed)
3. Lower `priority` number

---

## Change Management

### Adding New Features

- Add to `feature_list.json` with `status: "failing"`
- Log `CHANGE` entry with reason

### Modifying Requirements

- Don't overwrite existing features
- Mark old feature as `deprecated`
- Create new feature with `supersedes` reference
- Increment `version` field

### Impact Analysis

When changing a feature:

1. Find dependent features (`dependsOn` references)
2. Find same-module features
3. Mark affected features as `needs_review`

---

## Commands

| Command | Purpose |
|---------|---------|
| `analyze` | AI-powered project analysis |
| `init` | Initialize or upgrade harness |
| `next` | Get next priority feature |
| `status` | Show project progress |
| `done` | Verify + mark complete + auto-commit |
| `detect-capabilities` | Detect project verification capabilities |
| `check` | Preview verification |
| `impact` | Analyze dependencies |
| `agents` | Show available AI agents |

---

## Success Metrics

- Clean session handoffs (no context loss)
- One feature per session discipline
- Verified completion (no premature declarations)
- Trackable progress (audit log)

---

*Based on Anthropic's research: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)*
