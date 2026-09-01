# Milestone 1 Define 闭环

验证日期：2026-09-01。

## 已实现

- Define 空状态、自然语言 Request 输入、编辑和取消。
- H5 保存 Request 后创建唯一 `start_define` pending action，并明确显示 `Ready in Codex`。
- action 的 pending、claimed、completed、failed、cancelled 状态与幂等领取。
- Define Run 与用户可见 work unit 的合法状态转换。
- 每个新 Define Run 自动加入首个 `socratic_problem_framing` 工作单元，并阻止后续单元在问题框定完成前启动。
- H5 在 Codex 处理期间显示关键工作单元状态，不显示对话或推理正文。
- Define 文件必须先真实写入 `asterism/define/`，通过路径与存在性验证后才能登记 artifact。
- Define artifact 版本和来源 item IDs；Active Goal 原子唯一。
- Asterism Skill 先完整读取并执行 `socratic-asking`；用户确认问题框定或明确跳过并记录假设后，才选择其他 Skill。复杂且可并行的 Request 可在门禁之后拆给多个 Agent，由主 Agent 汇总。
- H5 保存不会唤醒 Codex；用户回到 Codex 调用 `$asterism 处理待办` 或 `$asterism 开始 Define`。

## 自动验证

`npm test` 覆盖 Request 编辑/取消、action 幂等领取、Socratic 问题框定门禁、Run/work unit 状态、artifact 路径安全和唯一 Active Goal。

`npm run spike` 在隔离项目中验证：

```text
H5 保存 Request
→ MCP 列出并领取 pending action
→ MCP 创建 Define Run 和 work unit
→ Socratic 问题框定完成并得到用户确认
→ 本地写入版本化 Define 文件
→ MCP 登记 artifact 并设为 Active Goal
→ H5 API 读回完成状态
```

## 当前限制

- 当前已经打开的 Codex task 不一定热加载新增 MCP 工具；需要新 task 或重载连接后再验证真实 `$asterism` 编排。
- 多 Agent 的内部事件不会被自动镜像；Asterism 主流程只在关键节点主动更新用户可见 work unit。
- H5 只展示 artifact 路径，目前不在面板内渲染完整 Define 文件。
- Solutions 和 Notion 页面内容同步仍未实现。
