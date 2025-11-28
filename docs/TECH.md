那我给你一版「从理念到落地」的**完整系统方案 V2**，已经把“需求变化”“连锁影响”“已有项目接入”等都考虑进去，你可以直接当 blueprint 用。

我按这几个层次来讲：

1. 设计目标 & 总体思路
2. 核心工件（文件层面的标准）
3. `feature_list.json` 的完整 schema & 需求变更机制
4. 工作流设计：新项目 / 旧项目 / 日常迭代 / 大改版
5. Claude Code 插件设计（3 个命令 + 关键行为）
6. 在你现有技术栈里的落地建议
7. 未来可扩展方向

---

## 1. 设计目标 & 总体思路

目标不是做一个“万能 Coding Agent”，而是给 **你 + 任意 LLM** 提供一个：

* **稳定的外部记忆**：功能清单、进度日志、统一启动脚本
* **可审计的工作流**：每次修改都有记录、可追溯
* **适应需求变化**：可以新增、废弃、拆分、重新规划，而不是把需求锁死

核心想法：

> “让 AI 按**人类靠谱工程师的方式**工作，而不是靠上下文一口气写完所有东西。”

所以整体分三层：

1. **文件层 harness**：`ai/feature_list.json` / `ai/progress.md` / `ai/init.sh` / 文档
2. **流程层**：怎么用这些文件去驱动任务分解、执行、交接
3. **工具层**：Claude Code 插件，把流程变成 `/command`，融入你日常开发

---

## 2. 核心工件：四类标准文件

### 2.1 `ai/feature_list.json` —— 功能图谱（活 backlog）

作用：

* 描述“有哪些功能”“做到哪一步”
* 是 AI / 人类工程师的共用任务清单和依赖图

基本结构：JSON 数组，每一个元素是一个独立功能（Feature）。

### 2.2 `ai/progress.md` —— 交接 & 审计日志

作用：

* 记录每一次“班次”干了什么
* 跟 Git log 互补，偏“业务/功能视角”

格式（建议）：

```txt
INIT 2025-11-27T10:03:21+08:00 goal="xxx" note="created long-task harness"

STEP 2025-11-27T10:15:00+08:00 feature=chat.new_conversation status=passing tests="npm test" summary="实现新建对话并通过基本测试"

CHANGE 2025-11-28T09:20:00+08:00 feature=chat.message.edit action=mark_needs_review reason="聊天历史展示逻辑受消息编辑影响"
```

可以有几种类型：`INIT` / `STEP` / `CHANGE` / `REPLAN` 等。

### 2.3 `ai/init.sh` —— 环境统一入口

作用：

* 对人/Agent 来说，“怎样跑起来 + 怎样检查”不再需要猜
* CI 也可以直接用这个脚本做基本检查

建议包含 3 个函数或子命令：

```bash
#!/usr/bin/env bash
set -euo pipefail

bootstrap() {
  # 安装依赖，例如：
  # npm install 或 pnpm install 或 go mod tidy
}

dev() {
  # 启动开发环境
}

check() {
  # 单元测试 + 基础 lint
}
```

你可以再加 `e2e()`、`format()` 等按项目扩展。

### 2.4 文档：`CLAUDE.md` & `docs/PROJECT_SURVEY.md`

**CLAUDE.md**

* 面向「AI + 新工程师」的使用说明书：

  * feature_list 各字段含义 & 禁止/允许的操作
  * progress.md 的格式示例
  * init.sh 各个命令的用途
  * 推荐的开发工作流（/init-harness → /feature-step 等）

**PROJECT_SURVEY.md**

* 专为**已有项目**生成的“项目体检报告”：

  * 技术栈概览
  * 目录结构 & 模块说明
  * 核心功能列表（功能视角，而不是类/函数列表）
  * 运行 / 开发命令
  * 完成度评估（模块级：完成/半成品/空壳）
  * 后续建议

---

## 3. `feature_list.json` 完整 schema & 需求变更机制

