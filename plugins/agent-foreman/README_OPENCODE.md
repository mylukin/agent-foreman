# Agent Foreman OpenCode Plugin

This plugin integrates the `agent-foreman` CLI into OpenCode, allowing you to manage feature-driven development directly from your AI assistant.

## Prerequisites

The plugin requires the `agent-foreman` CLI to be available in your system PATH.

### Option A: Use Your Local Version (Recommended for Testing)
If you want to use the version from this repository (including any local changes):
1. Open a terminal in the root of this repository.
2. Run:
   ```bash
   npm install && npm run build
   npm link
   ```
   This makes the `agent-foreman` command point to your local code.

### Option B: Use Public Version
For standard usage (once changes are published):
```bash
npm install -g agent-foreman
```

## Installation

To use this plugin in another OpenCode project, you must **manually install the plugin files** from this repository.

1. **Create the plugin directory** in your target project:
   ```bash
   mkdir -p .opencode/plugin
   ```

2. **Copy the plugin file** from this repository to your target project:
   ```bash
   # From the root of this agent-foreman repo:
   cp plugins/agent-foreman/opencode-plugin.js /path/to/target/project/.opencode/plugin/agent-foreman.js
   ```

3. **Install the OpenCode slash commands** (required for `/agent-foreman ...`):
   ```bash
   # From the root of this agent-foreman repo:
   mkdir -p /path/to/target/project/.opencode/command
   cp -R plugins/agent-foreman/opencode/command/* /path/to/target/project/.opencode/command/
   ```

4. **Reload OpenCode** (or restart the session).

## Usage

### Tools (Autonomous Mode)
The plugin registers the following tools that the Agent can use autonomously:
- `foreman_status`: Check project status.
- `foreman_next`: Get the next task.
- `foreman_check`: Verify a feature.
- `foreman_done`: Complete a feature.
- `foreman_fail`: Mark a feature as failed.
- `foreman_run`: **Unattended Mode** - returns the strict system prompt to force the agent into an autonomous loop.

### Slash Commands (Manual Mode)
You can invoke commands manually in the chat (OpenCode command files):

**Preferred:**
- `/agent-foreman status`
- `/agent-foreman next [feature-id]`
- `/agent-foreman check <feature-id>`
- `/agent-foreman done <feature-id>`
- `/agent-foreman fail <feature-id> <reason>`
- `/agent-foreman init [goal]`
- `/agent-foreman analyze [output-path]`
- `/agent-foreman scan`
- `/agent-foreman impact <feature-id>`
- `/agent-foreman run`

Note: Claude-style `/agent-foreman:<cmd>` is not used by the OpenCode command system in this port.

### Batch Mode ("Run")
To execute the autonomous loop (equivalent to Claude's `/run`):
1. Run: `/agent-foreman run`
2. **The Agent will**:
   - Call the `foreman_run` tool.
   - Receive the "System Instruction" prompt as output.
   - Enter a loop of `next` -> implement -> `check` -> `done` until all features are complete.
