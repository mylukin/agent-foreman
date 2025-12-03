# Agent Foreman Usage Guide

This guide explains how to use agent-foreman to manage long-running AI agent tasks with external memory.

> 本指南介绍如何使用 agent-foreman 管理具有外部记忆的长时间运行 AI agent 任务。

---

## Quick Start

```bash
# Install globally
npm install -g agent-foreman

# Or run directly with npx
npx agent-foreman <command>
```

---

## Scenario 1: New Project (从零开始新项目)

When starting a completely new project from scratch.

> 从零开始创建全新项目时使用。

### Step 1: Create Project Directory

```bash
mkdir my-new-project
cd my-new-project

# Initialize git (required for commit tracking)
git init
```

### Step 2: Initialize the Harness

For a new project, start directly with `init` and provide your goal:

> 对于新项目，直接使用 `init` 并提供你的目标：

```bash
agent-foreman init "Build a REST API for user management"
```

The AI will automatically detect this is an empty project and generate 10-20 initial features based on your goal description.

> AI 会自动检测到这是一个空项目，并根据你的目标描述生成 10-20 个初始功能。

**What happens:**

1. AI generates feature list from your goal
2. Creates harness files (`ai/`, `CLAUDE.md`)
3. **Automatically creates first git commit**

> **执行流程：**
>
> 1. AI 根据你的目标生成功能清单
> 2. 创建 harness 文件 (`ai/`, `CLAUDE.md`)
> 3. **自动创建第一次 git 提交**

**Output:**

```
✓ Feature list saved with 15 features
✓ Generated ai/init.sh
✓ Generated CLAUDE.md
✓ Updated ai/progress.log
✓ Created initial git commit

🎉 Harness initialized successfully!
```

### Step 3: Start Working on Features

```bash
agent-foreman step
```

This shows external memory sync:

1. Current directory (`pwd`)
2. Recent git commits
3. Progress log entries
4. Feature status summary
5. Next task to work on

> 这会显示外部记忆同步：
> 1. 当前目录
> 2. 最近的 git 提交
> 3. 进度日志条目
> 4. 功能状态摘要
> 5. 下一个要做的任务

### Step 4: Complete Features

After implementing a feature:

```bash
agent-foreman complete <feature_id>

# Example
agent-foreman complete api.users.create
```

**Output (auto-commits by default):**

```
✓ Marked 'api.users.create' as passing
✓ Changes committed: feat(api): Create user endpoint

  Next up: api.users.list
```

> 输出（默认自动提交）

**Note:** Use `--no-commit` flag to skip auto-commit if you want to commit manually.

> **注意：** 使用 `--no-commit` 标志跳过自动提交，如果你想手动提交。

### Step 5: Continue to Next Task

The `complete` command auto-commits, so just continue:

> `complete` 命令会自动提交，直接继续即可：

```bash
agent-foreman step      # See next task
```

### Step 6: (Optional) Generate Survey After Development

Once you have substantial code written, generate documentation:

> 当你写了大量代码后，生成文档：

```bash
agent-foreman survey
```

**Output:**

- `docs/PROJECT_SURVEY.md` - AI-generated project documentation

---

## Scenario 2: Existing Project (已有项目)

When adding agent-foreman to an existing codebase.

> 在已有代码库上添加 agent-foreman 时使用。

### Step 1: Navigate to Project

```bash
cd /path/to/existing-project
```

### Step 2: Generate Project Survey (Recommended)

AI will analyze your existing codebase:

```bash
agent-foreman survey
```

This scans:
- Directory structure
- Config files (package.json, tsconfig.json, Cargo.toml, etc.)
- Source code files
- Test files

> 这会扫描：
> - 目录结构
> - 配置文件 (package.json, tsconfig.json, Cargo.toml 等)
> - 源代码文件
> - 测试文件

**Review the output:** `docs/PROJECT_SURVEY.md`

### Step 3: Initialize the Harness

