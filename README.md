# Asterism

Asterism 是一种按项目显式启用的上下文工作模式。它用一个四区可视化面板帮助用户整理项目文件、定义目标，并从已确认的材料生成解决方案。

它不是新的文件管理器，也不是 Codex 对话的替代品：

- 原始文件继续留在当前 Codex 项目文件夹中的原位置。
- Asterism 只记录文件属于 Reference、Context、Define 或 Solutions 中的哪一类。
- 用户与 Agent 的自然语言交流继续发生在 Codex。
- H5 只显示上下文结构、流程状态和产物入口，不显示 Agent 的实时思考或完整对话。
- H5 与 Codex 不做无条件实时同步；用户保存或触发动作后，Codex 通过 Asterism Skill 和 MCP 读取并处理。

## 文档入口

1. [PRD-Asterism.md](./PRD-Asterism.md)：产品目标、边界、模块和版本范围。
2. [UX-AND-STATE.md](./UX-AND-STATE.md)：四区交互、Define/Solutions 流程和状态机。
3. [TECHNICAL-DESIGN.md](./TECHNICAL-DESIGN.md)：本地架构、存储模型、MCP 契约和安全边界。
4. [ASTERISM-SKILL-SPEC.md](./ASTERISM-SKILL-SPEC.md)：显式触发 Skill 的行为与工作流编排。
5. [DEVELOPMENT-HANDOFF.md](./DEVELOPMENT-HANDOFF.md)：交给新 Codex 会话的开发顺序和验收清单。
6. [NEW-SESSION-PROMPT.md](./NEW-SESSION-PROMPT.md)：可直接交给新会话的启动指令。
7. [docs/DEVELOPMENT.md](./docs/DEVELOPMENT.md)：当前代码、启动、安装和测试说明。
8. [docs/MILESTONE-0.md](./docs/MILESTONE-0.md)：技术 spike 的验证证据与剩余限制。
9. [docs/MILESTONE-1-DEFINE.md](./docs/MILESTONE-1-DEFINE.md)：Define 闭环的实现范围与验证证据。

## 一句话架构

```text
Asterism Skill（入口与调度）
        ↓
Codex 对话与阶段性 Agent 工作
        ↕ MCP
本地 Asterism 服务（项目、文件、流程状态）
        ↕ HTTP
H5 面板（分类与进度可视化）
```

## 当前定案

- 名称：Asterism。
- 工作单位：当前 Codex 工作文件夹。
- 启用方式：显式调用 `$asterism`，不隐式触发。
- 四个区域：Reference、Context、Define、Solutions。
- 同步方式：保存/刷新/关键节点回报，不展示实时 Agent 输出流。
- 对话位置：Codex。
- 产出形式：本地文件；H5 只提供状态和文件入口。
- MVP：本地优先、单用户、无云端后台、无自动常驻 Agent。

## 不应误解为

- 不会为了分类而移动或复制项目中已有文件。
- 不会让 Codex 在 H5 保存后自动知道发生了什么；仍需用户在 Codex 中调用 Asterism 或要求处理待办。
- 不会在初始化项目后自动运行 Define 或 Solutions。
- 不会把多个子 Agent 的自然语言交流搬到 H5。
- 不会把所有项目都初始化为 Asterism 项目。

## 当前开发状态

Milestone 0 本地骨架和 Milestone 1 Define 闭环已实现：H5 可保存 Request，Codex 可通过 MCP 领取 action、登记 Run/工作单元、调用适合的 Skill 和可选多 Agent，并将版本化 Define 文件登记为唯一 Active Goal。Solutions 与 Notion 内容同步仍未实现。验证范围见 [docs/MILESTONE-1-DEFINE.md](./docs/MILESTONE-1-DEFINE.md)。
