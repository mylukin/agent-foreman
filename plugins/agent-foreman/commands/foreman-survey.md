---
description: Analyze existing project structure and generate comprehensive survey report
---

# Project Survey

Scan and analyze existing projects to understand their structure, tech stack, and feature coverage.

## When to Use

- **Joining an existing project** for the first time
- **Assessing project health** and completion status
- **Understanding codebase structure** before making changes
- **Identifying implemented features** from routes and tests

**Note:** For new/empty projects, skip this and use `/foreman-init` directly.

## Command

Run the survey command:

```bash
agent-foreman survey
```

Options:
- `agent-foreman survey ./custom/path/SURVEY.md` - Custom output path
- `agent-foreman survey --verbose` - Verbose output

## What It Does

1. **Detects tech stack** - Language, framework, build tools, test framework
2. **Maps directory structure** - Entry points, source directories, test directories
3. **Discovers modules** - Identifies logical modules and their status
4. **Finds features** - Extracts features from routes and test files
5. **Assesses completion** - Estimates overall project completion

## Supported Tech Stacks

| Language | Frameworks |
|----------|------------|
| Node.js/TypeScript | Express, Vue, React, Astro, Next.js, Nuxt, Fastify, Koa |
| Go | Echo, Gin, Fiber, Chi |
| Python | FastAPI, Flask, Django |
| Rust | Actix, Axum, Rocket |
| Java/Kotlin | Spring Boot, Ktor |
| Ruby | Rails, Sinatra |
| PHP | Laravel, Symfony |

## Output

Generates `docs/PROJECT_SURVEY.md` containing:
- Tech stack table
- Directory structure
- Discovered features
- Completion assessment
- Available commands

## Workflow

```text
agent-foreman survey   ->  docs/PROJECT_SURVEY.md
       |                   Review the analysis
       v
agent-foreman init     ->  ai/feature_list.json
                           Uses survey (fast!)
```

## Important Notes

- This command is **read-only** - does not modify the codebase
- Does **not** create or update `feature_list.json`
- Does **not** create git commits
- Review the generated report and add missing features manually
