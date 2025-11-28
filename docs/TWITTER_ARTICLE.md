# Why Your AI Coding Agent Keeps Failing at Complex Projects (And How to Fix It)

**Thread / Long-form Article for Twitter Blue**

---

## The Problem Nobody Talks About

You've probably experienced this:

You ask Claude Code or Cursor to build something substantial — a full-stack app, a complex feature. The AI starts great, writes beautiful code for 20 minutes... then falls apart.

**Why?**

Because AI coding agents have a dirty secret: **they have no memory**.

Every session is a fresh start. Every context window has limits. When your project spans multiple sessions, the AI is like a new developer showing up every day with amnesia.

---

## The Three Failure Modes

After extensive testing, Anthropic identified three ways AI agents fail at long-running tasks:

### 1. Doing Too Much at Once

You ask the AI to "clone claude.ai" — it tries to build the entire thing in one session.

Result: Half-finished code, tangled dependencies, and the next session inherits a mess nobody can understand.

### 2. Premature Victory

The AI looks at partial progress, sees some working code, and declares "done!"

Meanwhile, 50% of features don't actually work.

### 3. Superficial Testing

The AI runs `npm test`, sees green checkmarks, and moves on.

But did it actually test like a real user? Click the buttons? Fill the forms? Usually not.

---

## The Solution: External Memory

**agent-foreman** is a Claude Code plugin that gives AI agents what they desperately need: **persistent memory across sessions**.

It's inspired by Anthropic's research paper ["Effective harnesses for long-running agents"](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) — but packaged as a practical tool you can use today.

### How It Works

```
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
│       │                                                     │
│       ▼                                                     │
│  ┌─────────────────────────────────────────┐               │
│  │  All features passing! (100%)           │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

The harness maintains three core files:

| File | Purpose |
|------|---------|
| `ai/feature_list.json` | Feature backlog with acceptance criteria |
| `ai/progress.md` | Session handoff audit log |
| `ai/init.sh` | Project-specific test commands |

Every new AI session starts by reading these files — understanding what's done, what's next, and what the acceptance criteria are.

---

## Why JSON Instead of Markdown?

Here's a fascinating detail from Anthropic's research:

> "Models are more likely to respect and accurately update JSON structures than markdown checklists."

When features are stored as JSON with explicit `status: "failing"` or `status: "passing"` fields, AI agents:
- Don't accidentally delete items
- Update status correctly
- Respect the schema

This sounds trivial, but it's the difference between projects that work and projects that mysteriously lose features between sessions.

---

## The Magic Prompt

Install the plugin and try this prompt:

```
I want you to act as an autonomous developer. Use the agent-foreman
harness to continuously complete all remaining tasks:

1. Check status with `agent-foreman status`
2. Get next task with `agent-foreman step`
3. Implement the feature completely
4. Run tests with `./ai/init.sh check`
5. Mark complete with `agent-foreman complete <id>`
6. Commit the changes
7. Loop back to step 2 until all tasks pass

Do not stop until all features are passing.
```

The AI will methodically work through your entire feature list, one task at a time, leaving clean handoffs for the next session if it hits context limits.

---

## Why This Actually Works

The core insight is simple: **AI agents need the same tooling that makes human engineering teams effective**.

Human engineers don't rely on memory either. We use:
- Git for version history
- Issue trackers for task management
- Documentation for handoffs
- Tests for verification

agent-foreman brings these same patterns to AI:

| Human Practice | AI Equivalent |
|----------------|---------------|
| Scrum board | `feature_list.json` |
| Sprint notes | `progress.md` |
| CI/CD pipeline | `init.sh check` |
| Code review | Acceptance criteria |

---

## Real-World Usage

**For new projects:**
```bash
mkdir my-app && cd my-app
agent-foreman init "Build a task management REST API"
```

The AI generates 10-20 feature tasks automatically based on your goal.

**For existing projects:**
```bash
agent-foreman survey  # Analyzes your codebase
agent-foreman init "Your project goal"  # Creates feature list
```

**Daily workflow:**
```bash
agent-foreman step     # Get next task
# ... implement ...
agent-foreman complete feature_id  # Mark done + suggested commit
```

---

## Who Should Use This?

- **Solo developers** using AI as a coding partner for large projects
- **Teams** who want predictable AI-assisted feature delivery
- **Anyone** who's frustrated by AI "forgetting" work between sessions

---

## Installation

```bash
# Claude Code plugin
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman

