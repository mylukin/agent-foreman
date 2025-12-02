# `run` 命令多轮自动修复与验证设计稿

## 1. 目标与范围

- **目标**：在一次 `agent-foreman run <steps_dir>` 调用中，对每一个需要执行的 JSON 步骤单元，支持最多 **5 轮**“自动实现 → 单元测试 → verification 验证 → 进度更新”，直到该步骤通过为止；如果 5 轮仍无法通过，则保留为失败状态并终止本次 `run`。
- **范围**：
  - 仅影响 `src/run.ts` 中 `runStepsDirectory` 的行为；
  - 不改变 `analyze` 命令输出的 JSON 结构（只是允许新增 `unit_test` 字段）；
  - CLI 入口与参数形式保持不变（`run <steps_dir>` 与 `run <steps_dir> --full-verify`）。

## 2. 步骤 JSON 结构扩展

### 2.1 现有结构

```ts
export type StepStatus = "🔴 待完成" | "🟡 进行中" | "🟢 已完成";

export interface StepJson {
  id: string;
  description: string;
  status: StepStatus;
  verification: VerificationItem[];
  // Allow extra fields for forward compatibility
  [key: string]: unknown;
}
```

### 2.2 新增字段：`unit_test`

```ts
export interface StepUnitTest {
  command: string;      // 用于运行与当前步骤相关的单元测试的命令
  files?: string[];     // 涉及的测试文件列表（可选）
  notes?: string;       // 补充说明（可选）
}

export interface StepJson {
  id: string;
  description: string;
  status: StepStatus;
  verification: VerificationItem[];
  unit_test?: StepUnitTest;
  [key: string]: unknown;
}
```

JSON 示例：

```json
{
  "id": "step-010",
  "description": "……",
  "status": "🔴 待完成",
  "verification": [ ... ],
  "unit_test": {
    "command": "npm test -- tests/run-command.test.ts",
    "files": ["tests/run-command.test.ts"],
    "notes": "覆盖 runStepsDirectory 的主要场景"
  }
}
```

`RunStepEntry` 中同步增加缓存字段：

```ts
interface RunStepEntry {
  // 现有字段...
  unitTest?: StepUnitTest;
}
```

## 3. 实现阶段：AI 生成代码 + 单元测试 + `unit_test`

### 3.1 Prompt 要求（`buildRunStepPrompt`）

在现有实现 prompt 上新增一段约束：

- 要求 AI 在完成实现与单元测试编写后，在输出末尾附加一个仅包含 `unit_test` 字段的 JSON 对象：

```json
{
  "unit_test": {
    "command": "npm test -- tests/run-command.test.ts",
    "files": ["tests/run-command.test.ts"],
    "notes": "覆盖 runStepsDirectory 的主要场景"
  }
}
```

- 约束：
  - 不使用 Markdown 代码块，只输出裸 JSON；
  - 字段必须使用英文双引号；
  - 如果认为不需要/无法编写专门单元测试，可以省略 `unit_test` 字段（不要输出空字段）。

### 3.2 输出解析与写回 JSON

- 新增辅助函数 `extractUnitTestFromOutput(output: string): StepUnitTest | undefined`：
  - 使用 `extractJsonObject` 从 AI 输出中提取 JSON；
  - 解析 `unit_test.command/files/notes`，做最小合法性校验。
- 在实现阶段 `callAnyAvailableAgent` 返回 `success: true` 后：
  - 尝试提取 `unit_test` 并写入：
    - `step.unit_test = unitTest;`
    - `entry.unitTest = unitTest;`
  - 将更新后的 `step` 写回对应的 `NNN-*.json`。
  - 控制台输出提示：`单元测试信息已记录到步骤 JSON（命令：<command>）`。

## 4. 验证阶段：`unit_test` + verification（单轮逻辑）

### 4.1 普通 run（不带 `--full-verify`）中的单轮验证

在每个步骤的实现阶段成功后，追加一轮「单元测试（如有） + verification」：

1. **执行单元测试（如果存在 `unit_test`）**：
   - 若 `entry.unitTest?.command` 存在：
     - 控制台：`🧪 执行单元测试: <command>`；
     - 使用 `spawnSync(command, { cwd, shell: true })` 执行；
     - 若退出码为 0：输出 `✓ 单元测试通过`；
     - 若退出码非 0：
       - 输出 `✗ 单元测试失败`，打印截断后的 stderr/stdout；
       - 将步骤状态改为 `🔴 待完成`，记录 `entry.error = "单元测试失败"`；
       - 写回 JSON；
       - 重写 `run-progress.md`；
       - 记为 `firstFailure` 并终止本次 `run`。

