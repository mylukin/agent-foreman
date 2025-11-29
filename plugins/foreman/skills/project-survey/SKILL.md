---
name: project-survey
description: Analyze existing projects to generate comprehensive survey reports
---

# Project Survey

Scan and analyze existing codebases to understand structure, tech stack, and features.

## When to Use

- Joining an existing project for the first time
- Understanding codebase structure before making changes
- Preparing for `agent-foreman init` (survey makes init faster)

**Skip this for new/empty projects** - use `agent-foreman init` directly.

## Command

```bash
# Default: generates docs/PROJECT_SURVEY.md
agent-foreman survey

# Custom output path
agent-foreman survey ./custom/path/SURVEY.md

# Verbose output
agent-foreman survey --verbose
```

## What It Does

1. Detects tech stack (language, framework, build tools)
2. Maps directory structure
3. Discovers modules and features from routes/tests
4. Assesses project completion

**Note:** This is read-only - does not modify code or create commits.
