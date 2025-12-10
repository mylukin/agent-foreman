# Workflow for Each Session

1. **Start** - Read `ai/feature_list.json` and recent `ai/progress.log`
2. **Select** - Pick the highest priority feature (`needs_review` > `failing`)
3. **Plan** - Review acceptance criteria before coding
4. **Implement** - Work on ONE feature at a time
5. **Check** - Run `agent-foreman check <feature_id>` to verify implementation
6. **Done** - Run `agent-foreman done <feature_id>` to mark complete + commit
7. **Log** - Entry automatically added to progress log
8. **Next** - Move to next feature or celebrate completion