2. **按 verification 调用 AI 验证**：
   - 构造 `buildRunStepValidationPrompt`，说明这是按 `verification` 做的验证；
   - 控制台：`正在调用命令行 AI 按 verification 进行验证...`；
   - 调用 `callAnyAvailableAgent`：
     - 若 `success: false`：
       - 控制台输出 `✗ verification 验证未通过：<错误>`；
       - 状态改为 `🔴 待完成`，记录错误；
       - 写回 JSON；
       - 重写 `run-progress.md`；
       - 记为 `firstFailure` 并终止本次 `run`。
     - 若 `success: true`：
       - 输出 `✓ verification 验证通过`；
       - 保持状态为 `🟢 已完成`；
       - 重写 `run-progress.md`，继续下一个步骤。

### 4.2 `--full-verify` 下已完成步骤的回归验证

对 `status === "🟢 已完成" && fullVerify` 的步骤，当前逻辑：

1. 控制台：`当前步骤已标记为已完成，将仅重新运行测试进行回归验证...`。
2. 若存在 `unit_test`：
   - 执行 `unit_test.command`；
   - 失败则：
     - 输出 `✗ 单元测试失败`，状态逻辑保持不变但标记 `entry.success = false`；
     - 写入 `run-progress.md`；
     - 控制台提示将重新打开该步骤；
     - `needImplementation = true`，即后续会对该步骤进入实现阶段。
3. 若单测通过（或无 `unit_test`），调用 AI 进行 verification：
   - 验证通过：保持 `🟢 已完成`，写入 `run-progress.md`，跳过实现阶段；
   - 验证失败：提示失败原因，并将 `needImplementation = true`，进入实现阶段。

## 5. 多轮自动修复实现细节

本节描述 **已经落地在 `src/run.ts` 中的实际行为**，对应常量：

```ts
const MAX_ATTEMPTS = 5;
```

### 5.1 适用范围与入口

- 多轮自动修复只对「需要实现」的步骤生效，即：
  - 普通 `run <steps_dir>` 场景下，`status !== "🟢 已完成"` 的步骤；
  - `run <steps_dir> --full-verify` 场景下，若已完成步骤在回归测试/验证阶段失败，被重新打开后（`needImplementation = true`）也会进入同一套多轮逻辑。
- 对于 `status === "🟢 已完成"` 且在 `--full-verify` 下回归测试与 verification 均通过的步骤，则只做一次「测试 + 验证」，不会进入多轮实现流程（见第 4.2 节）。

在 `runStepsDirectory` 中，对每个需要实现的步骤都会执行：

```ts
for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
  // 1. 标记为进行中并写回 JSON
  // 2. 构造实现 prompt（必要时附带上一轮失败摘要）
  // 3. 调用 AI 实现本轮修改
  // 4. 在普通 run 模式下执行单元测试和 verification
  // 5. 根据结果决定结束或进入下一轮
}
```

### 5.2 每轮开始：状态更新与日志

每一轮尝试开始时：

1. 记录本轮开始前的状态 `attemptStartStatus`；
2. 将步骤状态更新为 `🟡 进行中`，写回对应的 `NNN-*.json` 文件；
   - 如果写回失败，会立即写入一次 `run-progress.md` 并终止本次 `run`；
3. 控制台打印状态迁移，例如：

   ```text
   状态更新: 🔴 待完成 → 🟡 进行中
   🔁 [1/3] 第 1/5 次尝试执行该步骤（首次尝试）...
   ```

   - 首轮尝试会标记为「首次尝试」；
   - 后续尝试会说明是基于上一轮失败原因进行修复。

### 5.3 Prompt 结构与失败上下文

- 每一轮都会基于当前步骤状态构造 `buildRunStepPrompt`，其主体内容与第 3 节一致（包含 `unit_test` 输出约定）。
- 从第 2 轮开始，如果上一轮失败且收集到了失败上下文，则会通过 `appendPreviousFailureContextToPrompt` 将摘要追加到 prompt 末尾。

`PreviousAttemptFailureContext` 的来源：

- 当某轮 **单元测试失败** 时：
  - 记录 `unitTestCommand`；
  - 通过 `buildOutputSnippet` 截断并保存最近一次单测命令的标准输出/错误为 `unitTestOutputSnippet`；
  - 设置 `fromStatus` 为本轮开始前状态，`toStatus` 为失败后状态（通常是 `🔴 待完成`）。
- 当某轮 **verification 失败** 时：
  - 记录 `verificationError` 文本（来自验证阶段的错误信息）。
- 当某轮 **AI 实现阶段失败** 时（`callAnyAvailableAgent` 返回 `success: false`）：
  - 记录 `aiError` 文本。

在下一轮尝试中，这些信息会以「上一轮尝试失败原因摘要」的形式拼接到 prompt 中，同时控制台也通过 `logAttemptFailureSummary` 打印对应的简要说明，帮助下游 AI 有针对性地修复。

### 5.4 实现阶段与 `unit_test` 写回

当某轮实现调用 `callAnyAvailableAgent` 返回 `success: true` 时：

