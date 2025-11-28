# agent-foreman

> Long Task Harness for AI agents - feature-driven development with external memory
>
> AI 代理的长任务管理框架 - 基于功能驱动的开发，提供外部记忆

[![npm version](https://img.shields.io/npm/v/agent-foreman.svg)](https://www.npmjs.com/package/agent-foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## Problem

AI coding agents face three common failure modes when working on long-running tasks:

1. **Doing too much at once** - Trying to complete everything in one session, resulting in messy, incomplete code
2. **Premature completion** - Declaring victory before all features actually work
3. **Superficial testing** - Not thoroughly validating implementations

## Solution

**agent-foreman** provides a structured harness that enables AI agents to:

- Maintain **external memory** via structured files
- Work on **one feature at a time** with clear acceptance criteria
- **Hand off cleanly** between sessions via progress logs
- **Track impact** of changes on other features

## Installation

```bash
# Global installation
npm install -g agent-foreman

# Or use with npx
npx agent-foreman --help
```

## Claude Code Plugin

agent-foreman is available as a Claude Code plugin:

```bash
# Install plugin
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman
```

---

## Using with Claude Code

> 在 Claude Code 中使用 agent-foreman 的完整指南

### Initializing Projects | 初始化项目

#### Empty Project | 空项目

For a brand new project with no existing code:

> 对于没有现有代码的全新项目：

```bash
# Create project directory
mkdir my-project && cd my-project

# Initialize with your project goal
agent-foreman init "Build a REST API for task management"
```

**Prompt for Claude Code:**

```text
Initialize a new agent-foreman harness for this empty project.
Goal: Build a REST API for task management

为这个空项目初始化 agent-foreman 框架。
目标：构建一个任务管理的 REST API
```

#### Existing Project | 已有代码的项目

For projects with existing code:

> 对于已有代码的项目：

```bash
# Step 1: Survey the project (AI analyzes your codebase)
agent-foreman survey

# Step 2: Initialize with merge mode (preserves existing features)
agent-foreman init "Your project goal" --mode merge
```

**Prompt for Claude Code:**

```text
Survey this existing project and initialize the agent-foreman harness.
Use merge mode to preserve any existing features.

调查这个现有项目并初始化 agent-foreman 框架。
使用 merge 模式保留现有功能。
```

---

### Task Loop Prompts | 任务循环提示词

#### Single Task Completion | 完成单个任务

```text
Use foreman to get the next task, implement it, and mark it complete.

使用 foreman 获取下一个任务，实现它，并标记为完成。
```

#### Continuous Task Loop | 持续任务循环

**The Magic Prompt - Auto-complete all tasks:**

```text
Use foreman to check the project status, then continuously work through
all tasks one by one until everything is complete. For each task:
1. Run `agent-foreman step` to get the next task
2. Implement the feature according to acceptance criteria
3. Run tests to verify
4. Run `agent-foreman complete <feature_id>` to mark done
5. Repeat until all tasks are passing

使用 foreman 检查项目状态，然后持续逐个完成所有任务直到全部完成。
对于每个任务：
1. 运行 `agent-foreman step` 获取下一个任务
2. 根据验收标准实现功能
3. 运行测试验证
4. 运行 `agent-foreman complete <feature_id>` 标记完成
5. 重复直到所有任务都通过
```

#### Quick Status Check | 快速状态检查

```text
Use foreman to check the current project status.

使用 foreman 检查当前项目状态。
```

#### Analyze and Plan | 分析并规划

```text
Use foreman to analyze this project and give me a comprehensive status report.

使用 foreman 分析这个项目并给我一份综合状态报告。
```

---

### Managing Tasks | 管理任务

#### Adding New Tasks | 添加新任务

Edit `ai/feature_list.json` directly or use Claude Code:

```text
Add a new feature to the task list:
- ID: auth.oauth
- Description: Implement OAuth2 authentication with Google
- Module: auth
- Priority: 5
- Acceptance criteria: User can login with Google account

添加一个新功能到任务列表：
- ID: auth.oauth
- 描述：实现 Google OAuth2 认证
- 模块：auth
- 优先级：5
- 验收标准：用户可以使用 Google 账户登录
```

**Feature JSON Structure:**

```json
{
  "id": "auth.oauth",
  "description": "Implement OAuth2 authentication with Google",
  "module": "auth",
  "priority": 5,
  "status": "failing",
  "acceptance": [
    "User can click 'Login with Google' button",
    "System redirects to Google OAuth flow",
    "User is authenticated and redirected back"
  ],
  "dependsOn": ["auth.login"],
  "tags": ["oauth", "google"],
  "version": 1,
  "origin": "manual",
  "notes": ""
}
```

#### Changing Task Goals | 改变任务目标

```text
Update the project goal to: "Build a full-stack task management app with React frontend"
Also update relevant features to align with the new goal.

更新项目目标为："构建一个带 React 前端的全栈任务管理应用"
同时更新相关功能以符合新目标。
```

#### Modifying Existing Tasks | 修改现有任务

```text
Update feature 'api.users.create':
- Change description to: "Create user with email verification"
- Add acceptance criteria: "Send verification email after registration"
- Set priority to 3

更新功能 'api.users.create'：
- 修改描述为："创建用户并发送邮件验证"
- 添加验收标准："注册后发送验证邮件"
- 设置优先级为 3
```

#### Marking Tasks as Blocked | 标记任务为阻塞

```text
Mark feature 'payment.stripe' as blocked with note: "Waiting for Stripe API keys"

将功能 'payment.stripe' 标记为阻塞，备注："等待 Stripe API 密钥"
```

---

### Auto-Complete All Tasks | 自动完成所有任务

#### Method 1: Continuous Loop Prompt

The most effective prompt for fully automated task completion:

```text
I want you to act as an autonomous developer. Use the agent-foreman
harness to continuously complete all remaining tasks:

1. Check status with `agent-foreman status`
2. Get next task with `agent-foreman step`
3. Implement the feature completely
4. Run tests with `./ai/init.sh check`
5. Mark complete with `agent-foreman complete <id>`
6. Commit the changes
7. Loop back to step 2 until all tasks pass

Do not stop until all features are passing. Ask me only if you
encounter a blocker that requires my input.

我希望你作为一个自主开发者。使用 agent-foreman 框架持续完成所有剩余任务：

1. 用 `agent-foreman status` 检查状态
2. 用 `agent-foreman step` 获取下一个任务
3. 完整实现功能
4. 用 `./ai/init.sh check` 运行测试
5. 用 `agent-foreman complete <id>` 标记完成
6. 提交更改
7. 循环回到步骤 2 直到所有任务通过

不要停止直到所有功能都通过。只有遇到需要我输入的阻塞问题时才问我。
```

#### Method 2: Using the Foreman Agent

```text
Use the foreman agent to automatically complete all pending tasks
in this project. Work through them one by one until 100% complete.

使用 foreman 代理自动完成此项目中所有待处理的任务。
逐个完成直到 100% 完成。
```

#### Method 3: Batch Completion (for implemented features)

If features are already implemented but not marked:

```text
All features in this project are already implemented and tested.
Use foreman to mark each one as complete, going through them
one by one until all are passing.

这个项目中的所有功能都已经实现和测试。
使用 foreman 逐个将它们标记为完成，直到全部通过。
```

---

### Workflow Summary | 工作流程总结

```text
┌─────────────────────────────────────────────────────────────┐
│                    AGENT-FOREMAN WORKFLOW                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  status  │───▶│   step   │───▶│implement │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                               │                     │
│       │                               ▼                     │
│       │                         ┌──────────┐               │
│       │                         │   test   │               │
│       │                         └──────────┘               │
│       │                               │                     │
│       │                               ▼                     │
│       │    ┌──────────┐        ┌──────────┐               │
│       │◀───│   next   │◀───────│ complete │               │
│       │    └──────────┘        └──────────┘               │
│       │                               │                     │
│       ▼                               ▼                     │
│  ┌─────────────────────────────────────────┐               │
│  │  🎉 All features passing! (100%)        │               │
│  │  📊 PROJECT_SURVEY.md auto-updated      │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## Commands Reference | 命令参考

| Command | Description | 描述 |
|---------|-------------|------|
| `survey [output]` | Generate project survey report | 生成项目调查报告 |
| `init <goal>` | Initialize or upgrade the harness | 初始化或升级框架 |
| `step [feature_id]` | Show next feature to work on | 显示下一个要处理的功能 |
| `status` | Show current project status | 显示当前项目状态 |
| `impact <feature_id>` | Analyze impact of changes | 分析更改的影响 |
| `complete <feature_id>` | Mark a feature as complete | 将功能标记为完成 |

### Init Modes | 初始化模式

| Mode | Description | 描述 |
|------|-------------|------|
| `--mode create` | Create new (default) | 创建新的（默认）|
| `--mode merge` | Merge with existing | 与现有合并 |
| `--mode overwrite` | Replace existing | 替换现有 |

---

## Core Files | 核心文件

| File | Purpose | 用途 |
|------|---------|------|
| `ai/feature_list.json` | Feature backlog with status | 带状态的功能积压 |
| `ai/progress.log` | Session handoff audit log | 会话交接审计日志 |
| `ai/init.sh` | Environment bootstrap script | 环境启动脚本 |
| `docs/PROJECT_SURVEY.md` | AI-generated project survey | AI 生成的项目调查 |

---

## Feature Status Values | 功能状态值

| Status | Meaning | 含义 |
|--------|---------|------|
| `failing` | Not yet implemented | 尚未实现 |
| `passing` | Acceptance criteria met | 验收标准已满足 |
| `blocked` | External dependency blocking | 外部依赖阻塞 |
| `needs_review` | May be affected by changes | 可能受更改影响 |
| `deprecated` | No longer needed | 不再需要 |

---

## Supported Tech Stacks | 支持的技术栈

| Language | Frameworks |
|----------|------------|
| Node.js/TypeScript | Express, Vue, React, Astro, Next.js, Nuxt |
| Go | Echo, Gin, Fiber |
| Python | FastAPI, Flask, Django |

---

## Best Practices | 最佳实践

1. **One feature at a time** - Complete before switching | 一次一个功能 - 完成后再切换
2. **Update status promptly** - Mark passing when criteria met | 及时更新状态 - 满足标准时标记通过
3. **Review impact** - Run impact analysis after changes | 审查影响 - 更改后运行影响分析
4. **Clean commits** - One feature = one atomic commit | 干净提交 - 一个功能 = 一个原子提交
5. **Read first** - Always check feature list and progress log | 先阅读 - 始终检查功能列表和进度日志

---

## Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Build
npm run build

# Run tests
npm test
```

## License

MIT

## Author

Lukin ([@mylukin](https://github.com/mylukin))

---

Inspired by Anthropic's blog post: [Effective harnesses for long-running agents](https://www.anthropic.com)
