这个问题问得特别关键，Lukin，**如果每个 /step 都把整套 Playwright e2e 跑一遍，这个系统迟早会被自己拖死。**
要从“全量回归”变成“按功能/范围选跑”，而且要能和 agent-foreman 的 feature 驱动逻辑对齐。

我给你一个**分三层的方案**：

1. 调整测试结构：把 `npm test` 从“全量 UI 回归”变成“快速测试 + 小范围 e2e”
2. 利用 Playwright 的 tag / grep / 文件粒度，只跑**相关的那一小撮 UI 测试**
3. 把“feature → e2e 测试”的映射写进 `feature_list.json`，让 foreman 自动决定跑什么

---

## 一、先改策略：`npm test` 不应该等于“全套 e2e”

现在的问题本质上是：

> `npm test` = `npx playwright test`
> → 每次 step 都跑全套 UI 回归 → 爆炸

你可以调整成“测试金字塔”结构：

* `npm test`：只跑 **快速测试 + 少量 smoke e2e**
* 全量 e2e：

  * 在 CI 里跑（每次 push / 合并前）
  * 或者你手动触发 `npm run test:e2e:all`

**建议脚本重构示例：**

`package.json`：

```jsonc
{
  "scripts": {
    "test": "npm run test:fast && npm run test:e2e:smoke",
    "test:fast": "vitest",                // 或 jest / node --test，看你现在用啥
    "test:e2e:smoke": "playwright test --grep @smoke",
    "test:e2e:all": "playwright test"
  }
}
```

Playwright 本身就支持通过 `--grep` 按 tag 或标题过滤测试([Playwright][1])。

之后：

* `agent-foreman`/`init.sh check` 默认只跑 `npm test`（快 + smoke）
* 真正的 full e2e 放在 CI / 手动命令中跑

---

## 二、用 tag / grep / 文件粒度，让“每个 Feature 只跑相关的 UI 测试”

### 1. 给 e2e 测试加 tag

Playwright 官方已经有完整的 tag 机制：
你可以在 test details 里加 `tag` 字段，或者在标题里加 `@tag`([Playwright][2])。

#### 写法 1：用 details 对象

```ts
import { test, expect } from '@playwright/test';

test(
  '用户可以创建新对话 @feature-chat.new_conversation @smoke',
  async ({ page }) => {
    // ...
  }
);
```

或者：

```ts
test(
  '用户可以创建新对话',
  { tag: ['@feature-chat.new_conversation', '@smoke'] },
  async ({ page }) => {
    // ...
  }
);
```

#### 写法 2：命令过滤

* 只跑这个 feature 的测试：

  ```bash
  npx playwright test --grep @feature-chat.new_conversation
  ```

* 只跑 smoke 测试：

  ```bash
  npx playwright test --grep @smoke
  ```

官方文档和社区文章都推荐用 tag + `--grep` 来把大套测试拆成多个子集([timdeschryver.dev][3])。

---

### 2. 按 **feature id → tag** 映射跑相关 e2e

既然你已经在 agent-foreman 里有 `feature_list.json`，
很自然的做法是：**一个 feature 对应一组 e2e tag / 文件**。

#### 设计：给 feature 增加 e2e 相关字段

`ai/feature_list.json` 里的每条 feature，可以加类似字段：

```jsonc
{
  "id": "chat.new_conversation",
  "description": "用户可以点击“新建对话”按钮开启一个新的会话",
  "priority": 1,
  "status": "failing",
  "acceptance": ["..."],
  "e2eTags": ["@feature-chat.new_conversation", "@smoke"],
  "e2eFiles": ["tests/chat/new-conversation.spec.ts"]
}
```

然后在每一轮 step 的 “check 阶段”：

1. foreman 读当前 feature 的 `e2eTags` / `e2eFiles`
2. 如果有 `e2eFiles`：

   * 优先用文件粒度：
     `npx playwright test tests/chat/new-conversation.spec.ts`
3. 如果只有 `e2eTags`：

   * 用 `--grep`：
     `npx playwright test --grep @feature-chat.new_conversation`
4. 如果两者都没有：

   * 只跑 `@smoke` 或直接略过 e2e（由你决定策略）

你可以让 foreman 在 plan 里明确写出将要执行的命令，然后 `init.sh check` 里根据环境变量或参数来跑。

---

### 3. 对不同类型测试拆层：smoke / feature / regression

推你一个很实用的划分法：

* `@smoke`：一条链路一两个关键 case，足够保证“页面能起来 + 主按钮能点”
* `@feature-xxx`：每个 feature 对应的深入 e2e 测试
* `@regression`：长、大、吃资源的回归场景（只在 CI 或 nightly 跑）

对应命令可以设计成：

```jsonc
{
  "scripts": {
    "test:e2e:smoke": "playwright test --grep @smoke",
    "test:e2e:feature": "playwright test --grep \"$PLAYWRIGHT_GREP\"",
    "test:e2e:regression": "playwright test --grep @regression",
    "test:e2e:all": "playwright test"
  }
}
```

