# install Command

Install the agent-foreman plugin for Claude Code or OpenCode.

> 安装 agent-foreman Claude Code 或 OpenCode 插件。

## Command Syntax

```bash
agent-foreman install [options]
```

## Description

The `install` command installs and enables the agent-foreman plugin. By default, it installs for Claude Code. Use `--opencode` to install for OpenCode instead.

> `install` 命令安装并启用 agent-foreman 插件。默认安装到 Claude Code，使用 `--opencode` 安装到 OpenCode。

## Options

| Option | Alias | Default | Description |
|--------|-------|---------|-------------|
| `--force` | `-f` | `false` | Force reinstall even if already installed |
| `--opencode` | | `false` | Install OpenCode plugin to current project (.opencode/) |

## Examples

### Install for Claude Code (default)

```bash
agent-foreman install
```

### Install for OpenCode

```bash
# From your OpenCode project directory:
agent-foreman install --opencode

# Then install plugin dependencies:
cd .opencode && npm install
```

### Force Reinstall

```bash
agent-foreman install --force
agent-foreman install --opencode --force
```

## Execution Flow

```mermaid
flowchart TD
    A[Start: runInstall] --> B[getPluginInstallInfo]
    B --> C[Display Current Status]

    C --> D{Embedded Plugins Available?}
    D -->|No| E[Display: No embedded plugins]
    E --> F[Show Build Instructions]
    F --> G[End: Early Exit]

    D -->|Yes| H{Already Installed?}
    H -->|Yes| I{--force flag?}
    I -->|No| J[Display: Already installed]
    J --> G
    I -->|Yes| K[Continue Install]
    H -->|No| K

    K --> L[fullInstall]
    L --> M[Install Marketplace Files]
    M --> N[Register in known_marketplaces.json]
    N --> O[Install Plugin to Cache]
    O --> P[Enable in settings.json]

    P --> Q{Install Success?}
    Q -->|No| R[Display Error]
    R --> S[Exit with Error]
    Q -->|Yes| T[Display Success]
    T --> U[List Completed Steps]
    U --> V[Display: Restart Claude Code]
    V --> W[End]
```

## Data Flow Diagram

```mermaid
graph TB
    subgraph Input
        A1[CLI Options]
        A2[Embedded Plugin Data]
    end

    subgraph StatusCheck["Status Check"]
        B1[getPluginInstallInfo]
        B2[Check Marketplace Registration]
        B3[Check Plugin Installation]
        B4[Check Plugin Enabled]
    end

    subgraph Installation["Installation Process"]
        C1[fullInstall]
        C2[Install Marketplace Files]
        C3[Register Marketplace]
        C4[Install Plugin Files]
        C5[Enable Plugin]
    end

    subgraph ClaudeCode["Claude Code Files"]
        D1[~/.claude/known_marketplaces.json]
        D2[~/.claude/cache/plugins/]
        D3[~/.claude/installed_plugins_v2.json]
        D4[~/.claude/settings.json]
    end

    subgraph Output
        E1[Success Message]
        E2[Restart Reminder]
    end

    A1 --> B1
    A2 --> C1

    B1 --> B2
    B1 --> B3
    B1 --> B4

    B2 --> C1
    B3 --> C1
    B4 --> C1

    C1 --> C2
    C2 --> C3
    C3 --> C4
    C4 --> C5

    C2 --> D1
    C3 --> D1
    C4 --> D2
    C4 --> D3
    C5 --> D4

    C5 --> E1
    E1 --> E2
```

## Installation Steps

### 1. Marketplace Files Installation

Copies plugin marketplace files to Claude Code's known marketplace location.

```
~/.claude/marketplaces/agent-foreman/
├── marketplace.json
├── plugin.json
└── README.md
```

### 2. Marketplace Registration

Adds entry to `~/.claude/known_marketplaces.json`:

```json
{
  "marketplaces": [
    {
      "name": "agent-foreman",
      "url": "file:///path/to/marketplace"
    }
  ]
}
```