1. 步骤状态被设置为 `🟢 已完成`，并写回对应的 JSON 文件；
2. 使用 `extractUnitTestFromOutput(result.output)` 从本轮 AI 输出中提取 `unit_test` 配置：
   - 若成功解析出合法的 `unit_test`：
     - 写回到步骤 JSON 的 `unit_test` 字段；
     - 同步缓存到内存中的 `entry.unitTest`；
     - 控制台输出类似：`单元测试信息已记录到步骤 JSON（命令：<command>）`。
3. 如果写回 JSON 失败（例如磁盘错误），则：
   - 控制台输出错误信息；
   - 写入 `run-progress.md`；
   - 标记当前步骤为失败并终止本次 `run`。

此时尚未进入本轮的「单元测试 + verification」阶段，仍然可以在失败时通过后续的多轮尝试进行自动修复。

### 5.5 单元测试与 verification 在多轮中的行为

在普通 `run` 模式（未开启 `--full-verify`）下，每一轮成功实现后会按以下顺序执行验证逻辑：

1. **执行单元测试（如存在 `unit_test`）**：
   - 若 `entry.unitTest?.command` 存在：
     - 控制台：`🧪 执行单元测试: <command>`；
     - 使用 `runUnitTestsForStep`（内部基于 `spawnSync`）执行命令；
     - 若退出码为 0：输出 `✓ 单元测试通过`，继续进入 verification；
     - 若退出码非 0：
       - 输出 `✗ 单元测试失败` 并打印截断后的输出；
       - 将步骤状态改回 `🔴 待完成`，`entry.error = "单元测试失败"`；
       - 填充上一轮失败上下文（`unitTestCommand` + `unitTestOutputSnippet`）；
       - 写回 JSON，并重写 `run-progress.md`；
       - 若 `attempt < MAX_ATTEMPTS`：进入下一轮尝试；
       - 若 `attempt === MAX_ATTEMPTS`：记录 `firstFailure`，终止本次 `run`。

2. **按 verification 调用 AI 验证**：
   - 构造 `buildRunStepValidationPrompt` 并调用 `callAnyAvailableAgent`：
     - 若 `success: true`：
       - 输出 `✓ verification 验证通过`；
       - 记录本轮通过信息，重写 `run-progress.md`；
       - 控制台额外打印：`✓ 第 N 次尝试后步骤已通过所有测试与验证`；
       - 跳出当前步骤的多轮循环，进入下一个步骤。
     - 若 `success: false`：
       - 输出 `✗ verification 验证未通过：<错误>`；
       - 将状态改回 `🔴 待完成`，记录 `verificationError`；
       - 更新上一轮失败上下文（用于下一轮 prompt）；
       - 写回 JSON，重写 `run-progress.md`；
       - 若 `attempt < MAX_ATTEMPTS`：进入下一轮尝试；
       - 若 `attempt === MAX_ATTEMPTS`：记录 `firstFailure`，终止本次 `run`。

在 `--full-verify` 模式下，对于重新打开需要实现的步骤，多轮实现仍然存在，但本轮实现之后不会再自动执行单元测试与 verification（即跳过上述步骤 1 和 2），仅依赖实现阶段的成功与否来判定是否需要重试。

### 5.6 终止条件与边界情况

单个步骤的多轮自动修复在以下情况结束：

- **成功结束**：
  - 某一轮实现成功，且在普通模式下通过了本轮单元测试与 verification（或在 full-verify 模式下实现成功，无需额外验证）；
  - 最终状态为 `🟢 已完成`，`run-progress.md` 中该步骤的「执行后状态」为 `🟢 已完成`，结果列为 `成功`，错误信息为空。
- **失败结束**（达到上限）：
  - 在实现阶段、单元测试阶段或 verification 阶段连续失败 **5 轮**（`MAX_ATTEMPTS`），且每一轮失败之后都已尝试自动修复；
  - 到达第 5 轮失败时：
    - 当前步骤的状态被写回为 `🔴 待完成`；
    - `entry.success = false`，并记录最后一次失败原因；
    - 通过 `firstFailure` 记录第一个失败步骤；
    - 控制台汇总输出「本轮失败摘要」以及最终的失败步骤信息；
    - `run-progress.md` 中该步骤的「执行后状态」为 `🔴 待完成`，结果列为 `失败`，错误信息包含最后一次失败摘要。

一旦某个步骤在第 5 轮仍未修复成功，本次 `run` 将不再尝试后续步骤，直接结束并返回非零退出码。

## 6. 进度报告与用户体验

- `run-progress.md`：
  - 文件名固定为 `run-progress.md`，位于步骤目录；
  - 在以下时机重写：
    - 解析 JSON 失败时（开头就终止）；
    - 每轮实现阶段出现写入错误；
    - 每轮单元测试失败；
    - 每轮 verification 失败；
    - 每轮验证成功后（包括 full-verify 场景）。
- 控制台：
  - 每个步骤的每一轮尝试都会打印：
    - 当前轮次（计划实现后）；
    - 状态变更（🔴/🟡/🟢）；
    - 单测命令与结果；
    - verification 验证结果；
    - 当次 run 的汇总统计。