```bash
# With explicit goal
agent-foreman init "Add user authentication feature"

# Or auto-detect from existing docs
agent-foreman init
```

**Init automatically chooses the best approach:**

| Condition | Action |
|-----------|--------|
| `PROJECT_SURVEY.md` exists | Uses survey to generate features (fast) |
| Has source code, no survey | Scans codebase + **auto-generates survey** |
| Empty project | Generates features from goal |

> **Init 自动选择最佳方式：**
>
> | 条件 | 操作 |
> |------|------|
> | 有 `PROJECT_SURVEY.md` | 使用 survey 生成功能（快） |
> | 有源代码，无 survey | 扫描代码库 + **自动生成 survey** |
> | 空项目 | 从目标生成功能 |

**Mode options:**

| Mode | Description |
|------|-------------|
| `--mode merge` | (default) Merge new features with existing list |
| `--mode new` | Replace existing feature list entirely |
| `--mode scan` | Only show discovered features, don't save |

Example:

```bash
# Just scan to see what AI discovers
agent-foreman init --mode scan

# Replace everything with fresh scan
agent-foreman init --mode new "Refactor the entire codebase"
```

### Step 4: Review Feature List

Check the generated features:

```bash
agent-foreman status
```

Or directly view the JSON:

```bash
cat ai/feature_list.json
```

### Step 5: Start the Workflow

```bash
# See next task with full context
agent-foreman step

# Run tests before showing task
agent-foreman step --check

# Work on specific feature
agent-foreman step auth.login
```

---

## Command Reference (命令参考)

### `survey [output]`

Generate AI-powered project documentation.

```bash
agent-foreman survey                    # Default: docs/PROJECT_SURVEY.md
agent-foreman survey docs/ANALYSIS.md   # Custom output path
agent-foreman survey -v                 # Verbose mode
```

### `analyze` + `run`

Use AI to turn a free-form requirement spec into ordered implementation steps, then execute them one by one:

> 将自由格式的需求文档拆分为有序实现步骤，并依次自动执行：

```bash
# 1. Analyze a spec file and generate step JSONs
agent-foreman analyze docs/需求说明.md
# → Creates a directory like: 「用户登录需求实现步骤」

# 2. Run the generated steps sequentially
agent-foreman run "用户登录需求实现步骤"
```

`run` will:
- Discover all `NNN-*.json` step files under the directory (other `.json` files are ignored with a warning)
- For each step, start a new AI subprocess to apply the described change
- After a successful implementation attempt, optionally run step-specific tests defined by the `unit_test.command` field and then perform AI-driven verification based on the `verification` list
- Automatically retry a failing step up to **5 attempts** (implementation + tests + verification) before giving up
- Update each step's `status` (`🔴 待完成` → `🟡 进行中` → `🟢 已完成` on success, or back to `🔴 待完成` when tests/verification fail)
- Maintain a single Markdown progress report `run-progress.md` in the same steps directory, rewriting it after errors and successful validations so it always reflects the latest attempt
- With `--full-verify`, also re-run tests and verification for steps already marked as completed (`🟢`), reopening them for implementation when regressions are detected
- With `--verify-only`, run only unit tests (when `unit_test` is defined) and AI-based verification for each step, without performing any new implementation work
- With `--verify-unittest-only`, run only the `unit_test.command` for each step (if present) without AI verification or implementation; steps without `unit_test` are treated as verification failures
- With `--verify-generate-unittest`, only check whether each step has `unit_test` configured and, if missing, call AI to generate `unit_test` information and write it back to the step JSON without changing business logic
 - With `--no-test`, implement each step without generating or running tests and without AI-based verification (implementation-only mode)

