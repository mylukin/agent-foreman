# Feature JSON Schema

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

## Feature ID Convention

Feature IDs use dot notation: `module.submodule.action`

Examples:
- `auth.login`
- `chat.message.edit`
- `api.users.create`

## Acceptance Criteria Format

Write criteria as testable statements:
- "User can submit the form and see a success message"
- "API returns 201 status with created resource"
- "Error message displays when validation fails"

## testRequirements Structure

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

- `required: true` - Feature cannot complete without matching test files (TDD enforcement)
- `pattern` - Glob pattern for selective test execution in quick mode
- `cases`/`scenarios` - Expected test names (optional, for documentation)

**Status values**: `failing` | `passing` | `blocked` | `needs_review` | `failed` | `deprecated`

**Origin values**: `init-auto` | `init-from-routes` | `init-from-tests` | `manual` | `replan`

