---
description: Agent Foreman - feature-driven development with external memory
---

You are running the Agent Foreman command.

Parse the arguments provided below and call the corresponding tool:

**Arguments:** $ARGUMENTS

**Command mapping:**
- `status` -> call `foreman_status` tool
- `spec <requirement>` -> call `foreman_spec` tool
- `next [feature_id]` -> call `foreman_next` tool (pass featureId if provided)
- `check [feature_id]` -> call `foreman_check` tool
- `done <feature_id>` -> call `foreman_done` tool (featureId required)
- `fail <feature_id> -r <reason>` -> call `foreman_fail` tool
- `init [goal]` -> call `foreman_init` tool
- `analyze [output]` -> call `foreman_analyze` tool
- `scan` -> call `foreman_scan` tool
- `impact <feature_id>` -> call `foreman_impact` tool
- `run` -> call `foreman_run` tool and STRICTLY follow its instructions

If no arguments are provided, show this help:
```
Agent Foreman Commands:
  /agent-foreman status           Show project status
  /agent-foreman spec "req"       Break down requirements
  /agent-foreman next [id]        Get next feature to work on
  /agent-foreman check [id]       Verify feature implementation
  /agent-foreman done <id>        Mark feature complete
  /agent-foreman fail <id> -r "reason"  Mark feature as failed
  /agent-foreman init [goal]      Initialize harness
  /agent-foreman analyze          Generate project analysis
  /agent-foreman scan             Scan verification capabilities
  /agent-foreman impact <id>      Analyze change impact
  /agent-foreman run              Enter autonomous batch mode
```
