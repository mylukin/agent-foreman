# agent-foreman

> ⚠️ **已停止维护**: 本项目不再维护。请迁移至 [ralph-dev](https://github.com/mylukin/ralph-dev) - 一个更简洁的版本。

---

## 🚨 迁移通知

由于本项目过于复杂，已停止维护。新的简化版本已发布：

**👉 [https://github.com/mylukin/ralph-dev](https://github.com/mylukin/ralph-dev)**

请迁移至 `ralph-dev` 以获得持续的支持和更新。

---

<details>
<summary><b>历史文档（归档）</b></summary>

> 让 AI 不再半途而废，一次交付完整功能

[![npm version](https://img.shields.io/npm/v/agent-foreman.svg)](https://www.npmjs.com/package/agent-foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md) | [详细指南](./docs/USAGE.md)

## 痛点

AI 编程助手在处理复杂项目时，常常会掉进这三个坑：

1. **贪多嚼不烂** — 试图一口气搞定所有功能，结果代码乱成一团
2. **虎头蛇尾** — 还没验证就急着宣布「搞定了」，实际一堆 bug
3. **走过场式测试** — 测试覆盖不到位，上线后问题频出

## 破局之道

**agent-foreman** 提供了一套结构化的工作框架，让 AI 能够：

- 通过外部文件**持久化记忆**，不再「失忆」
- **专注单一功能**，配合清晰的验收标准
- 通过进度日志实现**无缝交接**，换个 Agent 接着干
- **追踪变更影响**，改一处知全局

---

## 快速开始

```bash
/plugin install agent-foreman        # 1. 安装
/agent-foreman:init 搭建用户认证API   # 2. 初始化
/agent-foreman:run                   # 3. 让 AI 干活
```

---

## 安装

```bash
# 快速安装（二进制）
curl -fsSL https://raw.githubusercontent.com/mylukin/agent-foreman/main/scripts/install.sh | bash

# 通过 npm
npm install -g agent-foreman

# 或直接使用 npx
npx agent-foreman --help
```

手动下载：[GitHub Releases](https://github.com/mylukin/agent-foreman/releases)

---

## 使用方法

### 插件命令（推荐）

```
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman
```

| 命令 | 说明 |
|------|------|
| `/agent-foreman:status` | 查看项目状态和进度 |
| `/agent-foreman:init` | 用项目目标初始化框架 |
| `/agent-foreman:analyze` | 分析现有项目结构 |
| `/agent-foreman:spec` | 将需求转化为任务 |
| `/agent-foreman:next` | 获取下一个优先任务 |
| `/agent-foreman:run` | 自动完成所有待办任务 |

**将需求转化为任务：**
```
/agent-foreman:spec 搭建一个用户认证系统
```

```
需求 → [产品→UX→技术→QA] → 规格文档 → BREAKDOWN 任务 → /run → 实现
```

<details>
<summary><b>CLI 命令（独立使用）</b></summary>

不通过 Claude Code 独立使用：

| 命令 | 说明 |
|------|------|
| `init [goal]` | 初始化或升级框架 |
| `next [feature_id]` | 显示下一个待处理任务 |
| `status` | 显示当前项目状态 |
| `check [feature_id]` | 验证代码变更或任务完成状态 |
| `done <feature_id>` | 验证、标记完成并自动提交 |
| `fail <feature_id>` | 标记任务为失败 |
| `impact <feature_id>` | 分析变更影响 |
| `tdd [mode]` | 查看或设置 TDD 模式 |
| `agents` | 显示可用的 AI 代理 |
| `install` | 安装 Claude Code 插件 |
| `uninstall` | 卸载 Claude Code 插件 |

</details>

---

## 工作流程

```
next → 实现 → check → done → 循环
```

| 步骤 | 命令 | 执行内容 |
|------|------|----------|
| 1 | `next` | 获取任务和验收标准 |
| 2 | 实现 | 编写代码满足标准 |
| 3 | `check` | 验证实现 |
| 4 | `done` | 标记完成，自动提交 |

---

## 最佳实践

1. **一次只做一件事** — 完成当前任务再切换
2. **及时更新状态** — 验收通过就标记
3. **关注影响范围** — 改完跑一下 impact 分析
4. **原子化提交** — 一个功能对应一个 commit
5. **先看再动手** — 开工前先读功能列表和进度日志

---

## 参考资料

<details>
<summary><b>核心文件</b></summary>

| 文件 | 用途 |
|------|------|
| `ai/tasks/index.json` | 任务索引，带状态摘要 |
| `ai/tasks/{module}/{id}.md` | 单个任务定义 |
| `ai/progress.log` | 进度日志，用于会话交接 |
| `ai/init.sh` | 环境启动脚本 |
| `CLAUDE.md` | AI 代理指令文件 |

</details>

<details>
<summary><b>状态值</b></summary>

| 状态 | 含义 |
|------|------|
| `failing` | 待实现 |
| `passing` | 已完成验收 |
| `blocked` | 被外部依赖卡住 |
| `needs_review` | 可能受其他改动影响 |
| `failed` | 验证失败 |
| `deprecated` | 已废弃 |

</details>

<details>
<summary><b>为什么管用</b></summary>

AI 需要和人类团队一样的协作工具：

| 人类的做法 | AI 的等价物 |
|-----------|------------|
| Scrum 看板 | `ai/tasks/index.json` |
| 站会纪要 | `progress.log` |
| CI/CD 流水线 | `init.sh check` |
| Code Review | 验收标准 |

</details>

---

## 开源协议

MIT

## 作者

Lukin ([@mylukin](https://github.com/mylukin))

---

灵感来源：Anthropic 博客 [Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)

</details>
