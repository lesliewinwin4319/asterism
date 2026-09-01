# Asterism UX 与状态设计

## 1. 视觉模型

主界面是一个四区工作面板：

```text
┌──────────────────────────┬──────────────────────────┐
│ Reference                │ Context                  │
│ 外部证据与参考素材        │ 项目事实、约束与已确认决定 │
│                          │                          │
├──────────────────────────┼──────────────────────────┤
│ Define                   │ Solutions                │
│ 请求 → 澄清 → Active Goal│ Goal → 生成 → 产物        │
│                          │                          │
└──────────────────────────┴──────────────────────────┘
```

Reference 和 Context 主要是材料区；Define 和 Solutions 主要是过程区。四区可以保持统一的空间语言，但不应强迫四区使用完全相同的卡片结构。

## 2. 全局界面元素

- 项目名称与根目录。
- 连接状态：本地服务、MCP、最近同步时间。
- Inbox：扫描到但尚未分类的文件。
- Refresh/Scan：重新扫描项目文件。
- Pending action：已经在 H5 保存、等待 Codex 处理的动作。
- 不在主面板展示完整对话、模型输出流或技术日志。

## 3. Reference / Context

### 3.1 添加方式

- 从 Inbox 拖入。
- 从文件选择器上传或选择素材。
- 粘贴 Notion Page URL。
- 从另一个区域拖入以修改分类。

### 3.2 文件卡片

最低信息：

- 文件名或页面标题。
- 类型。
- 相对路径或来源 URL。
- 最近修改/同步时间。
- 同步状态。
- 打开动作。

分类动作只修改 Board metadata。已有本地文件不移动；H5 新上传的文件可以保存到约定的 imports 目录。

## 4. Define 交互

### 4.1 空状态

```text
┌─────────────────────────────────────┐
│ Define                              │
│                                     │
│ 你希望这次解决什么问题？             │
│                                     │
│        [ Add Request / Ask ]        │
└─────────────────────────────────────┘
```

首次点击后出现一个简单输入框。此处不要求用户填写复杂模板，只收集原始 Request。

### 4.2 Request 草稿与保存

```text
┌─────────────────────────────────────┐
│ Request                             │
│ [ 用户输入的自然语言要求……       ] │
│                                     │
│                       [ Save ]      │
└─────────────────────────────────────┘
```

保存后：

- Request 写入项目状态。
- 创建 `start_define` pending action。
- H5 状态变成 `Ready in Codex`。
- 提示用户回到 Codex 调用 Asterism。
- 不自动启动 Agent。

### 4.3 Define 进程视图

H5 展示过程，不展示对话内容：

```text
Define · In progress

◉ Frame the problem           Waiting for user
○ Inspect constraints         Queued
○ Synthesize goal             Queued

Continue in Codex
```

这里的步骤名由实际工作流产生，不固定 Agent 数量，也不显示“还有 3 个问题”等对话细节。

`Frame the problem` 是例外：它是每个 Define run 固定的首个门禁，由 `socratic-asking` 驱动。用户确认问题框定（或明确要求跳过并记录未决假设）之前，后续步骤不得启动。具体问题、回答和候选框定仍只出现在 Codex。

### 4.4 Run/Agent 状态

统一使用以下状态：

| 状态 | 界面含义 |
|---|---|
| `queued` | 已计划，尚未开始 |
| `running` | 正在 Codex 中处理 |
| `waiting_user` | 等待用户在 Codex 回答或确认 |
| `completed` | 已完成并回报结果 |
| `failed` | 未能完成，可查看简短错误说明 |
| `cancelled` | 用户或主流程取消 |

状态更新发生在关键节点，不要求实时流式同步。

### 4.5 Define 完成状态

```text
Define · Ready for Solutions

Active Goal
Goal v2 · goal-v2.md

[ Open file ]  [ Revise ]  [ Set another active goal ]
```

最终内容保存在文件中，H5 只显示摘要状态和打开入口。

### 4.6 修订

- 用户可以继续在 Codex 中要求修改。
- 新结果保存为新版本或明确覆盖草稿；不得静默覆盖已确认版本。
- 修订完成后用户可以将新版本设为 Active Goal。
- 旧 Solution 保持对旧 Goal 版本的引用，不被自动改写。

## 5. Solutions 交互

### 5.1 前置条件

Solutions 主按钮只有在存在 Active Goal 时可用。若没有 Active Goal，界面引导用户先完成 Define。

### 5.2 提交生成意图

```text
┌─────────────────────────────────────┐
│ Solutions                           │
│                                     │
│ Goal: goal-v2.md                    │
│ Context: 6 selected items           │
│                                     │
│          [ Generate Solution ]      │
└─────────────────────────────────────┘
```

点击后可允许用户确认本次纳入的 Reference/Context，也可以默认使用当前标记为 included 的条目。

保存后：

- 固化本次输入快照。
- 创建 `generate_solution` pending action。
- 状态显示 `Ready in Codex`。
- 用户回到 Codex 要求 Asterism 处理。

### 5.3 生成过程

与 Define 一样，只显示流程状态：

```text
Solutions · Running

◉ Research synthesis         Running
○ Candidate generation       Queued
○ Review                     Queued
```

Agent 如何分工由 Codex 和所选 Skill 决定；面板不预先规定一定要多 Agent。

### 5.4 结果

```text
Solutions · Completed

Solution v1
2 artifacts

[ Open folder ]  [ Open primary file ]  [ Generate another ]
```

结果正文不需要复制到 H5。

## 6. Pending action 状态

```text
draft → pending → claimed → completed
                         ↘ failed
          ↘ cancelled
```

- `draft`：用户尚未保存。
- `pending`：H5 已保存，等待 Codex 读取。
- `claimed`：Asterism Skill 已接手。
- `completed`：对应操作完成。
- `failed`：处理失败，可重试。
- `cancelled`：用户取消。

同一个 pending action 必须有唯一 ID，防止重复调用 `$asterism 处理待办` 时重复执行。

## 7. 错误与恢复

- 文件被重命名或删除：卡片显示 Missing，允许重新定位或移除 metadata。
- MCP 未连接：允许继续查看已有状态，写操作置灰并说明原因。
- Codex 尚未处理：明确显示 `Waiting for Codex`，不伪装成运行中。
- Agent 失败：保留已生成文件和运行记录，允许从失败节点重试。
- 页面刷新或服务重启：从 `.asterism` 恢复，不依赖浏览器内存。
