# agents Command

Show available AI agents and their status.

> 显示可用的 AI 代理及其状态。

## Synopsis

```bash
agent-foreman agents
```

## Description

The `agents` command displays which AI agents are available on the system and their priority order. It helps users understand which agent will be used for AI-powered operations like analysis, verification, and capability detection.

> `agents` 命令显示系统上可用的 AI 代理及其优先级顺序。它帮助用户了解哪个代理将用于 AI 驱动的操作，如分析、验证和能力检测。

## Options

This command has no options.

## Execution Flow

```mermaid
flowchart TD
    Start([Start]) --> PrintStatus[printAgentStatus]

    subgraph Detection["Agent Detection"]
        PrintStatus --> GetPriority[Get Priority Order]
        GetPriority --> CheckClaude[Check Claude]
        CheckClaude --> CheckCodex[Check Codex]
        CheckCodex --> CheckGemini[Check Gemini]
    end

    subgraph Display["Display Status"]
        CheckGemini --> ShowPriority[Show Priority Order]
        ShowPriority --> ShowInstalled[Show Installed Agents]
        ShowInstalled --> ShowFirst[Show First Available]
    end

    ShowFirst --> End([End])
```

## Agent Priority System

```mermaid
flowchart TD
    subgraph Priority["Default Priority Order"]
        direction LR
        P1[1. Claude] --> P2[2. Codex] --> P3[3. Gemini]
    end

    subgraph Selection["Agent Selection"]
        CheckAvailable{Agent Available?}
        CheckAvailable -->|Yes| UseAgent[Use This Agent]
        CheckAvailable -->|No| NextAgent[Try Next]
    end

    P1 --> CheckAvailable
    NextAgent --> P2
    P2 --> CheckAvailable
    NextAgent --> P3
```

### Priority Order

The default priority order is:
1. **Claude** (highest priority)
2. **Codex**
3. **Gemini** (lowest priority)

**OpenCode** is also supported but not in the default priority. Enable it via the environment variable.

The first available agent in priority order will be used for all AI operations.

### Environment Variable Override

The priority order can be customized using the `AGENT_FOREMAN_AGENTS` environment variable:

```bash
# Use Gemini first, then Claude
export AGENT_FOREMAN_AGENTS="gemini,claude"

# Use only Codex
export AGENT_FOREMAN_AGENTS="codex"

# Use OpenCode first, then Claude as fallback
export AGENT_FOREMAN_AGENTS="opencode,claude"
```

## Agent CLI Invocations

```mermaid
flowchart LR
    subgraph Agents["Agent CLI Commands"]
        Claude[claude CLI]
        Codex[codex CLI]
        Gemini[gemini CLI]
        OpenCode[opencode CLI]
    end

    subgraph Flags["Automation Flags"]
        ClaudeFlags["--print
--output-format text
--permission-mode bypassPermissions"]
        CodexFlags["--full-auto
--skip-git-repo-check"]
        GeminiFlags["--output-format text
--yolo"]
        OpenCodeFlags["run --format default"]
    end

    Claude --> ClaudeFlags
    Codex --> CodexFlags
    Gemini --> GeminiFlags
    OpenCode --> OpenCodeFlags
```

### Claude
```bash
claude --print --output-format text --permission-mode bypassPermissions -
```
- `--print`: Output response only
- `--output-format text`: Plain text output
- `--permission-mode bypassPermissions`: Allow all operations
- `-`: Read prompt from stdin

### Codex
```bash
codex exec --skip-git-repo-check --full-auto -
```
- `--skip-git-repo-check`: Skip git repository validation
- `--full-auto`: Fully autonomous mode
- `-`: Read prompt from stdin

### Gemini
```bash
gemini --output-format text --yolo
```
- `--output-format text`: Plain text output
- `--yolo`: Autonomous mode (skip confirmations)

### OpenCode
```bash
opencode run --format default [message..]
```
- `run`: Non-interactive mode
- `--format default`: Human-readable output
- Prompt is passed as command-line argument (not stdin)

## Agent Availability Detection

```mermaid
flowchart TD
    Agent[Agent Name] --> CheckPath[Check PATH]

    CheckPath --> Found{Command Found?}
    Found -->|Yes| CheckVersion[Check Version]
    Found -->|No| NotAvailable[Not Available]

    CheckVersion --> VersionOk{Version OK?}
    VersionOk -->|Yes| Available[Available]
    VersionOk -->|No| NotAvailable
```

