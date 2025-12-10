# Progress Log Format

Append entries to `ai/progress.log` using this **single-line format only**:

```
2025-01-15T10:30:00Z STEP feature=auth.login status=passing summary="Implemented login flow"
2025-01-15T11:00:00Z CHANGE feature=auth.login action=refactor reason="Improved error handling"
2025-01-15T12:00:00Z REPLAN summary="Splitting auth into submodules" note="Original scope too large"
```

**Log types**: `INIT` | `STEP` | `CHANGE` | `REPLAN` | `VERIFY`

**IMPORTANT**: Do NOT write verbose Markdown session notes. Keep each entry as a single line.
