# Asterism 开发交接

## 1. 给新 Codex 会话的任务

在当前 Asterism 仓库中设计并实现 Asterism MVP。开始前完整阅读本目录中的全部 Markdown 文档，并将它们视为产品约束。不要直接从完整 UI 开始；先验证 Skill、MCP、项目初始化和本地服务之间的最短闭环。

## 2. 开发前必须复述的产品边界

新会话应先确认以下理解：

1. 项目以当前 Codex 工作文件夹为单位。
2. Asterism 只能通过显式 `$asterism` 启用。
3. 文件分类不改变已有文件位置。
4. H5 用于上下文分类和进度可视化，不承载对话正文。
5. H5 保存动作不会凭空唤醒 Codex；MVP 需要用户回 Codex 触发。
6. Define 和 Solutions 的内容保存在文件里。
7. Agent 状态只在关键节点更新，不做实时思考流。
8. 初始化项目不自动运行 Define 或 Solutions。

若实现方案违反任意一条，应先停止并说明取舍。

## 3. 建议开发顺序

### Milestone 0：技术 spike

- 建一个最小显式 Skill，验证 `$asterism` 调用。
- 建一个最小 MCP server，验证初始化、读写 project state。
- 建一个最小 H5 页面，验证读取同一 project state。
- 验证打开本地面板的实际体验。

完成标准：同一个项目 ID 能从 Skill/MCP 和 H5 两端读到。

### Milestone 1：项目与 Board

- 幂等初始化。
- 安全根目录验证。
- 文件扫描和排除规则。
- Inbox、Reference、Context 分类。
- 拖拽只修改 metadata。
- 页面刷新后状态可恢复。

### Milestone 2：Define

- 空状态和 Request 输入。
- 保存并创建 pending action。
- Codex 领取 action。
- run/work unit 状态更新。
- `waiting_user` 展示。
- Define 文件登记与 Active Goal。

### Milestone 3：Solutions

- Active Goal 前置校验。
- 上下文选择与输入快照。
- generation action。
- Solution 文件登记和打开入口。

### Milestone 4：Notion 与打磨

- URL 卡片。
- Codex 触发的同步流程。
- 错误、重试和 stale 状态。
- 状态文案与视觉层级。

## 4. MVP 验收场景

### A. 未启用项目

1. 进入普通项目。
2. 不调用 `$asterism`。
3. 确认没有创建 `.asterism` 或 `asterism` 目录。

### B. 首次与重复初始化

1. 调用 `$asterism 初始化当前项目`。
2. 确认结构被创建且已有文件未变化。
3. 修改 Board 分类。
4. 再次调用 `$asterism`。
5. 确认分类保留、文件未覆盖、project ID 不变。

### C. 文件分类

1. 扫描一个包含 MD、图片和其他文件的项目。
2. 将文件从 Inbox 拖到 Reference/Context。
3. 确认磁盘相对路径不变。
4. 重启服务后确认分类恢复。

### D. Define 闭环

1. 在空 Define 中保存一句 Request。
2. H5 显示 Waiting for Codex。
3. 在 Codex 调用 `$asterism 处理待办`。
4. H5 依次显示 running、waiting_user 和 completed 等关键状态。
5. 问答只出现在 Codex。
6. 目标文件生成并可设为 Active Goal。

### E. Solutions 闭环

1. 无 Active Goal 时生成按钮不可执行并说明原因。
2. 设置 Active Goal 后提交生成意图。
3. Codex 处理 action。
4. 结果文件落盘，H5 显示产物入口。
5. 记录能追溯到使用的 Goal 和上下文条目。

### F. 安全与错误

1. 尝试使用 `../` 写出项目根目录，必须拒绝。
2. 删除一个已分类文件，H5 显示 Missing，不崩溃。
3. 重复领取同一 action，不得重复执行。
4. 中断服务后重启，run/action 状态仍可恢复。
5. 状态文件损坏时不静默覆盖。

## 5. 开发纪律

- 先做窄的纵向闭环，再扩展界面。
- 不擅自加入账号、云数据库、远程队列、分析埋点或多人权限。
- 不把“实时 Agent 可视化”扩展成 chain-of-thought 展示。
- 不假设 H5 能主动向 Codex 推送；必须用 spike 验证产品边界。
- 不修改用户文件来实现分类。
- 对尚未验证的 Codex/MCP 能力明确标记，不用 UI 假装已经支持。

## 6. 需要提交的开发文档

实现过程中补充：

- 本地启动说明。
- Skill 安装说明。
- MCP 配置说明。
- 数据 schema 与迁移说明。
- 已验证能力与限制。
- 自动化测试和手工验收结果。

## 7. 第一轮应交付什么

第一轮不要追求最终视觉。应交付一个可以演示的最短闭环：

```text
$asterism 初始化项目
→ H5 看见 Inbox
→ 拖动一个文件到 Reference
→ 保存一句 Request
→ Codex 读取 pending action
→ 更新一次 Define 状态
→ 写出一个 Define 文件
→ H5 显示文件入口
```

这个闭环通过后，再进入完整四区视觉设计和 Solutions。