> `run` 会：
> - 自动发现目录中的 `NNN-*.json` 步骤文件并按顺序执行（其他 JSON 文件会被忽略并在终端给出告警）；
> - 为每个步骤单独启动一次命令行 AI 子进程，根据 description 完成实现；
> - 在实现成功后，优先根据 `unit_test.command` 运行与该步骤相关的测试，再按 `verification` 列表调用 AI 做验证；
> - 对失败的步骤自动重试，最多尝试 **5 轮**「实现 + 测试 + 验证」，若仍无法通过则终止本次 run；
> - 根据结果维护步骤 JSON 中的 `status` 字段（`🔴 待完成` → `🟡 进行中` → `🟢 已完成`，或在测试/验证失败后退回 `🔴 待完成`）；
> - 在步骤目录下维护一份固定文件名为 `run-progress.md` 的执行报告，在每次失败和验证成功后重写，使其始终反映最近一轮尝试的状态；
> - 当使用 `--full-verify` 时，会对已标记为 `🟢 已完成` 的步骤重新运行 `unit_test` 和 verification，若发现问题则重新打开并进入多轮自动修复流程；
> - 当使用 `--verify-only` 时，只运行单元测试（若步骤定义了 `unit_test`）和基于 `verification` 的 AI 验证，不做任何实现改动；
> - 当使用 `--verify-unittest-only` 时，只运行每个步骤的 `unit_test.command`，不调用 AI，也不做实现改动；对于缺少 `unit_test` 的步骤会直接视为验证失败；
> - 当使用 `--verify-generate-unittest` 时，只检查每个步骤是否配置了 `unit_test`，对缺少配置的步骤调用 AI 生成 `unit_test` 信息写回 JSON，不更改业务实现代码。
> - 当使用 `--no-test` 时，只根据步骤描述完成实现，不生成或运行任何测试，也不做 AI 验证。

### `init [goal]`

Initialize or update the long-task harness.

```bash
agent-foreman init                      # Auto-detect goal
agent-foreman init "My project goal"    # Explicit goal
agent-foreman init --mode new           # Fresh start
agent-foreman init --mode scan          # Preview only
agent-foreman init -v                   # Verbose mode
```

**Auto git commit:** Creates `chore: initialize agent-foreman harness` commit.

> **自动 git 提交：** 创建 `chore: initialize agent-foreman harness` 提交。

### `step [feature_id]`

Show external memory and next task.

```bash
agent-foreman step                      # Next highest priority
agent-foreman step cli.init             # Specific feature
agent-foreman step --check              # Run tests first
agent-foreman step -d                   # Dry run
```

### `complete <feature_id>`

Mark a feature as complete with AI verification.

```bash
agent-foreman complete cli.survey
agent-foreman complete cli.survey --notes "Added error handling"
```

**Test mode options:**

| Flag | Description |
|------|-------------|
| `--quick` / `-q` | Run only tests related to the changed feature (default mode) |
| `--full` | Run the complete test suite (for final verification) |
| `--test-pattern <pattern>` | Use explicit test pattern (e.g., `tests/auth/**`) |
| `--skip-e2e` | Skip E2E tests (useful for faster iterations) |
| `--skip-verify` | Skip AI verification (not recommended) |
| `--no-commit` | Skip auto-commit after completion |

> **测试模式选项：**
>
> | 标志 | 描述 |
> |------|------|
> | `--quick` / `-q` | 仅运行与更改功能相关的测试（默认模式） |
> | `--full` | 运行完整测试套件（用于最终验证） |
> | `--test-pattern <pattern>` | 使用显式测试模式（如 `tests/auth/**`） |
> | `--skip-e2e` | 跳过 E2E 测试（加快迭代速度） |
> | `--skip-verify` | 跳过 AI 验证（不推荐） |
> | `--no-commit` | 跳过完成后的自动提交 |

**Examples:**

```bash
# Quick mode - runs only related tests (default, faster for large test suites)
agent-foreman complete auth.login

# Full mode - runs all tests (for final verification)
agent-foreman complete auth.login --full

# Explicit pattern - specify exact test files to run
agent-foreman complete auth.login --test-pattern "tests/auth/*.test.ts"
```