### 3.1 推荐字段设计（兼顾演进）

建议每个 Feature 至少包含：

```json
{
  "id": "chat.message.edit",
  "description": "用户可以在 5 分钟内编辑自己发出的消息",
  "module": "chat",            // 所属模块/子系统
  "priority": 3,               // 1 = 最高优先级
  "status": "failing",         // 状态见下
  "acceptance": [
    "消息发送后 5 分钟内可以编辑",
    "超过 5 分钟编辑按钮消失",
    "编辑后消息标记为已编辑"
  ],
  "dependsOn": ["chat.send_message"],
  "supersedes": [],            // 如果是旧 feature 的替代者，在这里填旧 id
  "tags": ["ui", "edit"],
  "version": 1,
  "origin": "init-from-routes",// init-auto / init-from-tests / manual 等
  "notes": ""
}
```

### 3.2 状态机设计（status）

建议允许的状态：

* `"failing"`：当前定义下尚未实现或实现不完整
* `"passing"`：按当前 acceptance 验收通过
* `"blocked"`：被外部条件卡住（第三方服务、上游接口、审批）
* `"needs_review"`：**被某次改动潜在影响，需要重新看一遍**
* `"deprecated"`：已废弃，由其它 feature 替代或已不再需要

Rules：

* `/feature-step` 正常工作时：

  * 目标是把某个 `failing` → `passing`
* 当需求变更时：

  * 旧 feature 不再适用 → `deprecated`，并在新 feature 的 `supersedes` 填上它
  * 对应模块可能被连锁影响 → 把相关 feature 标记为 `needs_review`
* `blocked` 是用于告诉 Agent：别在这个上面浪费时间了，先甘当 backlog。

### 3.3 需求变化的结构化处理

**1）新增需求：**

* 直接新增一个 Feature：

  * 指定合理 `priority` / `module`
  * 写好 `acceptance`
  * `status` 初始为 `failing`
* 在 `progress.md` 写一条 `CHANGE` 或 `REPLAN`，说明原因（比如“产品会议新增：导出聊天记录为 PDF”）

**2）现有需求被替代 / 大改：**

* 不要直接覆盖 description / acceptance。
* 操作步骤：

  1. 把旧 Feature 的 `status` 改成 `deprecated`
  2. 新建一个 Feature，描述新的行为
  3. 在新 Feature 的 `supersedes` 数组里列出旧的 id
  4. `version` 从 1 开始，后续修改描述时 +1
  5. 在 `progress.md` 写一条 CHANGE 记录，解释“为什么废弃 + 新旧关系”

**3）部分模块受影响但还没想清楚怎么改**

* 把相关 Feature（同 module，或 dependsOn 当前被改功能的）改为 `needs_review`
* 在 `notes` 里加一句“由于 X 改动，需要重新评估”
* `/feature-step` 下次选功能时，可以优先处理 `needs_review` + 高优先级的

---

## 4. 工作流设计

### 4.1 新项目从 0 开始

目标：快速有一套初始功能清单 & 脚手架。

流程：

1. 创建仓库，写最基础 README & 初始化代码框架。
2. 在 Claude Code 里运行：
   `/init-harness "一句话项目目标"`

   * 如果没有 `ai/feature_list.json` → 自动创建
   * 自动生成 `ai/progress.md`（INIT 记录）
   * 自动生成 `ai/init.sh`
   * 自动生成/更新 `CLAUDE.md`
3. 人工快速 review 一遍 `feature_list.json`：

   * 修正优先级
   * 补充/精简 acceptance
4. 之后每天开发就用 `/feature-step` 推一条条 feature。

### 4.2 已有项目接入（老仓库）

目标：

* 先搞清楚“现在是什么样子”
* 再用 harness 管起来

流程：

1. 在项目根目录执行：
   `/project-survey`

   * 生成 `docs/PROJECT_SURVEY.md`
   * 包含：技术栈、模块、功能列表、完成度评估
