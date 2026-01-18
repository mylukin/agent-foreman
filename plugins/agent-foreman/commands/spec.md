---
name: spec
description: Multi-Expert Council for transforming requirements into fine-grained task files
allowed-tools: [Read, Write, Glob, Grep, AskUserQuestion, Bash, Task, Skill]
argument-hint: "<requirement description>"
---

# STEP 0: INVOKE SKILL (MANDATORY)

**BEFORE doing anything else, you MUST invoke the `foreman-spec` skill:**

```
Skill({ skill: "foreman-spec" })
```

The skill provides the complete Multi-Expert Council workflow. The instructions below are a fallback only if the skill fails to load.

---

# FALLBACK: Spec Workflow

> Only follow these instructions if the skill invocation above failed.

## Core Principle

**Ask EVERYTHING. Assume NOTHING.**

---

## Expert Council Pattern

You are three experts analyzing this requirement:

| Expert | Focus | Key Questions |
|--------|-------|---------------|
| **Product Strategist** | User value, business logic | Who benefits? What defines success? |
| **Technical Architect** | System design, patterns | How to build? What patterns to follow? |
| **Quality Guardian** | Risk, testing, security | What can break? How to verify? |

---

## Workflow

### Phase 1: Expert Deliberation (INTERNAL)
- Think as each expert to identify uncertainties
- NOT shown to user

### Phase 2: Synthesized Questions (USER-FACING)
- Merge and prioritize questions across experts
- Present 5-8 questions per batch with options
- Use `AskUserQuestion` tool with recommended option first
- Continue until requirements are clear

### Phase 3: Project Context (AUTOMATED)
- Detect language, framework, patterns
- Read architecture docs and existing code

### Phase 4: Task Breakdown (OUTPUT)
- Create fine-grained tasks following agent-foreman format
- Update `ai/tasks/index.json`

---

## Task Output Conventions (MANDATORY)

### Directory Structure
```
ai/tasks/
├── index.json
├── {module}/
│   └── {task-name}.md
```

### Task ID Convention
Dot notation: `module.submodule.action`

### Task Markdown Format

**Priority**: Determines `next` selection order (lower = selected first).

```yaml
---
id: module.task-name
module: module-name
priority: N  # Assign based on implementation order
status: failing
version: 1
origin: manual
dependsOn: []
supersedes: []
tags: []
---
# Task Title

## Acceptance Criteria

1. Testable criterion
2. Testable criterion
```

### Index.json Update
```json
{
  "version": "2.0.0",
  "updatedAt": "ISO-timestamp",
  "features": {
    "module.task-name": {
      "status": "failing",
      "priority": 1,
      "module": "module",
      "description": "Task description"
    },
    "core.project-init": {
      "status": "failing",
      "priority": 2,
      "module": "core",
      "description": "Initialize project",
      "filePath": "core/01-project-init.md"
    }
  }
}
```

**Note**: Use `filePath` when filename doesn't follow ID convention (e.g., `01-task.md`).

---

## Rules

1. **Expert thinking is internal** - User only sees synthesized questions
2. **Every question has options** - 2-4 choices with recommended first
3. **Project-aware** - Read context before technical questions
4. **Finest granularity** - Tasks are smallest implementable units
5. **Schema compliance** - Tasks MUST follow agent-foreman format
6. **Confirmation gates** - Get approval before each phase transition