# Or CLI
npm install -g agent-foreman
```

---

## The Bottom Line

AI coding agents are powerful but forgetful.

**agent-foreman** is the external brain they need — a structured harness that maintains context, enforces discipline, and ensures every session picks up exactly where the last one left off.

Stop fighting amnesia. Give your AI a memory.

---

**Links:**
- GitHub: https://github.com/mylukin/agent-foreman
- NPM: https://www.npmjs.com/package/agent-foreman

*Inspired by Anthropic's research on long-running AI agents.*

---

# 中文版本

## 为什么你的 AI 编程助手总是搞砸复杂项目（以及如何解决）

---

### 没人说破的问题

你可能遇到过这种情况：

你让 Claude Code 或 Cursor 构建一个复杂功能，AI 开始得很好，写了 20 分钟漂亮的代码...然后崩了。

**为什么？**

因为 AI 编程助手有个致命弱点：**它们没有记忆**。

每个会话都是全新开始。每个上下文窗口都有限制。当你的项目跨越多个会话时，AI 就像每天都带着失忆症上班的新员工。

---

### 三种失败模式

Anthropic 研究发现 AI 在长任务中有三种典型失败：

1. **一口气干太多** - 试图在一个会话里完成所有事情，结果代码乱成一锅粥
2. **过早宣布胜利** - 看看环境觉得差不多了就收工，功能缺一大堆
3. **测试敷衍** - 跑几个单元测试就完事，不像真实用户那样端到端验证

---

### 解决方案：外部记忆

**agent-foreman** 是一个 Claude Code 插件，给 AI 提供它们急需的东西：**跨会话的持久记忆**。

它基于 Anthropic 的研究论文，但打包成了你今天就能用的实用工具。

核心原理很简单：**AI 需要和人类工程团队一样的协作工具**。

人类工程师也不靠记忆工作。我们用：
- Git 记录历史
- Issue 跟踪任务
- 文档交接工作
- 测试验证功能

agent-foreman 把这些模式带给了 AI：

| 人类实践 | AI 等效 |
|---------|--------|
| 看板 | `feature_list.json` |
| 会议纪要 | `progress.md` |
| CI/CD | `init.sh check` |
| Code Review | 验收标准 |

---

### 魔法提示词

安装插件后试试这个提示词：

```
我希望你作为一个自主开发者。使用 agent-foreman 框架持续完成所有任务：

1. 用 `agent-foreman status` 检查状态
2. 用 `agent-foreman step` 获取下一个任务
3. 完整实现功能
4. 用 `./ai/init.sh check` 运行测试
5. 用 `agent-foreman complete <id>` 标记完成
6. 提交更改
7. 循环直到所有任务通过

不要停止直到所有功能都通过。
```

AI 会有条不紊地完成你的整个功能清单，一次一个任务，如果遇到上下文限制也会留下干净的交接。

---

### 为什么用 JSON 而不是 Markdown？

Anthropic 研究发现一个有趣细节：

> "相比 Markdown，模型在处理 JSON 时更不容易随意篡改或覆盖文件。"

当功能用 JSON 存储，带有明确的 `status: "failing"` 或 `status: "passing"` 字段时，AI 更不容易：
- 意外删除条目
- 错误更新状态
- 破坏数据结构

---

### 安装使用

```bash
# Claude Code 插件
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman

# 或 CLI
npm install -g agent-foreman
```

---

### 总结

AI 编程助手很强大但健忘。

**agent-foreman** 是它们需要的外部大脑 — 一个结构化框架，维护上下文、强制纪律、确保每个会话都能精确接续上一个会话的工作。

别再和失忆症作斗争了。给你的 AI 一个记忆。

---

**链接：**
- GitHub: https://github.com/mylukin/agent-foreman
- NPM: https://www.npmjs.com/package/agent-foreman

*灵感来自 Anthropic 关于长时间运行 AI 代理的研究。*
