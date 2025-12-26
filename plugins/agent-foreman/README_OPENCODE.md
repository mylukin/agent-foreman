# Agent Foreman OpenCode Plugin

This plugin integrates the `agent-foreman` CLI into OpenCode, allowing you to manage feature-driven development directly from your AI assistant.

## Quick Install

The easiest way to install the plugin in any OpenCode project:

```bash
# From your project directory:
agent-foreman install --opencode

# Install plugin dependencies:
cd .opencode && npm install
```

Then restart OpenCode and you're ready to use `/agent-foreman` commands.

## Prerequisites

The plugin requires the `agent-foreman` CLI to be available in your system PATH.

### Option A: Install from npm (Recommended)
```bash
npm install -g agent-foreman
```

### Option B: Use Local Version (for development)
If you want to use the version from this repository:
```bash
# From the agent-foreman repo root:
npm install && npm run build
npm link
```

## OpenCode Agent Configuration

When using `AGENT_FOREMAN_AGENTS=opencode`, the integration invokes `opencode run` with these characteristics:

### Prompt Passing
- The prompt is passed as a **positional argument** (NOT stdin, NOT `@file`).
- Example: `opencode run --format default "Your prompt here..."`

### Environment Variables (All Optional)
No default model or agent is hardcoded in code. Configure these only if needed:

| Variable | Description |
|----------|-------------|
| `AGENT_FOREMAN_OPENCODE_MODEL` or `OPENCODE_MODEL` | Model to use (e.g., `anthropic/claude-sonnet-4-20250514`) |
| `AGENT_FOREMAN_OPENCODE_AGENT` or `OPENCODE_AGENT` | Agent type to use (e.g., `build`, `summary`) |

If not set, OpenCode uses its own configured defaults from `opencode.json` or provider settings.

### Permissions
The plugin automatically sets `OPENCODE_PERMISSION` to allow all operations for non-interactive execution:
```json
{
  "bash": "allow",
  "edit": "allow",
  "webfetch": "allow",
  "doom_loop": "allow",
  "external_directory": "allow"
}
```

## Manual Installation (Alternative)

If you prefer to manually copy files instead of using `agent-foreman install --opencode`:

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
