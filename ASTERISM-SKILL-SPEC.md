# Asterism Skill 规范

## 1. 定位

Asterism Skill 是项目工作模式的入口和调度器。它负责初始化、读取面板待办、选择阶段工作流、报告状态和登记产物；H5 代码和本地服务不应被复制到每个项目中。

Skill 建议命名：`asterism`。

必须设置为仅显式调用：

```yaml
policy:
  allow_implicit_invocation: false
```

这样只有用户使用 `$asterism` 时才启用，不会污染普通项目。

## 2. 调用语义

### `$asterism`

- 当前项目未初始化：初始化项目、扫描文件、启动或连接本地服务，并提供面板入口。
- 当前项目已初始化：读取状态、连接服务，并提供面板入口。
- 不自动进入 Define 或 Solutions。

### `$asterism 初始化当前项目`

- 将当前 Codex 工作文件夹作为项目根目录。
- 如果当前目录不明确或范围明显过大，停止并询问用户。
- 创建标准目录和状态文件。
- 不修改、移动或删除原有项目文件。

### `$asterism 处理待办`

- 列出 pending actions。
- 若只有一个，可领取并处理。
- 若多个动作会产生不同结果，先向用户确认处理范围。
- 使用 action ID 幂等领取，禁止重复执行。

### `$asterism 开始 Define`

- 检查是否存在已保存 Request。
- 创建 define run。
- 按请求复杂度选择 `model-thinking`、`define-goal`、`grilling` 或其他适合的 Skill。
- 可以将独立、并行的分析拆给多个 Agent，但不为了展示而强制多 Agent。
- 与用户的问答留在 Codex。
- 通过 MCP 回报关键状态。
- 形成 Define 文件，登记 artifact；达到标准后允许设为 Active Goal。

### `$asterism 生成 Solutions`

- 必须存在 Active Goal。
- 固化本次使用的 Reference/Context item IDs 和 Goal artifact ID。
- 根据任务类型选择适合的 Skill。
- 产出写入本地文件，并登记 artifact。
- 不把完整内容复制进 H5。

### `$asterism 同步 Notion`

- 读取 pending Notion URL。
- 使用 Codex 可用的原始 Notion 页面连接能力。
- 保存快照，登记来源和同步时间。
- 无法读取时明确失败，不使用搜索替代原页面。

## 3. 初始化幂等性

首次调用：

```text
detect project root
→ validate root
→ create .asterism safely
→ create user artifact folders
→ write project identity
→ scan
→ bind/open
```

重复调用：

```text
detect existing .asterism
→ validate schema and root
→ migrate only if supported
→ never overwrite state silently
→ bind/open
```

如果状态损坏，应先报告并备份损坏文件，再提出修复；不应把项目当作全新项目覆盖。

## 4. Define 工作规范

Define 的目的不是给出解决方案，而是形成足以指导 Solutions 的 Active Goal。

Ready for Solutions 至少满足：

- 问题和期望结果清楚。
- 成功标准可以判断。
- 范围内/范围外已说明。
- 关键约束已记录。
- 重要假设与未决问题没有被伪装成事实。
- 使用的 Reference/Context 可追踪。

当需要用户回答时：

1. 将对应 work unit 更新为 `waiting_user`。
2. 在 Codex 中自然提问。
3. 不把具体问题数量或回答正文写入 H5 状态。
4. 用户回答后继续，并更新为 `running`。

## 5. 多 Agent 可视化约定

- H5 展示的是工作单元，而不是 Codex 内部实现细节。
- 每个工作单元有 label、status 和可选 agentLabel。
- Asterism 在创建或分派工作时登记，在 Agent 返回、失败或等待时更新。
- 不要求实时 token 流。
- 如果运行时无法提供内部 Agent ID，使用 Asterism 生成的稳定 work unit ID。
- 单 Agent 足够时允许只有一个工作单元。

## 6. 结果保存约定

默认路径：

```text
asterism/define/<slug>-vN.md
asterism/solutions/<slug>-vN.md
```

写入前：

- 检查目标是否已存在。
- 新版本默认递增，不静默覆盖。
- 写完后重新读取关键字段，确认文件存在且可解析。
- 再调用 MCP 登记 artifact。

## 7. Skill 不负责

- 持续监听所有项目。
- 在未调用时扫描或创建文件。
- 在 H5 中复制 Codex 对话。
- 绕过用户启动后台长期任务。
- 把每个阶段固定到某一个子 Skill。
- 替代具体领域 Skill 的判断和执行。

## 8. 推荐 Skill 包结构

```text
asterism/
├── SKILL.md
├── agents/
│   └── openai.yaml
└── references/
    ├── define-output.md
    ├── mcp-tools.md
    └── state-transitions.md
```

`SKILL.md` 保持短小，只放触发、路由和硬约束；详细 schema 和模板放在 references，按需读取。

