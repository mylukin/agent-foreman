# Twitter Article - Copy-Paste Ready

Below are two versions (English & Chinese) formatted for direct copy-paste to Twitter.

---

## English Version (Copy below the line)

---

Why Your AI Coding Agent Keeps Failing at Complex Projects (And How to Fix It)

You've probably experienced this:

You ask Claude Code or Cursor to build something substantial — a full-stack app, a complex feature. The AI starts great, writes beautiful code for 20 minutes... then falls apart.

Why?

Because AI coding agents have a dirty secret: they have no memory.

Every session is a fresh start. Every context window has limits. When your project spans multiple sessions, the AI is like a new developer showing up every day with amnesia.

━━━━━━━━━━━━━━━━━━━━

THE THREE FAILURE MODES

After extensive testing, Anthropic identified three ways AI agents fail at long-running tasks:

① Doing Too Much at Once

You ask the AI to "clone claude.ai" — it tries to build the entire thing in one session. Result: half-finished code, tangled dependencies, and the next session inherits a mess.

② Premature Victory

The AI looks at partial progress, sees some working code, and declares "done!" Meanwhile, 50% of features don't actually work.

③ Superficial Testing

The AI runs `npm test`, sees green checkmarks, and moves on. But did it actually test like a real user? Click the buttons? Fill the forms? Usually not.

━━━━━━━━━━━━━━━━━━━━

THE SOLUTION: EXTERNAL MEMORY

agent-foreman is a Claude Code plugin that gives AI agents what they desperately need: persistent memory across sessions.

It's inspired by Anthropic's research paper "Effective harnesses for long-running agents" — but packaged as a practical tool you can use today.

The harness maintains three core files:

• ai/feature_list.json → Feature backlog with acceptance criteria
• ai/progress.log → Session handoff audit log
• ai/init.sh → Project-specific test commands

Every new AI session starts by reading these files — understanding what's done, what's next, and what the acceptance criteria are.

━━━━━━━━━━━━━━━━━━━━

WHY JSON INSTEAD OF MARKDOWN?

Here's a fascinating detail from Anthropic's research:

"Models are more likely to respect and accurately update JSON structures than markdown checklists."

When features are stored as JSON with explicit status fields, AI agents:
• Don't accidentally delete items
• Update status correctly
• Respect the schema

This sounds trivial, but it's the difference between projects that work and projects that mysteriously lose features between sessions.

━━━━━━━━━━━━━━━━━━━━

WHY THIS ACTUALLY WORKS

The core insight is simple: AI agents need the same tooling that makes human engineering teams effective.

Human engineers don't rely on memory either. We use:
• Git for version history
• Issue trackers for task management
• Documentation for handoffs
• Tests for verification

agent-foreman brings these same patterns to AI:

Human Practice → AI Equivalent
Scrum board → feature_list.json
Sprint notes → progress.log
CI/CD pipeline → init.sh check
Code review → Acceptance criteria

━━━━━━━━━━━━━━━━━━━━

THE MAGIC PROMPT

Install the plugin and try this:

"I want you to act as an autonomous developer. Use the agent-foreman harness to continuously complete all remaining tasks:

1. Check status with agent-foreman status
2. Get next task with agent-foreman next
3. Implement the feature completely
4. Verify and mark complete with agent-foreman done <id> (auto-runs tests)
5. Commit the changes
6. Loop back to step 2 until all tasks pass

Do not stop until all features are passing."

The AI will methodically work through your entire feature list, one task at a time, leaving clean handoffs for the next session.

━━━━━━━━━━━━━━━━━━━━

INSTALLATION

Claude Code plugin:
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman

Or CLI:
npm install -g agent-foreman

━━━━━━━━━━━━━━━━━━━━

THE BOTTOM LINE

AI coding agents are powerful but forgetful.

agent-foreman is the external brain they need — a structured harness that maintains context, enforces discipline, and ensures every session picks up exactly where the last one left off.

Stop fighting amnesia. Give your AI a memory.

