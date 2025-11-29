---
description: Work on the next priority feature with guided implementation workflow
---

# Feature Step

Select and work on the next priority feature from the backlog with structured guidance.

## When to Use

- **Starting a development session** to pick up where you left off
- **Completing a feature** to identify the next task
- **Checking feature details** before implementation
- **Understanding acceptance criteria** for a specific feature

## Command

```bash
# Auto-select next feature
agent-foreman step

# Work on specific feature
agent-foreman step auth.login

# Run tests first
agent-foreman step --check

# Preview without changes
agent-foreman step --dry-run
```

## Feature Selection Priority

| Priority | Status | Reason |
|----------|--------|--------|
| 1st | `needs_review` | May be broken by recent changes |
| 2nd | `failing` | Not yet implemented |
| 3rd | By `priority` field | Lower number = higher priority |

## Output Example

```text
===============================================================
                    EXTERNAL MEMORY SYNC
===============================================================

Current Directory: /Users/dev/my-project
Recent Git Commits:
   abc1234 feat(api): add user endpoint
   def5678 chore: initialize agent-foreman harness

Feature Status:
   Passing: 3 | Failing: 12 | Review: 0 | Blocked: 0
   Progress: [####........................] 20%

===============================================================
                     NEXT TASK
===============================================================

Feature: auth.login
   Module: auth | Priority: 1
   Status: failing

   Description:
   User can log in with email and password

   Acceptance Criteria:
   1. User enters valid credentials
   2. System returns JWT token
   3. User is redirected to dashboard

   Depends on: auth.register

===============================================================
   When done, run: agent-foreman complete auth.login
===============================================================
```

## Development Workflow

### 1. Get Next Task

```bash
agent-foreman step
```

### 2. Plan

- Review acceptance criteria
- Check dependencies are passing
- Identify files to modify

### 3. Implement

- Write code to satisfy criteria
- Keep changes focused on this feature
- Don't introduce unrelated changes

### 4. Test

```bash
./ai/init.sh check
```

### 5. Complete (with Integrated Verification)

```bash
agent-foreman complete auth.login
```

This will:
1. Run AI-powered verification automatically
2. If pass → marks as passing + auto-commits
3. If fail → shows errors, does NOT complete
4. If needs_review → prompts for confirmation

**Skip verification (not recommended):**

```bash
agent-foreman complete auth.login --skip-verify
```

### 6. Continue

```bash
agent-foreman step
```

## Feature States

| Status | Can Work On? | Action |
|--------|-------------|--------|
| `failing` | Yes | Implement the feature |
| `needs_review` | Yes | Review and verify still works |
| `passing` | No | Already complete |
| `blocked` | No | Waiting for external dependency |
| `deprecated` | No | No longer needed |

## Common Commands

```bash
# See what's next
agent-foreman step

# Check project status
agent-foreman status

# Mark feature complete
agent-foreman complete <feature_id>

# Mark complete with notes
agent-foreman complete <feature_id> --notes "Added extra validation"

# Check impact of changes
agent-foreman impact <feature_id>
```

## Best Practices

1. **One feature at a time** - Don't start multiple features
2. **Complete or pause cleanly** - Leave code in working state
3. **Follow suggested commits** - Use the commit command shown after `complete`
4. **Update notes** - If pausing, note what's done and what's left
5. **Test thoroughly** - Check all acceptance criteria
