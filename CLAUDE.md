# Project Instructions

## Long-Task Harness

This project uses the **agent-foreman** harness for feature-driven development with AI agents.

### Project Goal

Long Task Harness for AI agents - feature-driven development with external memory

### Core Files

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with status tracking |
| `ai/progress.log` | Session handoff audit log |
| `ai/init.sh` | Bootstrap script (install/dev/check) |

### Feature Status Values

- `failing` - Not yet implemented or incomplete
- `passing` - Acceptance criteria met
- `blocked` - External dependency blocking
- `needs_review` - Potentially affected by recent changes
- `deprecated` - No longer needed

### Workflow for Each Session

1. **Start** - Read `ai/feature_list.json` and recent `ai/progress.log`
2. **Select** - Pick the highest priority feature (`needs_review` > `failing`)
3. **Plan** - Review acceptance criteria before coding
4. **Implement** - Work on ONE feature at a time
5. **Done** - Run `agent-foreman done <feature_id>` (auto-verifies + commits)
6. **Log** - Entry automatically added to progress log
7. **Next** - Move to next feature or celebrate completion

### Rules

1. **One feature per session** - Complete or pause cleanly before switching
2. **Don't modify acceptance criteria** - Only change `status` and `notes`
3. **Update status promptly** - Mark features passing when criteria met
4. **Leave clean state** - No broken code between sessions
5. **Use single-line log format** - One line per entry, not verbose Markdown
6. **Never kill running processes** - Let `agent-foreman` commands complete naturally, even if they appear slow or timed out. They may be doing important work (verification, git commits, survey regeneration). Just wait for completion.
7. **Use CI=true for tests** - Always set `CI=true` environment variable when running any test commands (e.g., `CI=true npm test`, `CI=true pnpm test`, `CI=true vitest`) to ensure non-interactive mode and consistent behavior.

### Progress Log Format

Append entries to `ai/progress.log` using this **single-line format only**:

```
2025-01-15T10:30:00Z STEP feature=auth.login status=passing summary="Implemented login flow"
2025-01-15T11:00:00Z CHANGE feature=auth.login action=refactor reason="Improved error handling"
2025-01-15T12:00:00Z REPLAN summary="Splitting auth into submodules" note="Original scope too large"
```

**Log types**: `INIT` | `STEP` | `CHANGE` | `REPLAN` | `VERIFY`

**IMPORTANT**: Do NOT write verbose Markdown session notes. Keep each entry as a single line.

### Commands

```bash
# View project status
agent-foreman status

# Work on next priority feature
agent-foreman next

# Work on specific feature
agent-foreman next <feature_id>

# Mark feature as done (auto-runs verification + auto-commit)
# Quick mode is default - runs only related tests based on testRequirements.unit.pattern
agent-foreman done <feature_id>

# Full mode - run all tests (slower, for final verification)
agent-foreman done <feature_id> --full

# Skip E2E tests (faster iterations)
agent-foreman done <feature_id> --skip-e2e

# Skip auto-commit (manual commit)
agent-foreman done <feature_id> --no-commit

# Skip verification (not recommended)
agent-foreman done <feature_id> --skip-verify

# Analyze impact of changes
agent-foreman impact <feature_id>

# Detect project verification capabilities
agent-foreman detect-capabilities

# Bootstrap/development/testing
./ai/init.sh bootstrap
./ai/init.sh dev
./ai/init.sh check
./ai/init.sh check --quick  # Selective testing mode
```

### Feature ID Convention

Feature IDs use dot notation: `module.submodule.action`

Examples:
- `auth.login`
- `chat.message.edit`
- `api.users.create`

### Acceptance Criteria Format

Write criteria as testable statements:
- "User can submit the form and see a success message"
- "API returns 201 status with created resource"
- "Error message displays when validation fails"

### Feature JSON Schema

When adding or modifying features in `ai/feature_list.json`, use this schema:

```json
{
  "features": [
    {
      "id": "module.feature.action",
      "description": "Human-readable description of the feature",
      "module": "parent-module-name",
      "priority": 1,
      "status": "failing",
      "acceptance": [
        "First acceptance criterion",
        "Second acceptance criterion"
      ],
      "dependsOn": ["other.feature.id"],
      "supersedes": [],
      "tags": ["optional-tag"],
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

### testRequirements Structure

```json
"testRequirements": {
  "unit": {
    "required": false,
    "pattern": "tests/auth/**/*.test.ts",
    "cases": ["should login", "should logout"]
  },
  "e2e": {
    "required": false,
    "pattern": "e2e/auth/**/*.spec.ts",
    "tags": ["@auth"],
    "scenarios": ["user can login"]
  }
}
```

- `required: true` → Feature cannot complete without matching test files (TDD enforcement)
- `pattern` → Glob pattern for selective test execution in quick mode
- `cases`/`scenarios` → Expected test names (optional, for documentation)

**Status values**: `failing` | `passing` | `blocked` | `needs_review` | `deprecated`

**Origin values**: `init-auto` | `init-from-routes` | `init-from-tests` | `manual` | `replan`

### TDD Workflow

Run `agent-foreman next` to see TDD guidance:
- Suggested test files for the current feature
- Acceptance criteria → test case mapping
- Test skeleton preview

Follow the **RED → GREEN → REFACTOR** cycle:
1. **RED**: View acceptance criteria (they are your failing tests)
2. **GREEN**: Write minimum code to satisfy criteria
3. **REFACTOR**: Clean up under test protection

---

## Release Workflow

When releasing a new version, **all three config files must be updated together**:

| File | Field |
|------|-------|
| `package.json` | `version` |
| `.claude-plugin/marketplace.json` | `metadata.version` + `plugins[0].version` |
| `plugins/agent-foreman/.claude-plugin/plugin.json` | `version` |

### Quick Release Command

```bash
# 1. Update marketplace.json and plugin.json to new version (e.g., 0.1.57)
# 2. Then run:
git add -A && git commit -m "chore: sync version numbers" && npm version patch && git push origin main --tags && npm publish
```

### Manual Steps

1. Edit version in `.claude-plugin/marketplace.json` (2 places)
2. Edit version in `plugins/agent-foreman/.claude-plugin/plugin.json`
3. Run `npm version patch` (auto-updates `package.json`)
4. Commit and push with tags
5. Publish to npm

---

*Generated by agent-foreman - https://github.com/mylukin/agent-foreman*