---

## 三、把这一套接到 agent-foreman 的“工作流里”——真正做到“按功能跑相关 e2e”

你现在这个项目已经是一个“功能驱动 AI 的 foreman”，
接下来只要补两块 glue：

1. **feature 元数据层**：在 `feature_list.json` 里为每个 feature 声明它的 e2e tag / 文件
2. **执行策略层**：在当前 step 的“check 阶段”里，根据 feature 元数据决定跑哪些测试

### 1. 扩展 `feature_list.json` 的 schema

可以先从简版开始（以后再加复杂映射）：

```jsonc
{
  "id": "chat.new_conversation",
  "description": "用户可以点击“新建对话”按钮开启一个新的会话",
  "priority": 1,
  "status": "failing",
  "acceptance": [
    "..."
  ],
  "e2e": {
    "mode": "tags",  // tags | files | smokeOnly
    "tags": ["@feature-chat.new_conversation", "@smoke"],
    "files": ["tests/chat/new-conversation.spec.ts"]
  }
}
```

设计一个简单策略：

* `mode = "smokeOnly"`：仅跑 `@smoke`
* `mode = "tags"`：用 `tags` 里的 tag 做 `--grep`
* `mode = "files"`：只跑指定文件
* （以后可以支持 `mode = "none"`：完全不跑 e2e）

### 2. 改 foreman 的“check”逻辑

现在 foreman 每轮都会跑一些 “check 命令”，你可以约定一套逻辑，比如：

1. 每一轮最少跑：

   * `npm run test:fast`
2. 根据当前 Feature 的 `e2e.mode` 决定是否跑 e2e：

   * `smokeOnly` → `npm run test:e2e:smoke`
   * `tags` → `PLAYWRIGHT_GREP="@feature-xxx"` → `npm run test:e2e:feature`
   * `files` → `npx playwright test tests/xxx.spec.ts`
   * 没配置 → 只跑 fast，不跑 e2e

你可以把这段逻辑写进：

* `ai/init.sh` 里的 `check()` 函数（传入 feature id / grep），或者
* foreman 的一个“小助手脚本”（比如 `scripts/run-checks-for-feature.ts`）

---

## 四、再补两个现实建议，省更多时间

### 1. 本地开发只跑最小集，CI 跑全量

一个比较现实的分工：

* 本地每个 AI step / 人类改动：

  * `npm run test:fast`
  * * 对应 feature 的 `e2e`（通常 1~2 个 case）
* CI：

  * 每个 PR 跑 `@smoke + @critical`
  * 每晚跑 full `playwright test`（可以并行 + 多 shard）

Playwright 本身支持 test projects + 并行 + sharding，你可以之后再加复杂一点([Playwright][4])。

### 2. 先只给“核心路径”写 e2e / tag

不需要一开始就给所有功能绑 e2e 测试；
你可以做一个“渐进上覆盖率”的策略：

1. 先给最关键的 10% 路径写好 e2e + tag（登录、主流程、支付/关键操作）
2. 每当 foreman 在某个模块上工作一阵，顺便帮你补对应 e2e 和 tag
3. 最后形成一个“真实使用频率越高 → e2e 越完备”的 coverage 分布

---

## 小结一下给你一个“最小改动版”的建议

如果你要**最小成本快速落地**，我会建议你现在就先做这几步：

1. 改 `package.json`：

   * `npm test` → fast + `@smoke`，不要再跑全量
   * 增加 `test:e2e:all` 专门跑所有 UI

2. 给最关键的一两个 e2e 用例加 tag：

   * `@smoke`
   * 再加一个 `@feature-xxx`，和 `feature_list.json` 的 `id` 呼应

3. 在 `feature_list.json` 里加一个简单字段：

   ```jsonc
   "e2eTags": ["@feature-chat.new_conversation", "@smoke"]
   ```

4. 在 foreman 的某个 step 里写死一条逻辑：

   * 如果当前 feature 有 `e2eTags` → 用 `--grep` 跑它
   * 否则只跑 fast 测试

等这套跑顺了，再慢慢演进成完整的 `e2e.mode/tags/files` 方案。

如果你愿意，可以把你现在 `package.json` 的 scripts 和一个典型的 Playwright spec（随便一两个）贴出来，我可以直接帮你改成“分层测试 + tag 方案”的具体版本，尽量只给你 diff，不会整文件重写。

[1]: https://playwright.dev/docs/running-tests?utm_source=chatgpt.com "Running and debugging tests"
[2]: https://playwright.dev/docs/test-annotations?utm_source=chatgpt.com "Annotations"
[3]: https://timdeschryver.dev/blog/create-and-run-playwright-test-sets-using-tags-and-grep?utm_source=chatgpt.com "Create and run Playwright test sets using tags and grep"
[4]: https://playwright.dev/docs/test-projects?utm_source=chatgpt.com "Projects"
