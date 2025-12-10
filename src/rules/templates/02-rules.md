# Rules

1. **One feature per session** - Complete or pause cleanly before switching
2. **Don't modify acceptance criteria** - Only change `status` and `notes`
3. **Update status promptly** - Mark features passing when criteria met
4. **Leave clean state** - No broken code between sessions
5. **Use single-line log format** - One line per entry, not verbose Markdown
6. **Never kill running processes** - Let `agent-foreman` commands complete naturally, even if they appear slow or timed out. They may be doing important work (verification, git commits, survey regeneration). Just wait for completion.
7. **Use CI=true for tests** - Always set `CI=true` environment variable when running any test commands (e.g., `CI=true npm test`, `CI=true pnpm test`, `CI=true vitest`) to ensure non-interactive mode and consistent behavior.
