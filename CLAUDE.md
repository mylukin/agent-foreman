# Project Instructions

## Long-Task Harness

This project uses the **agent-foreman** harness for feature-driven development with AI agents.

### Project Goal

Long Task Harness for AI agents - feature-driven development with external memory

### Core Files

| File | Purpose |
|------|---------||
| `ai/feature_list.json` | Feature backlog with status tracking |
| `ai/progress.log` | Session handoff audit log |
| `ai/init.sh` | Bootstrap script (install/dev/check) |

### Feature Status Values

- `failing` - Not yet implemented or incomplete
- `passing` - Acceptance criteria met
- `blocked` - External dependency blocking
- `needs_review` - Potentially affected by recent changes
- `failed` - Implementation attempted but verification failed
- `deprecated` - No longer needed

### Feature Selection Priority

When running `agent-foreman next`, features are selected in this order:
1. **Status first**: `needs_review` > `failing` (other statuses excluded)
2. **Then priority number**: Lower number = higher priority (1 is highest)

Example: A feature with `priority: 1` runs before `priority: 10`

### Workflow for Each Session

1. **Start** - Read `ai/feature_list.json` and recent `ai/progress.log`
2. **Select** - Pick the highest priority feature (`needs_review` > `failing`)
3. **Plan** - Review acceptance criteria before coding
4. **Implement** - Work on ONE feature at a time
5. **Check** - Run `agent-foreman check <feature_id>` to verify implementation
6. **Done** - Run `agent-foreman done <feature_id>` to mark complete + commit
7. **Log** - Entry automatically added to progress log
8. **Next** - Move to next feature or celebrate completion

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

# Verify feature implementation (without marking complete)
agent-foreman check <feature_id>

# Mark feature as done (skips verification by default, use after check)
agent-foreman done <feature_id>

# Mark feature as done (with verification, for manual use)
agent-foreman done <feature_id> --no-skip-check

# Full mode - run all tests (slower, for final verification)
agent-foreman done <feature_id> --full --no-skip-check

# Skip E2E tests (faster iterations)
agent-foreman done <feature_id> --skip-e2e

# Skip auto-commit (manual commit)
agent-foreman done <feature_id> --no-commit

# Disable loop mode (no continuation reminder)
agent-foreman done <feature_id> --no-loop

# Analyze impact of changes
agent-foreman impact <feature_id>

# Scan project verification capabilities
agent-foreman scan

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

**IMPORTANT**: When adding or modifying features in `ai/feature_list.json`, use this exact schema.

**Note**: `priority` uses lower number = higher priority (1 is highest, 10 is lower).

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

**Required fields**: `id`, `description`, `module`, `priority`, `status`, `acceptance`, `version`, `origin`

**Auto-generated fields**: `testRequirements` (auto-generated during init with pattern `tests/{module}/**/*.test.*`)

**Optional fields**: `testRequirements` (can be overridden), `e2eTags` (Playwright tags for E2E filtering)

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

**Status values**: `failing` | `passing` | `blocked` | `needs_review` | `failed` | `deprecated`

**Origin values**: `init-auto` | `init-from-routes` | `init-from-tests` | `manual` | `replan`

### TDD Mode Configuration

The project's TDD enforcement is controlled by `metadata.tddMode` in `ai/feature_list.json`:

| Mode | Effect |
|------|--------|
| `strict` (default) | Tests REQUIRED - check/done fail without tests |
| `recommended` | Tests suggested but not enforced |
| `disabled` | No TDD guidance |

#### Strict Mode Behavior

When `tddMode: "strict"`:
- `agent-foreman check` blocks if test files missing
- `agent-foreman done` blocks if test files missing
- All features auto-migrate to `testRequirements.unit.required: true`
- TDD workflow enforced: RED → GREEN → REFACTOR

#### User Control via Natural Language

| User Says | Action |
|-----------|--------|
| "enable strict TDD" / "require tests" | Set `tddMode: "strict"` |
| "disable strict TDD" / "optional tests" | Set `tddMode: "recommended"` |
| "turn off TDD" | Set `tddMode: "disabled"` |

To change mode manually, edit `ai/feature_list.json`:
```json
{
  "metadata": {
    "tddMode": "strict"
  }
}
```

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

Version numbers are automatically synced across all config files via npm lifecycle hooks.

| File | Field | Updated By |
|------|-------|------------|
| `package.json` | `version` | `npm version` |
| `.claude-plugin/marketplace.json` | `metadata.version` + `plugins[0].version` | Auto-synced |
| `plugins/agent-foreman/.claude-plugin/plugin.json` | `version` | Auto-synced |

### Release Command

```bash
# Single command - everything is automated
npm version patch && git push origin main --tags
```

### What Happens

1. `npm version patch` bumps `package.json` version
2. `version` hook runs `scripts/sync-version.ts` to update plugin files
3. Git commit is created with all version files
4. `git push --tags` triggers GitHub Actions which:
   - Builds binaries for 5 platforms (parallel)
   - Publishes to npm registry (parallel)
   - Creates GitHub Release with binaries attached

### Required Setup (One-time)

Configure npm Trusted Publishing (OIDC, no tokens needed):
1. Go to https://www.npmjs.com/package/agent-foreman/access
2. Click "Add trusted publisher"
3. Fill in:
   - Owner: `mylukin`
   - Repository: `agent-foreman`
   - Workflow: `release.yml`
   - Environment: (leave empty)

### Binary Distribution

Binaries are automatically built and uploaded to GitHub Releases on version tags.
Users can upgrade via:
- **npm users**: `npm install -g agent-foreman@latest`
- **Binary users**: Auto-download from GitHub Releases (built-in self-update)

---

*Generated by agent-foreman - https://github.com/mylukin/agent-foreman*