**Auto-commits changes** with conventional commit message. Use `--no-commit` to disable.

> **自动提交更改**，使用规范的提交消息。使用 `--no-commit` 禁用。

### `status`

Show project status and progress.

```bash
agent-foreman status
```

### `check <feature_id>` (optional)

Preview verification without completing. Useful for debugging - normally you can just use `complete` which auto-runs verification.

> 预览验证结果，不执行完成操作。用于调试 - 通常直接使用 `complete` 即可，它会自动运行验证。

```bash
agent-foreman check cli.survey
agent-foreman check cli.survey --quick
```

### `impact <feature_id>`

Analyze dependencies of a feature.

```bash
agent-foreman impact auth.login
```

### `agents`

Show available AI agents.

```bash
agent-foreman agents
```

---

## Workflow Diagram (工作流程图)

```text
┌─────────────────────────────────────────────────────────────┐
│                    NEW PROJECT                               │
├─────────────────────────────────────────────────────────────┤
│  mkdir project && cd project                                │
│  git init                                                    │
│           ↓                                                  │
│  agent-foreman init "goal" →  ai/feature_list.json          │
│                               ai/progress.log                │
│                               ai/init.sh                     │
│                               CLAUDE.md                      │
│                               + git commit (auto)            │
│           ↓                                                  │
│  (after coding)                                              │
│  agent-foreman survey      →  docs/PROJECT_SURVEY.md        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  EXISTING PROJECT                            │
├─────────────────────────────────────────────────────────────┤
│  cd existing-project                                         │
│           ↓                                                  │
│  agent-foreman survey     →  Analyzes existing code         │
│                              docs/PROJECT_SURVEY.md          │
│           ↓                                                  │
│  agent-foreman init       →  Reads survey + generates       │
│                              ai/feature_list.json            │
│                              + git commit (suggested)        │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                   DEVELOPMENT LOOP                           │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│    ┌──────────────────┐                                     │
│    │ agent-foreman    │                                     │
│    │     step         │  ← External memory sync             │
│    └────────┬─────────┘    - pwd                            │
│             │              - git log                         │
│             │              - progress.log                    │
│             ↓              - feature status                  │
│    ┌──────────────────┐                                     │
│    │   Implement      │                                     │
│    │   Feature        │  ← Human or AI agent                │
│    └────────┬─────────┘                                     │
│             │                                                │
│             ↓                                                │
│    ┌──────────────────┐                                     │
│    │ agent-foreman    │                                     │
│    │   complete <id>  │  ← Verify + update status + commit  │
│    └────────┬─────────┘                                     │
│             │                                                │
│             └──────────→ Loop back to step                  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## Init Detection Flow (初始化检测流程)

```text
agent-foreman init "goal"
        │
        ▼
┌───────────────────┐
│ PROJECT_SURVEY.md │
│     exists?       │
└─────────┬─────────┘
          │
    ┌─────┴─────┐
    │           │
   YES          NO
    │           │
    ▼           ▼
┌─────────┐  ┌───────────────┐
│ Use     │  │ Has source    │
│ survey  │  │ code files?   │
│ (fast)  │  └───────┬───────┘
└─────────┘          │
              ┌──────┴──────┐
              │             │
             YES            NO
              │             │
              ▼             ▼
        ┌─────────────┐  ┌─────────────┐
        │ AI scan     │  │ Generate    │
        │ + auto-save │  │ from goal   │
        │ survey      │  │ (10-20 feat)│
        └─────────────┘  └─────────────┘
