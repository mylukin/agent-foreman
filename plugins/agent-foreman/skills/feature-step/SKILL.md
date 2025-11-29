---
name: feature-step
description: Select and work on the next priority feature from ai/feature_list.json with external memory sync and acceptance criteria guidance. Use when starting a development session, completing a feature, or checking feature details before implementation.
---

# Feature Step Skill

> **Tip:** For more reliable invocation, use the `/foreman-step` slash command instead of this skill.

Select and work on the next priority feature from the backlog with structured guidance.

## When to Use

Automatically invoke this skill when:

- **Starting a development session** to pick up where you left off
- **Completing a feature** to identify the next task
- **Checking feature details** before implementation
- **Understanding acceptance criteria** for a specific feature

## How It Works

1. **Reads context** - Loads feature list and progress log
2. **Selects feature** - Chooses highest priority available
3. **Displays guidance** - Shows description, acceptance criteria, dependencies
4. **Tracks progress** - Updates status and logs changes

## Feature Selection Priority

Features are selected in this order:

| Priority | Status | Reason |
|----------|--------|--------|
| 1st | `needs_review` | May be broken by recent changes |
| 2nd | `failing` | Not yet implemented |
| 3rd | By `priority` field | Lower number = higher priority |

## Usage

### Auto-Select Next Feature

```bash
agent-foreman step
```

Automatically selects the highest priority feature.

### Work on Specific Feature

```bash
agent-foreman step auth.login
```

Shows details for the specified feature.

### Run Tests First

```bash
agent-foreman step --check
```

Runs `ai/init.sh check` before showing the next task.

### Preview Without Changes

```bash
agent-foreman step --dry-run
```

Shows what would be selected without making changes.

## Output Example

```text
═══════════════════════════════════════════════════════════════
                    EXTERNAL MEMORY SYNC
═══════════════════════════════════════════════════════════════

📁 Current Directory:
   /Users/dev/my-project

📜 Recent Git Commits:
   abc1234 feat(api): add user endpoint
   def5678 chore: initialize agent-foreman harness

📝 Recent Progress:
   2024-01-15 10:00 [INIT] Initialize harness
   2024-01-15 11:30 [STEP] Completed auth.register

📊 Feature Status:
   ✓ Passing: 3 | ✗ Failing: 12 | ⚠ Review: 0 | Blocked: 0
   Progress: [████░░░░░░░░░░░░░░░░░░░░░░░░░░] 20%

═══════════════════════════════════════════════════════════════
                     NEXT TASK
═══════════════════════════════════════════════════════════════

📋 Feature: auth.login
   Module: auth | Priority: 1
   Status: failing

   Description:
   User can log in with email and password

   Acceptance Criteria:
   1. User enters valid credentials
   2. System returns JWT token
   3. User is redirected to dashboard

   ⚠ Depends on: auth.register

═══════════════════════════════════════════════════════════════
   When done, run: agent-foreman complete auth.login
═══════════════════════════════════════════════════════════════
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
# Run project tests
./ai/init.sh check

# Or specific test command
npm run test
```

### 5. Complete (with Integrated Verification)

Run complete - it automatically verifies first:

```bash
agent-foreman complete auth.login
```

This will:
1. Run AI-powered verification (tests, typecheck, lint, build + AI analysis)
2. If verification passes → marks feature as passing + auto-commits
3. If verification fails → shows errors, does NOT mark complete
4. If needs_review → prompts for confirmation

**Skip verification (not recommended):**

```bash
agent-foreman complete auth.login --skip-verify
```

**Preview verification only:**

```bash
agent-foreman verify auth.login
```

**Output with suggested commit:**

```text
✓ Marked 'auth.login' as passing

📝 Suggested commit:
   git add -A && git commit -m "feat(auth): User can log in with email and password"

  Next up: auth.logout
```

### 7. Follow Suggested Commit

```bash
git add -A && git commit -m "feat(auth): User can log in with email and password"
```

### 8. Check Impact (Optional)

```bash
agent-foreman impact auth.login
```

### 9. Continue

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

## Dependencies

If a feature has dependencies:

```text
⚠ Depends on: auth.register, user.profile
```

**Check that dependencies are passing before starting.**

If dependencies are failing, work on them first:

```bash
agent-foreman step auth.register
```

## Notes Field

Features may have notes from previous sessions:

```text
Notes: Started implementation, need to add validation
```

Continue from where the previous session left off.

## Common Commands

```bash
# See what's next
agent-foreman step

# Check project status
agent-foreman status

# Mark feature complete (shows suggested commit)
agent-foreman complete <feature_id>

# Mark feature complete with notes
agent-foreman complete <feature_id> --notes "Added extra validation"

# Check impact of changes
agent-foreman impact <feature_id>
```

## Git Integration

### Suggested Commits

After marking a feature complete, the CLI shows a suggested commit command:

```text
📝 Suggested commit:
   git add -A && git commit -m "feat(module): description"
```

**Best practice:** Always follow the suggested commit to maintain clean git history for the next agent session.

### Commit Format

The suggested format follows conventional commits:

```text
feat(module): Short description from feature

Examples:
- feat(auth): User can log in with email and password
- feat(api): Create user endpoint with validation
- fix(chat): Handle empty message gracefully
```

## Best Practices

1. **One feature at a time** - Don't start multiple features
2. **Complete or pause cleanly** - Leave code in working state
3. **Follow suggested commits** - Use the commit command shown after `complete`
4. **Update notes** - If pausing, note what's done and what's left
5. **Test thoroughly** - Check all acceptance criteria
6. **Clean commits** - One feature = one commit

## Troubleshooting

### "No feature list found"

Run initialization first:

```bash
agent-foreman init "Your project goal"
```

### "Feature not found"

Check available features:

```bash
agent-foreman status
```

### "All features passing"

```text
🎉 All features are passing or blocked. Nothing to do!
```

Your project is complete! Add new features manually to `ai/feature_list.json`.

---

*Part of the agent-foreman plugin*
