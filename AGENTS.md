# Repository Guidelines（仓库贡献指南）

## 项目结构与模块组织

- 核心 TypeScript 源码位于 `src/`（CLI 入口为 `src/index.ts`，辅助模块如 `src/agents.ts`、`src/project-scanner.ts` 等）。
- 测试代码位于 `tests/`，顶层为单元测试（例如 `tests/agents.test.ts`），集成 / 端到端流程放在 `tests/integration/`。
- 文档与设计说明位于 `docs/`（例如 `docs/TECH.md`、`docs/PROJECT_SURVEY.md`）。
- Claude Code 插件相关文件位于 `plugins/agent-foreman/`。

## 构建、测试与开发命令

- `npm install`：安装项目依赖。
- `npm run dev`：通过 `tsx` 从 `src/index.ts` 启动 CLI，便于本地开发调试。
- `npm run build`：编译 TypeScript 到 `dist/`，并为 `dist/index.js` 添加可执行权限。
- `npm test`：以一次性模式运行完整 Vitest 测试套件。
- `npm run test:watch`：以 watch 模式运行 Vitest，适合开发过程中持续反馈。

## 代码风格与命名约定

- 使用 TypeScript 严格模式（见 `tsconfig.json`），倾向小而清晰的模块。
- 统一使用两个空格缩进，保留分号，导入与字符串优先使用双引号，与现有文件保持一致。
- 变量 / 函数使用 `camelCase`，类型 / 接口 / 类使用 `PascalCase`，仅对真正常量使用 `SCREAMING_SNAKE_CASE`。
- 源文件文件名使用 kebab-case，例如 `ai-scanner.ts`、`file-utils.ts`。

## 测试规范

- 使用 Vitest（见 `vitest.config.ts`），测试文件放在 `tests/**/*.test.ts`；尽量保持 `src/foo.ts` 对应一个 `tests/foo.test.ts`。
- 优先编写快速单元测试；较慢或多步骤流程放在 `tests/integration/` 中。
- 覆盖率应与现有模块水平一致；修改行为时优先补充或更新测试，而不仅是在新增文件时。
- 提交 PR 前请至少运行一次 `npm test`；开发中可使用 `npm run test:watch` 保持快速反馈。

## 提交与 Pull Request 规范

- 建议遵循 `git log` 中的 Conventional Commit 风格，例如：`feat(verification): ...`、`chore: ...`、`docs(survey): ...`。
- 每个 commit 只包含一个清晰的逻辑改动或特性，避免在同一提交中混合重构与行为变更。
- PR 描述应包含：简明的变更说明、相关 issue 链接（如有）、测试说明（例如 `npm test` 结果、使用的 `agent-foreman` 命令），以及必要的文档 / 示例更新。
- 当使用本 harness 管理项目（包含本仓库）时，请将 `ai/feature_list.json` 与 `ai/progress.log` 视为特性状态的唯一权威来源；详细工作流见 `CLAUDE.md`。

## 协作流程与需求讨论（针对 AI Agent）

- 当仓库使用者提出一个「需求想法」时，AI Agent 应先协助梳理与完善需求：澄清目标、拆分子任务、补充验收标准和可能方案。
- 在使用者未明确说出「可以修改代码」之前，整个过程只允许讨论和设计方案，不得修改任何代码，也不要调用会写入文件或改变项目状态的命令。
- 使用者对方案提出修改意见后，Agent 继续基于反馈迭代需求和方案，直到双方对最终需求达成一致；只有在收到明确指令「可以修改代码」后，才能按最终确定的需求开始实现。
- 每次 Agent 基于使用者的新意见调整需求或方案后，回复中必须复述当前达成一致的完整需求（而不仅是变更点），以便双方随时确认理解完全一致。
