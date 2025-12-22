# Agent Foreman OpenCode Plugin

This plugin integrates the `agent-foreman` CLI into OpenCode, allowing you to manage feature-driven development directly from your AI assistant.

## Prerequisites

The `agent-foreman` CLI tool must be installed and available in your system PATH.

```bash
npm install -g agent-foreman
# or if developing locally, link it:
npm link
```

## Installation

To use this plugin in another OpenCode project, you must copy the plugin files into your project's configuration directory.

**Manual Installation**:

1. Create the plugin directory in your project:
   ```bash
   mkdir -p .opencode/plugin/agent-foreman
   ```

2. Copy the contents of this `plugins/agent-foreman` directory into it:
   - `opencode-plugin.js`
   - `package.json`

3. Restart OpenCode or reload plugins.

## Usage

### Tools
The plugin registers the following tools that the Agent can use autonomously:
- `foreman_status`: Check project status.
- `foreman_next`: Get the next task.
- `foreman_check`: Verify a feature.
- `foreman_done`: Complete a feature.
- `foreman_fail`: Mark a feature as failed.
- `foreman_run`: **Unattended Mode** - returns the strict system prompt to force the agent into an autonomous loop.

### Slash Commands
You can invoke commands manually in the chat:
- `/foreman status`
- `/foreman next [feature-id]`
- `/foreman check <feature-id>`
- `/foreman done <feature-id>`

### Batch Mode ("Run")
To execute the autonomous loop (equivalent to Claude's `/run`):
1. **Instruct the Agent**: "Call `foreman_run` to start autonomous batch processing."
2. **The Agent will**:
   - Call the `foreman_run` tool.
   - Receive the "System Instruction" prompt as output.
   - Enter a loop of `next` -> implement -> `check` -> `done` until all features are complete.
   - It will strictly avoid asking questions as per the prompt instructions.