```

---

## File Structure (文件结构)

After initialization, your project will have:

```
your-project/
├── ai/
│   ├── feature_list.json   # Feature backlog (JSON for AI)
│   ├── progress.log        # Immutable audit log
│   └── init.sh             # Bootstrap script
├── docs/
│   └── PROJECT_SURVEY.md   # AI-generated documentation (optional)
├── CLAUDE.md               # Instructions for AI agents
└── ... (your project files)
```

> 初始化后，你的项目结构：
>
> ```
> your-project/
> ├── ai/
> │   ├── feature_list.json   # 功能清单 (JSON 格式供 AI 使用)
> │   ├── progress.log        # 不可变审计日志
> │   └── init.sh             # 启动脚本
> ├── docs/
> │   └── PROJECT_SURVEY.md   # AI 生成的文档 (可选)
> ├── CLAUDE.md               # AI agent 指令
> └── ... (你的项目文件)
> ```

---

## Best Practices (最佳实践)

### 1. Choose the Right Starting Command

**New project:** Start with `init` and a clear goal description.

> **新项目：** 用 `init` 和清晰的目标描述开始。

```bash
agent-foreman init "Build a user authentication system"
```

**Existing project:** Start with `survey` to analyze existing code, then `init`.

> **已有项目：** 先用 `survey` 分析现有代码，再用 `init`。

```bash
agent-foreman survey   # ~45s AI scan of existing code
agent-foreman init     # Fast, reuses survey results
```

### 2. Automatic Commits

The `complete` command auto-commits after successful verification:

> `complete` 命令在验证成功后自动提交：

```bash
agent-foreman complete api.users.create
# Output: ✓ Changes committed: feat(api): Create user endpoint
```

This keeps clean git history for the next agent session. Use `--no-commit` if you need manual control.

> 这样可以保持干净的 git 历史，方便下一个 agent 会话。如需手动控制，使用 `--no-commit`。

### 3. Use --check for Verification

Before starting new work, verify the environment is healthy.

> 开始新工作前，验证环境是否健康。

```bash
agent-foreman step --check
```

### 4. Use Quick Mode for Faster Iterations

When working on features with large E2E test suites, use `--quick` mode to run only related tests during development.

> 当处理具有大型 E2E 测试套件的功能时，使用 `--quick` 模式仅运行相关测试以加快开发速度。

```bash
# During development - run only related tests
agent-foreman complete auth.login --quick

# Before release - run full test suite
agent-foreman complete auth.login --full
```

**How selective testing works:**

1. **Explicit pattern** - If `testPattern` is defined in feature_list.json, it uses that pattern
2. **Auto-detect** - Otherwise, it analyzes git changes to find related test files
3. **Module-based** - Falls back to module-based test discovery
4. **Full suite** - If no pattern can be determined, runs all tests

> **选择性测试的工作原理：**
>
> 1. **显式模式** - 如果在 feature_list.json 中定义了 `testPattern`，则使用该模式
> 2. **自动检测** - 否则，分析 git 更改以查找相关测试文件
> 3. **基于模块** - 回退到基于模块的测试发现
> 4. **完整套件** - 如果无法确定模式，则运行所有测试

**Define testPattern in feature_list.json:**

```json
{
  "id": "auth.login",
  "description": "User authentication flow",
  "testPattern": "tests/auth/**/*.test.ts",
  ...
}
```

### 5. Review Feature List Regularly

```bash
agent-foreman status
```

### 6. Update Survey When Structure Changes

If you significantly change the project structure:

> 如果显著改变了项目结构：

```bash
agent-foreman survey        # Re-scan
agent-foreman init --mode merge  # Merge new features
```

---

## Troubleshooting (故障排除)

### "No AI agents available"

Install at least one AI CLI:

```bash
# Claude
npm install -g @anthropic-ai/claude-code

# Gemini
npm install -g @google/gemini-cli

# Codex
npm install -g @openai/codex
```

### "No feature list found"

Run init first:

```bash
agent-foreman init "Your project goal"
```

### "AI analysis failed"

Check that your AI CLI is working:

```bash
agent-foreman agents
```

### Git commit after init

After initialization, run the suggested git commit command:

```bash
git add ai/ CLAUDE.md docs/ && git commit -m "chore: initialize agent-foreman harness"
```

---

Generated by agent-foreman