GitHub: github.com/mylukin/agent-foreman
NPM: npmjs.com/package/agent-foreman

Inspired by Anthropic's research: [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

---

## 中文版本 (复制下方内容)

---

为什么你的 AI 编程助手总是搞砸复杂项目（以及如何解决）

你可能遇到过这种情况：

你让 Claude Code 或 Cursor 构建一个复杂功能，AI 开始得很好，写了 20 分钟漂亮的代码...然后崩了。

为什么？

因为 AI 编程助手有个致命弱点：它们没有记忆。

每个会话都是全新开始。每个上下文窗口都有限制。当你的项目跨越多个会话时，AI 就像每天都带着失忆症上班的新员工。

━━━━━━━━━━━━━━━━━━━━

三种失败模式

Anthropic 研究发现 AI 在长任务中有三种典型失败：

① 一口气干太多

试图在一个会话里完成所有事情，结果代码乱成一锅粥，下个会话面对半成品只能干瞪眼。

② 过早宣布胜利

看看环境觉得差不多了就收工，功能缺一大堆也不管。

③ 测试敷衍

跑几个单元测试或者 curl 一下接口就觉得万事大吉，根本没有像真实用户那样端到端走一遍流程。

━━━━━━━━━━━━━━━━━━━━

解决方案：外部记忆

agent-foreman 是一个 Claude Code 插件，给 AI 提供它们急需的东西：跨会话的持久记忆。

它基于 Anthropic 的研究论文《Effective harnesses for long-running agents》，但打包成了你今天就能用的实用工具。

核心文件：

• ai/feature_list.json → 带验收标准的功能清单
• ai/progress.log → 会话交接审计日志
• ai/init.sh → 项目专属测试命令

每个新的 AI 会话都会先读取这些文件——了解什么已完成、下一步做什么、验收标准是什么。

━━━━━━━━━━━━━━━━━━━━

为什么用 JSON 而不是 Markdown？

Anthropic 研究发现一个有趣细节：

"相比 Markdown 清单，模型更能准确地遵守和更新 JSON 结构。"

当功能用 JSON 存储，带有明确的 status 字段时，AI：
• 不会意外删除条目
• 能正确更新状态
• 会遵守数据结构

这就是项目能正常工作和功能神秘丢失之间的区别。

━━━━━━━━━━━━━━━━━━━━

为什么有效

核心洞察很简单：AI 需要和人类工程团队一样的协作工具。

人类工程师也不靠记忆工作。我们用：
• Git 记录历史
• Issue 跟踪任务
• 文档交接工作
• 测试验证功能

agent-foreman 把这些模式带给了 AI：

人类实践 → AI 等效
看板 → feature_list.json
会议纪要 → progress.log
CI/CD → init.sh check
Code Review → 验收标准

━━━━━━━━━━━━━━━━━━━━

魔法提示词

安装插件后试试这个：

"我希望你作为一个自主开发者。使用 agent-foreman 框架持续完成所有任务：

1. 用 agent-foreman status 检查状态
2. 用 agent-foreman next 获取下一个任务
3. 完整实现功能
4. 用 agent-foreman done <id> 验证并标记完成（自动运行测试）
5. 提交更改
6. 循环直到所有任务通过

不要停止直到所有功能都通过。"

AI 会有条不紊地完成你的整个功能清单，一次一个任务。

━━━━━━━━━━━━━━━━━━━━

安装

Claude Code 插件：
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman

或 CLI：
npm install -g agent-foreman

━━━━━━━━━━━━━━━━━━━━

总结

AI 编程助手很强大但健忘。

agent-foreman 是它们需要的外部大脑——一个结构化框架，维护上下文、强制纪律、确保每个会话都能精确接续上一个会话的工作。

别再和失忆症作斗争了。给你的 AI 一个记忆。

GitHub: github.com/mylukin/agent-foreman
NPM: npmjs.com/package/agent-foreman

灵感来自 Anthropic 研究：[Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
