# Commands

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