2. 读这份报告，先从人脑层面决定：

   * 这个项目还要不要继续投资？
   * 有哪些模块是重点（决定先管哪些、放弃哪些）
3. 再执行一次：
   `/init-harness "xxx 项目目标"`（默认 `mode=merge`）

   * 如果没有 `ai/feature_list.json`：

     * 从路由、控制器、测试推导出功能清单
   * 如果有：

     * 保留老条目
     * 补充缺失功能
     * 不破坏老的 `status` & description
4. 从此之后，这个老项目就和新项目一样，通过 feature 驱动，渐进改造。

### 4.3 日常迭代一个功能的完整循环：`/feature-step`

一轮“班次”标准动作：

1. **同步上下文**

   * 读 `ai/feature_list.json` / `ai/progress.md` / `CLAUDE.md`
   * 读最近的 `git log -N --oneline`

2. **选目标 Feature**
   策略可以是：

   * 优先级：`priority` 最小
   * 状态优先级：

     * `needs_review`（需要重新审查的）
     * 然后 `failing`
   * 你也可以在命令里指定 `feature_id` 精确控制那个功能

3. **PLAN 阶段**（一定要写计划）

   * 列出要查看/修改哪些文件
   * 大致步骤：

     * 读相关路由/接口/组件
     * 修改/新增哪些模块
     * 打算如何验证（命令 + 手动/e2e 流程）

4. **实施**

   * 按计划修改代码
   * 控制 scope，不随便大面积重构
   * 如需重构，必须在 notes / progress.md 里说明

5. **验证**

   * 跑 `ai/init.sh check`
   * 如有 e2e，顺手跑关键场景
   * 按 acceptance 一条条自查

6. **更新 `feature_list.json`**

   * 如果 acceptance 基本满足 → `status = passing`
   * 如果只做部分 → 继续 `failing`，但在 `notes` 写“已完成 X，待完成 Y”

7. **IMPACT REVIEW（连锁影响处理）**

   * 看本次改动影响了哪些模块/接口：

     * `dependsOn` 当前功能的
     * 同 module / 同路由群的
   * 对这些 Feature 做：

     * 明显受影响 → 标记为 `needs_review` + 补 notes
     * 被完全取代 → 改为 `deprecated`，新 Feature 的 `supersedes` 写上它

8. **追加 `ai/progress.md`**

   * 一条 `STEP` 记录，包含：

     * feature id
     * status
     * 跑过的测试命令
     * 一句 summary

9. **给人类一个 commit 建议**

   * 建议 commit message
   * 修改的文件列表
   * 下一个可以做的 Feature 推荐

### 4.4 需求大改 / 方向改变：re-plan 周期

当你遇到这种情况：

* 产品方向改变（例如：从 B2C 变 B2B）
* 计费策略大改
* 技术架构重大调整（单体拆微服务）

建议独立跑一轮“re-plan”流程：

1. 再跑一次 `/project-survey`：刷新 PROJECT_SURVEY.md
2. 人工结合业务决定：哪些 Feature 保留、哪些变更/废弃
3. 在 `feature_list.json` 中批量操作：

   * 不再做 → `deprecated`
   * 被替代 → 新 Feature + `supersedes` 旧 Feature
   * 需要适配新方向 → `needs_review`
4. 在 `ai/progress.md` 写一条 `REPLAN` 记录：

   * 概述本次规划变更
   * 统计有多少 Feature 状态被改

从这之后，`/feature-step` 又回到正常节奏，但在新的 backlog 结构之上。

---

## 5. Claude Code 插件设计（行为视角）

你不需要记所有 prompt 文本，只需要记住**每个命令负责的“故事”**，具体 prompt 可以按这个故事去扩展。

### 5.1 插件结构

* 本地 marketplace：`~/claude-marketplace`
* 插件：`~/claude-marketplace/plugins/long-task-harness`
* 关键文件：

  * `.claude-plugin/plugin.json`
  * `commands/init-harness.md`
  * `commands/feature-step.md`
  * `commands/project-survey.md`