Agent availability is detected by:
1. Checking if the CLI command exists in PATH
2. Optionally checking version compatibility

## Data Flow Diagram

```mermaid
flowchart LR
    subgraph Input
        EnvVar[AGENT_FOREMAN_AGENTS]
        SystemPath[System PATH]
    end

    subgraph Processing
        PriorityParser[Priority Parser]
        Detector[Agent Detector]
        Selector[Agent Selector]
    end

    subgraph Output
        Console[Console Display]
    end

    EnvVar --> PriorityParser
    PriorityParser --> Selector

    SystemPath --> Detector
    Detector --> Selector

    Selector --> Console
```

## Dependencies

### Internal Modules

- `src/agents.ts` - Agent management
  - `printAgentStatus()` - Display agent status
  - `getAgentPriorityString()` - Get priority order string
  - `getAvailableAgents()` - Detect available agents
  - `spawnAgent()` - Spawn agent subprocess

### External Dependencies

- AI CLI tools (optional, at least one required):
  - `claude` - Anthropic Claude CLI
  - `codex` - OpenAI Codex CLI
  - `gemini` - Google Gemini CLI
  - `opencode` - OpenCode CLI

## Files Read

None - this command only checks system PATH.

## Files Written

None - this is a read-only status command.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success (always) |

## Examples

### Check Agent Status

```bash
# Show available agents
agent-foreman agents
```

### Custom Priority

```bash
# Set custom priority order
export AGENT_FOREMAN_AGENTS="gemini,claude,codex"
agent-foreman agents
```

## Console Output Example

### All Agents Available

```
🤖 AI Agent Status

   Priority Order: Claude > Codex > Gemini

   Installed Agents:
   ✓ Claude (v1.2.3)
   ✓ Codex (v0.8.1)
   ✓ Gemini (v2.0.0)

   First Available: Claude
```

### Partial Availability

```
🤖 AI Agent Status

   Priority Order: Claude > Codex > Gemini

   Installed Agents:
   ✗ Claude - not found
   ✓ Codex (v0.8.1)
   ✓ Gemini (v2.0.0)

   First Available: Codex
```

### No Agents Available

```
🤖 AI Agent Status

   Priority Order: Claude > Codex > Gemini

   Installed Agents:
   ✗ Claude - not found
   ✗ Codex - not found
   ✗ Gemini - not found

   ⚠ No AI agents available!
   Install at least one of: claude, codex, gemini, opencode
```

### Custom Priority Order

```
🤖 AI Agent Status

   Priority Order: Gemini > Claude (custom via AGENT_FOREMAN_AGENTS)

   Installed Agents:
   ✓ Claude (v1.2.3)
   ✓ Gemini (v2.0.0)

   First Available: Gemini
```

## Installing AI Agents

### Claude (Anthropic)

```bash
# Install Claude CLI
npm install -g @anthropic-ai/claude-cli

# Configure API key
export ANTHROPIC_API_KEY="your-api-key"
```

### Codex (OpenAI)

```bash
# Install Codex CLI
npm install -g @openai/codex-cli

# Configure API key
export OPENAI_API_KEY="your-api-key"
```

### Gemini (Google)

```bash
# Install Gemini CLI
npm install -g @google/gemini-cli

# Configure API key
export GOOGLE_API_KEY="your-api-key"
```

### OpenCode

```bash
# Install OpenCode CLI
curl -fsSL https://opencode.ai/install | bash
# or via npm
npm install -g opencode-ai

# Configure via opencode auth login
opencode auth login
```

## Use Cases

### Debugging Agent Issues

```bash
# Check which agent is being used
agent-foreman agents

# If wrong agent, set custom priority
export AGENT_FOREMAN_AGENTS="claude"
```

### CI/CD Configuration

```bash
# Ensure specific agent in CI
export AGENT_FOREMAN_AGENTS="codex"
agent-foreman init
```

### Multi-Model Workflows

```bash
# Use different agents for different operations
AGENT_FOREMAN_AGENTS="claude" agent-foreman analyze
AGENT_FOREMAN_AGENTS="gemini" agent-foreman check feature.id
```

## Related Commands

- `agent-foreman analyze` - Uses AI agent for analysis
- `agent-foreman init` - Uses AI agent for project detection
- `agent-foreman check` - Uses AI agent for verification
- `agent-foreman scan` - Uses AI agent for capability detection