### 3. Plugin Installation

Copies plugin files to cache:

```
~/.claude/cache/plugins/agent-foreman@agent-foreman-plugins/
├── plugin.json
├── commands/
├── skills/
└── ...
```

Updates `~/.claude/installed_plugins_v2.json`:

```json
{
  "plugins": [
    {
      "id": "agent-foreman:agent-foreman",
      "version": "0.1.91",
      "enabled": true
    }
  ]
}
```

### 4. Plugin Enablement

Updates `~/.claude/settings.json`:

```json
{
  "enabledPlugins": [
    "agent-foreman:agent-foreman"
  ]
}
```

## Key Functions

### `runInstall(force)`

**Location**: `src/commands/install.ts:18`

Main entry point for the install command.

### `getPluginInstallInfo()`

**Location**: `src/plugin-installer.ts`

Gets current installation status.

**Returns**:
```typescript
interface PluginInstallInfo {
  bundledVersion: string;
  installedVersion: string | null;
  isMarketplaceRegistered: boolean;
  isPluginInstalled: boolean;
  isPluginEnabled: boolean;
}
```

### `hasEmbeddedPlugins()`

**Location**: `src/plugin-installer.ts`

Checks if embedded plugins are available.

**Returns**: `boolean`

### `fullInstall()`

**Location**: `src/plugin-installer.ts`

Performs complete installation process.

## Output Example

```
Agent Foreman Plugin Installer
────────────────────────────────────────

Plugin Status:
  Version:     0.1.91
  Marketplace: ✓ registered
  Plugin:      ✓ installed (0.1.91)
  Enabled:     ✓ yes

✓ Plugin is already installed and enabled
  Use --force to reinstall

To manage the plugin:
  /plugin                    # Browse plugins
  agent-foreman uninstall    # Remove plugin
```

### Fresh Installation

```
Agent Foreman Plugin Installer
────────────────────────────────────────

Plugin Status:
  Version:     0.1.91
  Marketplace: not registered
  Plugin:      not installed
  Enabled:     no

Installing plugin...

✓ Plugin installed successfully!

Steps completed:
  1. Installed marketplace files
  2. Registered in known_marketplaces.json
  3. Installed plugin to cache
  4. Enabled in settings.json

⚡ Restart Claude Code to use the plugin
```

### No Embedded Plugins

```
Agent Foreman Plugin Installer
────────────────────────────────────────

Plugin Status:
  Version:     0.1.91
  Marketplace: not registered
  Plugin:      not installed
  Enabled:     no

⚠ No embedded plugins available
  Plugin install requires embedded plugins from a build process.
  For development, plugins are loaded directly from source.

To build with embedded plugins:
  npm run build          # Build npm package with plugins
  npm run build:bin      # Build standalone binary with plugins

Or install from GitHub:
  /plugin marketplace add mylukin/agent-foreman
  /plugin install agent-foreman:agent-foreman
```

## Examples

### Basic Installation

```bash
# Install the plugin
agent-foreman install
```

### Force Reinstall

```bash
# Reinstall even if already installed
agent-foreman install --force
```

## Plugin Features

After installation, the plugin provides:

### Slash Commands

- `/agent-foreman:init` - Initialize harness
- `/agent-foreman:next` - Get next task
- `/agent-foreman:status` - View status
- `/agent-foreman:run` - Run tasks
- `/agent-foreman:analyze` - Analyze project

### Skills

- `agent-foreman:init-harness` - Initialize harness skill
- `agent-foreman:project-analyze` - Project analysis skill
- `agent-foreman:feature-next` - Next task skill
- `agent-foreman:feature-run` - Run tasks skill

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| "No embedded plugins" | Dev mode or incomplete build | Run `npm run build` |
| "Failed to install" | Permission or file issue | Check Claude Code directory permissions |

## Related Commands

- [`uninstall`](./uninstall.md) - Remove the plugin