### 5.2 `/project-survey [doc_path]` —— 旧项目体检器

行为要点：

* 扫描：

  * 入口（main.go / src/main.tsx / package.json…）
  * 模块目录
  * 路由 / 控制器
  * 数据模型
  * 测试 & CI 配置
* 输出：

  * `docs/PROJECT_SURVEY.md`（或自定义路径）
  * 包含：技术栈、模块、功能列表、完成度评估、运行命令
* 不强制修改 feature_list，只做“现状分析”

### 5.3 `/init-harness goal [mode]` —— 初始化/升级 harness

模式：

* 无 feature_list → 视为首次引入

  * 生成 `ai/feature_list.json`（从路由 & 测试推导 + 你的 goal）
  * 生成 `ai/progress.md`（INIT）
  * 生成/更新 `ai/init.sh` & `CLAUDE.md`
* 已有 feature_list：

  * `mode=merge`（默认）：合并新发现的功能，保留原条目
  * `mode=new`：备份旧的，再重建
  * `mode=scan`：只观察，不写清单（可选）

### 5.4 `/feature-step [feature_id]` —— 轮班工程师

行为要点：

1. 检查 `ai/feature_list.json` 是否存在，不存在就提示先 `/init-harness`
2. 选一个目标 feature（支持自动选 / 指定 id）
3. PLAN → 修改代码 → 测试
4. 更新该 Feature 的 `status` / `notes`
5. 做 IMPACT REVIEW：

   * 对潜在被影响的 Features 标记 `needs_review` 或 `deprecated`
6. 写 `ai/progress.md`
7. 给出 commit 建议 & 下一个推荐 Feature

---

## 6. 在你现有技术栈里的落地建议

结合你目前的情况（Vue3 / Astro / Go Echo / DictoGo 多项目）：

### 6.1 建议先选 1–2 个“重要但不急死”的项目试跑

比如：

* DictoGo 的「Web 管理后台」
* W-IoT 的「监测数据可视化服务」

对这类项目：

1. 跑 `/project-survey`，看体检报告情况
2. 跑 `/init-harness "xx 项目目标"` 初始化 harness
3. 选 3–5 个关键 Feature，用 `/feature-step` 一条条推进
4. 观察：

   * 你每天花到“解释上下文给 Agent”的时间有没有减少？
   * 项目“到底做到哪一步”的可见性是不是提高了？
   * 切换上下文（过几天回来接着做）是不是更轻松？

### 6.2 针对前后端混合项目的细节

* 前端（Vue3 / Astro）：

  * module 字段可以用页面域：`"module": "study-hub"` / `"module": "auth"`
  * acceptance 尽量写成「用户路径」：从“打开某页”到“看到某结果”
* 后端（Go Echo）：

  * module 可以用业务域：`"module": "wordbook"` / `"module": "billing"`
  * acceptance 写 REST/API 行为 + 状态变化
* 将来加 e2e（Playwright / Cypress）时：

  * 可以在 Feature 里加一个 `e2eTestId` 字段，绑定测试用例名，方便 Agent 自动调用

---

## 7. 未来扩展方向（可以慢慢加）

这套方案是“骨架”，你可以在上面继续叠砖：

1. **增加不同类型的 Agent 命令：**

   * `/test-step`：专门负责增强测试覆盖 & 生成 e2e
   * `/cleanup-step`：专门做重构、命名、文档
2. **和 CI/CD 集成：**

   * CI 读取 `feature_list.json`，根据 status 生成一个简单的 HTML Dashboard
   * 部署前检查是否有高优先级 `needs_review` 的 Feature 未处理
3. **和团队协作结合：**

   * 为 Feature 加上 `owner` 字段，与 Notion / issue 系统做轻量同步
   * `progress.md` 导入到你自己的可视化后台（Elastic + Grafana）
