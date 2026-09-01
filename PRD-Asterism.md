# PRD：Asterism

## 1. Summary

Asterism 是一个与 Codex 协作的本地 H5 工作面板，用四个语义区域帮助用户组织广义上下文：Reference、Context、Define、Solutions。它解决的不是模型 token 容量，而是用户无法清楚看见“有哪些材料、材料扮演什么角色、问题定义走到哪里、最终产物在哪里”的问题。

## 2. Contacts

| 角色 | 负责人 | 说明 |
|---|---|---|
| Product owner | Leslie | 产品方向、交互判断、最终验收 |
| Design/engineering agent | 新 Codex 会话 | 按本交接文档设计与开发 |
| Runtime collaborator | Codex | 对话、调用 Skill、阶段性 Agent 编排与文件产出 |

## 3. Background

用户通常以一个文件夹作为 Codex 项目的工作单位，并把相关文件放在该文件夹中。文件虽然存在，但其语义身份、当前目标、问题定义过程与结果之间的关系并不直观。

Asterism 为用户提供一层可视化语义：文件内容和位置可以不变，但用户可以说明某个文件是证据、背景、目标定义还是解决方案。对于 Define 和 Solutions，它还需要展示阶段性进度，而不是仅作为静态文件分类器。

## 4. Objective

### 4.1 产品目标

- 让用户在一个视图中理解当前项目的上下文结构。
- 让用户明确区分外部参考、项目事实、已定义目标和解决方案。
- 让 Define 从一个简单请求开始，通过 Codex 对话和按需 Skill 逐步变成可执行目标。
- 让 Solutions 基于已选择的 Reference、Context 和 Active Goal 生成可追踪的本地产物。
- 让用户只在需要的项目中启用这套工作模式。

### 4.2 MVP 成功标准

- 未调用 `$asterism` 的项目不会被创建任何 Asterism 文件。
- 首次调用能安全初始化当前项目，重复调用不覆盖已有状态。
- 用户能扫描和查看项目文件，并在四区之间分类，而不移动原文件。
- 用户能在 Define 中保存初始 Request，并在 Codex 中读取和处理。
- H5 能显示 Define/Solutions 的阶段状态和 Agent 进程卡片，但不显示对话正文。
- Define 完成后生成规范文件，并能被设为 Active Goal。
- Solutions 能基于 Active Goal 生成一个或多个本地文件并登记到面板。
- 所有写入都限制在当前已绑定的项目根目录中。

## 5. User and job

### 5.1 主要用户

使用 Codex 处理复杂项目、研究、产品设计或多阶段问题的个人用户。MVP 为本机单用户场景。

### 5.2 核心 Job

> 当我准备让 Agent 处理一个复杂项目时，我希望能看见材料分别是什么、当前问题定义到哪一步、哪些结果已经形成，从而不用只依赖聊天记录记忆整个工作状态。

## 6. Value proposition

- 对用户：把隐藏在文件夹和对话中的项目理解，转化成可见、可分类、可恢复的工作状态。
- 对 Codex：通过文件的语义身份和 Active Goal，减少读取范围不清、目标漂移和把候选方案误当既定事实的问题。
- 对项目：关键 Define 和 Solution 结果以文件保存，不依赖某一条对话是否还在上下文中。

## 7. Solution

### 7.1 四个区域

#### Reference

外部调研、案例、竞品、论文、图片、视频链接等参考证据。它们不自动代表用户立场。

主要交互：扫描已有文件、上传新素材、粘贴 Notion 链接、拖拽分类、打开原文件、移出分类。

#### Context

与当前项目直接相关的事实、约束、已有文档、已确认决定和工作背景。

主要交互与 Reference 相似。区别主要是语义身份，不是物理文件位置。

#### Define

动态的目标定义流程。首次为空，用户点击后填写最简单的 Request 或 Ask，保存后返回 Codex，由 Asterism 调用适合的 Skill 帮助完善目标。

过程中的对话仍在 Codex。H5 只显示当前阶段、运行中的工作单元、等待用户、已生成产物等状态。

