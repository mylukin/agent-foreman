# agent-foreman

> AI 智能体的长任务管理框架 - 基于功能驱动的开发，提供外部记忆

[![npm version](https://img.shields.io/npm/v/agent-foreman.svg)](https://www.npmjs.com/package/agent-foreman)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

[English](./README.md)

## 问题

AI 编程智能体在处理长期任务时面临三个常见的失败模式：

1. **一次做太多** - 试图在一个会话中完成所有事情，导致代码混乱、不完整
2. **过早宣布完成** - 在所有功能实际工作之前就宣布胜利
3. **测试不充分** - 没有彻底验证实现

## 解决方案

**agent-foreman** 提供一个结构化的框架，使 AI 智能体能够：

- 通过结构化文件维护**外部记忆**
- **一次专注一个功能**，有明确的验收标准
- 通过进度日志实现**干净的会话交接**
- **追踪变更影响**对其他功能的影响

## 为什么有效

核心洞察很简单：**AI 智能体需要和人类工程团队一样的协作工具**。

人类工程师也不靠记忆工作。我们用：
- Git 记录版本历史
- Issue 跟踪任务管理
- 文档进行工作交接
- 测试验证功能

agent-foreman 把这些模式带给了 AI：

| 人类实践 | AI 等效 |
|---------|--------|
| Scrum 看板 | `feature_list.json` |
| 冲刺纪要 | `progress.md` |
| CI/CD 流水线 | `init.sh check` |
| Code Review | 验收标准 |

### 为什么用 JSON 而不是 Markdown？

来自 Anthropic 的研究：

> "相比 Markdown 清单，模型更能准确地遵守和更新 JSON 结构。"

当功能以 JSON 格式存储，带有明确的 `status` 字段时，AI 智能体：
- 不会意外删除条目
- 能正确更新状态
- 会遵守数据结构

这就是项目能正常工作和功能神秘丢失之间的区别。

## 安装

```bash
# 全局安装
npm install -g agent-foreman

# 或使用 npx
npx agent-foreman --help
```

## Claude Code 插件

agent-foreman 可作为 Claude Code 插件使用：

```bash
# 安装插件
/plugin marketplace add mylukin/agent-foreman
/plugin install agent-foreman
```

---

## 在 Claude Code 中使用

### 初始化项目

#### 空项目

对于没有现有代码的全新项目：

```bash
mkdir my-project && cd my-project
agent-foreman init "构建一个任务管理的 REST API" --mode new
```

**Claude Code 提示词：**

```text
使用 foreman 初始化这个项目。
目标：构建一个任务管理的 REST API
```

#### 已有代码的项目

对于已有代码的项目：

```bash
agent-foreman survey
agent-foreman init "你的项目目标"
```

**Claude Code 提示词：**

```text
使用 foreman 初始化这个项目。
```

---

### 任务循环提示词

#### 完成单个任务

```text
使用 foreman 获取下一个任务，实现它，并标记为完成。
```

#### 持续任务循环

**魔法提示词 - 自动完成所有任务：**

```text
使用 foreman 检查项目状态，然后持续逐个完成所有任务直到全部完成。
对于每个任务：
1. 运行 `agent-foreman step` 获取下一个任务
2. 根据验收标准实现功能
3. 运行测试验证
4. 运行 `agent-foreman complete <feature_id>` 标记完成
5. 重复直到所有任务都通过
```

#### 快速状态检查

```text
使用 foreman 检查当前项目状态。
```

#### 分析并规划

```text
使用 foreman 分析这个项目并给我一份综合状态报告。
```

---

### 管理任务

#### 添加新任务

直接编辑 `ai/feature_list.json` 或使用 Claude Code：

```text
添加一个新功能到任务列表：
- ID: auth.oauth
- 描述：实现 Google OAuth2 认证
- 模块：auth
- 优先级：5
- 验收标准：用户可以使用 Google 账户登录
```

**功能 JSON 结构：**

```json
{
  "id": "auth.oauth",
  "description": "实现 Google OAuth2 认证",
  "module": "auth",
  "priority": 5,
  "status": "failing",
  "acceptance": [
    "用户可以点击'使用 Google 登录'按钮",
    "系统重定向到 Google OAuth 流程",
    "用户认证后重定向回来"
  ],
  "dependsOn": ["auth.login"],
  "tags": ["oauth", "google"],
  "version": 1,
  "origin": "manual",
  "notes": ""
}
```

#### 改变任务目标

```text
更新项目目标为："构建一个带 React 前端的全栈任务管理应用"
同时更新相关功能以符合新目标。
```

#### 修改现有任务

```text
更新功能 'api.users.create'：
- 修改描述为："创建用户并发送邮件验证"
- 添加验收标准："注册后发送验证邮件"
- 设置优先级为 3
```

#### 标记任务为阻塞

```text
将功能 'payment.stripe' 标记为阻塞，备注："等待 Stripe API 密钥"
```

---

### 自动完成所有任务

#### 方法 1：持续循环提示词

最有效的全自动任务完成提示词：

```text
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

#### 方法 2：使用 Foreman 代理

```text
使用 foreman 代理自动完成此项目中所有待处理的任务。
逐个完成直到 100% 完成。
```

#### 方法 3：批量完成（针对已实现的功能）

如果功能已经实现但未标记：

```text
这个项目中的所有功能都已经实现和测试。
使用 foreman 逐个将它们标记为完成，直到全部通过。
```

---

### 工作流程总结

```text
┌─────────────────────────────────────────────────────────────┐
│                    AGENT-FOREMAN 工作流程                    │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  status  │───▶│   step   │───▶│   实现   │              │
│  └──────────┘    └──────────┘    └──────────┘              │
│       │                               │                     │
│       │                               ▼                     │
│       │                         ┌──────────┐               │
│       │                         │   测试   │               │
│       │                         └──────────┘               │
│       │                               │                     │
│       │                               ▼                     │
│       │    ┌──────────┐        ┌──────────┐               │
│       │◀───│   下一个  │◀───────│ complete │               │
│       │    └──────────┘        └──────────┘               │
│       │                               │                     │
│       ▼                               ▼                     │
│  ┌─────────────────────────────────────────┐               │
│  │  🎉 所有功能都通过！(100%)               │               │
│  │  📊 PROJECT_SURVEY.md 自动更新          │               │
│  └─────────────────────────────────────────┘               │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 命令参考

| 命令 | 描述 |
|------|------|
| `survey` | 生成项目调查报告 |
| `init <goal>` | 初始化或升级框架 |
| `step` | 显示下一个要处理的功能 |
| `status` | 显示当前项目状态 |
| `impact <feature_id>` | 分析更改的影响 |
| `complete <feature_id>` | 将功能标记为完成 |

### 初始化模式

| 模式 | 描述 |
|------|------|
| `--mode merge` | 与现有合并（默认）|
| `--mode new` | 创建新的，如存在则失败 |
| `--mode scan` | 仅扫描，不使用 AI 功能 |

---

## 核心文件

| 文件 | 用途 |
|------|------|
| `ai/feature_list.json` | 带状态的功能积压 |
| `ai/progress.md` | 会话交接审计日志 |
| `ai/init.sh` | 环境启动脚本 |
| `docs/PROJECT_SURVEY.md` | AI 生成的项目调查 |

---

## 功能状态值

| 状态 | 含义 |
|------|------|
| `failing` | 尚未实现 |
| `passing` | 验收标准已满足 |
| `blocked` | 外部依赖阻塞 |
| `needs_review` | 可能受更改影响 |
| `deprecated` | 不再需要 |

---

## 支持的技术栈

| 语言 | 框架 |
|------|------|
| Node.js/TypeScript | Express, Vue, React, Astro, Next.js, Nuxt |
| Go | Echo, Gin, Fiber |
| Python | FastAPI, Flask, Django |

---

## 最佳实践

1. **一次一个功能** - 完成后再切换
2. **及时更新状态** - 满足标准时标记通过
3. **审查影响** - 更改后运行影响分析
4. **干净提交** - 一个功能 = 一个原子提交
5. **先阅读** - 始终检查功能列表和进度日志

---

## 开发

```bash
# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建
npm run build

# 运行测试
npm test
```

## 许可证

MIT

## 作者

Lukin ([@mylukin](https://github.com/mylukin))

---

灵感来自 Anthropic 的博客文章：[Effective harnesses for long-running agents](https://www.anthropic.com)
