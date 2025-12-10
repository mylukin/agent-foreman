# TDD Mode Configuration

The project's TDD enforcement is controlled by `metadata.tddMode` in `ai/feature_list.json`:

| Mode | Effect |
|------|--------|
| `strict` (default) | Tests REQUIRED - check/done fail without tests |
| `recommended` | Tests suggested but not enforced |
| `disabled` | No TDD guidance |

## Strict Mode Behavior

When `tddMode: "strict"`:
- `agent-foreman check` blocks if test files missing
- `agent-foreman done` blocks if test files missing
- All features auto-migrate to `testRequirements.unit.required: true`
- TDD workflow enforced: RED - GREEN - REFACTOR

## User Control via Natural Language

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

## TDD Workflow

Run `agent-foreman next` to see TDD guidance:
- Suggested test files for the current feature
- Acceptance criteria - test case mapping
- Test skeleton preview

Follow the **RED - GREEN - REFACTOR** cycle:
1. **RED**: View acceptance criteria (they are your failing tests)
2. **GREEN**: Write minimum code to satisfy criteria
3. **REFACTOR**: Clean up under test protection