#### Solutions

基于选择的 Reference、Context 和 Active Goal 生成解决方案。用户通过一个主要入口提交生成意图，再在 Codex 中触发处理。

H5 不需要渲染完整解决方案正文，只需要显示运行状态、产物名称、版本和打开文件入口。

### 7.2 同步原则

- 分类、输入、状态修改需要显式保存。
- H5 的保存动作把数据写入本地项目状态，但不会主动向一段未运行的 Codex 对话推送消息。
- 用户回到 Codex 后调用 `$asterism` 或提出明确指令，Codex 再通过 MCP 读取待办。
- Agent 运行期间只在关键节点更新 H5 状态：开始、等待用户、完成、失败或取消。
- 对话回答继续出现在 Codex；只有值得保留的结论才形成文件并登记到 H5。

### 7.3 Asterism Skill

Asterism 是全局安装、显式调用的 Skill。它不是每个项目中复制一份的应用代码。

- `$asterism 初始化当前项目`：初始化并绑定当前工作文件夹。
- `$asterism`：若未初始化则初始化；若已初始化则恢复并打开/返回面板。
- `$asterism 处理待办`：读取 H5 保存的待处理动作。
- `$asterism 开始 Define`：读取已保存 Request，进入定义流程。
- `$asterism 生成 Solutions`：检查 Active Goal 后进入解决方案流程。
- `$asterism 同步 Notion`：通过 Codex 可用的 Notion 能力读取页面，再将结果写回项目。

### 7.4 Define 最终产物

MVP 推荐使用一个 Markdown 目标定义文件，至少包含：

1. 原始 Request。
2. Problem statement。
3. Desired outcome。
4. Success criteria。
5. In scope。
6. Out of scope。
7. Constraints。
8. Confirmed facts。
9. Assumptions。
10. Open questions。
11. Relevant Reference/Context links。
12. Decision log。
13. Readiness：Draft、Needs clarification 或 Ready for Solutions。

Define 可以存在多个版本，但同一时间只能有一个 Active Goal。

### 7.5 Solutions 最终产物

Solutions 可以是一份或多份文件，不强制统一正文结构。每次运行至少登记：

- 使用的 Active Goal 版本。
- 使用的 Reference/Context 条目。
- 调用的 Skill 或工作流名称。
- 生成文件路径。
- 生成时间和运行状态。

### 7.6 明确不做

- 不展示 Agent 的 chain-of-thought 或实时 token 输出。
- 不把 Codex 对话复制到 H5。
- 不因为文件被分类而移动项目中的已有文件。
- 不在 H5 按钮点击后无条件启动后台 Agent。
- MVP 不做账号系统、多人协作、云同步、远程部署或移动端适配。
- MVP 不做通用 Notion OAuth 集成；优先复用 Codex 当前可用的 Notion 连接能力。

## 8. Release

### Phase 1：本地骨架

- 项目初始化与恢复。
- 本地状态存储。
- 文件扫描、Inbox 和四区分类。
- H5 基础面板。

### Phase 2：Define 闭环

- Request 保存。
- pending action。
- Run/Agent 状态展示。
- Define 产物登记和 Active Goal。

### Phase 3：Solutions 闭环

- 生成意图。
- 上下文快照。
- 产物登记、打开和版本追踪。
- Notion 链接同步流程。

### Future

- 后台 Agent runner。
- 多用户和共享项目。
- 云同步。
- 更强的关系图和版本差异。

## 9. Assumptions and open decisions

以下是建议默认值，开发中应保持可替换：

- H5 和 MCP 共用一个本地服务与领域层。
- MVP 使用 JSON 文件存储，而不是数据库。
- H5 通过显式刷新或短轮询获得状态；不要求 WebSocket。
- “打开面板”在不同 Codex 运行环境下可能需要返回本地 URL，而不一定能自动打开浏览器。
- Codex 多 Agent 的完整运行时状态未必有公开事件接口，因此 MVP 由 Asterism 工作流主动回报状态。

