# Workflow for Each Session

## ⚠️ STRICT WORKFLOW COMPLIANCE (MANDATORY)

**AI agents MUST strictly follow the defined workflow. NO improvisation allowed.**

### Required Workflow Sequence

```text
next → implement → self-review → check → done
```

**This sequence is MANDATORY. Every step must be executed in this exact order.**

### Forbidden Behaviors

| ❌ DO NOT | ✅ INSTEAD |
|-----------|------------|
| Skip `next` and go straight to implementation | Always run `agent-foreman next` first |
| Skip self-review and go straight to `check` | Always self-review before check |
| Skip `check` and go straight to `done` | Always run `agent-foreman check` before `done` |
| Invent your own workflow steps | Follow exactly: `next → implement → self-review → check → done` |
| Add extra verification steps | Use only the commands in the workflow |
| Reorder workflow steps | Execute in exact sequence |
| Ask user "should I run check?" | Just run the command as defined |

---

## Mode Detection

**If a task_id is provided** (e.g., `agent-foreman next auth.login`):
- Work on that specific task only
- Complete it and stop

**If no task_id** (e.g., `agent-foreman next`):
- Auto-select highest priority pending task
- Process tasks in priority order

---

## IMPORTANT: TDD Mode Check

Before implementing ANY task, check if strict TDD mode is active:
- Look for `!!! TDD ENFORCEMENT ACTIVE !!!` in `agent-foreman next` output
- **DO NOT read index.json directly** - always use CLI output for workflow decisions

**If TDD mode is strict → MUST follow TDD Workflow below**
**If TDD mode is recommended/disabled → May follow Standard Workflow**

---

## TDD Workflow (MANDATORY when tddMode: strict)

**AI agents MUST follow these steps EXACTLY in order. DO NOT skip any step.**

```bash
# STEP 1: Get task and TDD guidance
agent-foreman next <task_id>
# Read the TDD GUIDANCE section carefully
# Note the suggested test files and test cases
```

### STEP 2: RED - Write Failing Tests FIRST

**This step is MANDATORY. DO NOT write implementation code yet.**

1. Create test file at the suggested path (e.g., `tests/module/feature.test.ts`)
2. Write test cases for EACH acceptance criterion
3. Run tests to verify they FAIL:
   ```bash
   CI=true <your-test-command>  # e.g., npm test, pnpm test, yarn test, vitest
   ```
4. **Tests MUST fail** - this confirms tests are valid and testing the right thing

Example test structure:
```typescript
describe('feature-name', () => {
  it('should satisfy acceptance criterion 1', () => {
    // Test implementation
    expect(result).toBe(expected);
  });

  it('should satisfy acceptance criterion 2', () => {
    // Test implementation
  });
});
```

### STEP 3: GREEN - Implement Minimum Code

**Only now may you write implementation code.**

1. Write the MINIMUM code needed to pass tests
2. Do not add extra features or optimizations yet
3. Run tests to verify they PASS:
   ```bash
   CI=true <your-test-command>
   ```
4. **All tests MUST pass** before proceeding

### STEP 4: REFACTOR - Clean Up Under Test Protection

1. Improve code structure, naming, readability
2. Remove duplication
3. Run tests after EACH change to ensure they still pass:
   ```bash
   CI=true <your-test-command>
   ```
4. **Tests MUST remain passing** throughout refactoring

### STEP 4.5: Self-Review (MANDATORY Before Check)

**Before running `agent-foreman check`, you MUST self-review your work.**

> 在运行 check 之前，必须先自审你的工作。

1. **Re-read ALL acceptance criteria** from `agent-foreman next` output
2. **Verify EACH criterion** is satisfied in your implementation:
   ```text
   □ Criterion 1: [How is it satisfied?]
   □ Criterion 2: [How is it satisfied?]
   □ Criterion 3: [How is it satisfied?]
   ```
3. **Check for common issues:**
   - Missing edge cases?
   - Incomplete implementation?
   - Over-engineering (features not requested)?
   - Tests actually testing the right thing?
4. **Fix any issues found** before proceeding

**Why:** Finding your own bugs is faster than waiting for verification to catch them.

### STEP 5: Verify and Complete

```bash
# Verify implementation meets all criteria
agent-foreman check <task_id>

# If check passes, complete the task
agent-foreman done <task_id>
```

---

## Standard Workflow (when tddMode: recommended or disabled)

### Single Task Mode

When task_id is provided:

```bash
# STEP 1: Get the specified task
agent-foreman next <task_id>

# STEP 2: Implement task
# (satisfy ALL acceptance criteria shown)

# STEP 2.5: Self-Review (MANDATORY)
# Re-read acceptance criteria, verify each is satisfied
# Check for: missing edge cases, over-engineering, incomplete work
# Fix any issues BEFORE proceeding to check

# STEP 3: Verify implementation (required)
agent-foreman check <task_id>

# STEP 4: Complete task (skips re-verification since we just checked)
agent-foreman done <task_id>

# STEP 5 (Optional): Check impact on dependent tasks
agent-foreman impact <task_id>
# If dependents need review, they'll be prioritized in next selection
```

### All Tasks Mode

When no task_id:

```bash
# STEP 1: Check status
agent-foreman status

# STEP 2: Get next task
agent-foreman next

# STEP 3: Implement task
# (satisfy ALL acceptance criteria shown)

# STEP 3.5: Self-Review (MANDATORY)
# Re-read acceptance criteria, verify each is satisfied
# Check for: missing edge cases, over-engineering, incomplete work
# Fix any issues BEFORE proceeding to check

# STEP 4: Verify implementation (required)
agent-foreman check <task_id>

# STEP 5: Complete task (skips re-verification since we just checked)
agent-foreman done <task_id>

# STEP 6: Handle result
# - Verification passed? → Continue to STEP 1
# - Verification failed? → Run 'agent-foreman fail <task_id> -r "reason"', continue to STEP 1
# - All tasks processed? → STOP, show summary
```

---

## Rules (MUST Follow)

| Rule | Action |
|------|--------|
| TDD mode strict? | MUST follow TDD Workflow (RED → GREEN → REFACTOR) |
| No skipping | Always: next → implement → self-review → check → done |
| Self-review mandatory | Verify ALL criteria before running check |
| One at a time | Complete current before next |
| No editing criteria | Implement exactly as specified |
| Never kill processes | Let commands finish naturally |

---

## On Verification Failure

When `agent-foreman done` or `agent-foreman check` reports verification failure:

1. **DO NOT STOP** - Continue to the next task
2. Mark the failed task using the fail command:
   ```bash
   agent-foreman fail <task_id> --reason "Brief description of failure"
   ```
3. Continue to the next task immediately

**CRITICAL: NEVER stop due to verification failure - always use `agent-foreman fail` and continue!**

---

## Exit Conditions

| Condition | Action |
|-----------|--------|
| All tasks processed | STOP - Show summary |
| Single task completed | STOP - Task done |
| User interrupts | STOP - Clean state |

---

## Loop Completion

When all tasks have been processed:

1. Run `agent-foreman status` to show final summary
2. Report counts:
   - X tasks passing
   - Y tasks failed (need investigation)
   - Z tasks needs_review (dependency changes)
   - W tasks still failing (not attempted)
3. List tasks that failed verification with their failure reasons

---

## Priority Order (Auto-Selected)

1. `needs_review` → highest priority
2. `failing` → next priority
3. Lower `priority` number within same status
