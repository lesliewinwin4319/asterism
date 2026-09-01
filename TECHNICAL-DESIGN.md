# Asterism 技术设计

## 1. 设计原则

- Local first：项目数据和产物保存在项目文件夹。
- Explicit trigger：H5 的动作先保存，Codex 在用户触发后读取。
- File identity over file movement：用 metadata 分类，不移动已有文件。
- Shared domain layer：H5 API 和 MCP 使用同一套项目服务与校验逻辑。
- Idempotent：初始化、领取待办、登记产物都可安全重复调用。
- Recoverable：服务或浏览器关闭后能从磁盘恢复。

## 2. 推荐架构

```text
┌──────────────────┐           HTTP           ┌────────────────────────┐
│ Asterism H5      │  <────────────────────>  │ Local Asterism Service │
│ React/TypeScript │                          │ Node/TypeScript        │
└──────────────────┘                          └───────────┬────────────┘
                                                       │
                                         shared domain/storage layer
                                                       │
┌──────────────────┐           MCP            ┌─────────┴──────────────┐
│ Codex + Skill    │  <────────────────────>  │ Asterism MCP Server    │
└──────────────────┘                          └────────────────────────┘
                                                       │
                                                       ▼
                                              project/.asterism + files
```

浏览器通常不能直接作为 MCP client。因此 H5 通过本地 HTTP 服务读写；Codex 通过 MCP server 读写。两者共享实现，避免两套状态规则。

## 3. 推荐项目结构

### 3.1 Asterism 应用代码仓库

```text
asterism-app/
├── apps/
│   ├── web/                    # H5
│   └── local-service/          # HTTP + MCP 进程入口
├── packages/
│   ├── domain/                 # 类型、状态机、校验
│   ├── storage/                # JSON/文件原子写入
│   └── ui/
├── skill/asterism/             # 可安装的 Skill 包
└── tests/
```

这只是推荐拆分，不要求为追求 monorepo 而增加不必要复杂度。单仓库、单 Node 进程即可完成 MVP。

### 3.2 被初始化的用户项目

```text
user-project/
├── .asterism/
│   ├── project.json
│   ├── board.json
│   ├── actions.json
│   ├── runs.json
│   └── artifacts.json
├── asterism/
│   ├── imports/                # 仅 H5 新上传的文件
│   ├── define/                 # Define 产物
│   └── solutions/              # Solution 产物
└── ...                         # 用户原有文件，位置不变
```

`.asterism` 是机器状态；`asterism` 是用户可见的工作产物。现有文件只在 `board.json` 中引用相对路径。

## 4. 数据模型

### 4.1 Project

```ts
type AsterismProject = {
  schemaVersion: number;
  projectId: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
};
```

`rootPath` 只作为本机绑定信息使用。所有项目文件引用应存相对路径，并在服务端解析后验证仍位于根目录内。

### 4.2 Board item

```ts
type BoardSection = "inbox" | "reference" | "context" | "define" | "solutions";

type BoardItem = {
  id: string;
  kind: "local_file" | "notion_page" | "web_link" | "artifact";
  section: BoardSection;
  relativePath?: string;
  sourceUrl?: string;
  title: string;
  mimeType?: string;
  included: boolean;
  syncStatus?: "local" | "pending" | "synced" | "stale" | "failed";
  createdAt: string;
  updatedAt: string;
};
```

### 4.3 Pending action

```ts
type ActionType = "start_define" | "generate_solution" | "sync_notion";
type ActionStatus = "pending" | "claimed" | "completed" | "failed" | "cancelled";

type PendingAction = {
  id: string;
  type: ActionType;
  status: ActionStatus;
  payload: Record<string, unknown>;
  createdAt: string;
  claimedAt?: string;
  completedAt?: string;
  error?: string;
};
```

领取动作应使用 compare-and-set 语义：只有 `pending` 可变成 `claimed`。相同 ID 不得被执行两次。

### 4.4 Run 与 work unit

```ts
type WorkStatus = "queued" | "running" | "waiting_user" | "completed" | "failed" | "cancelled";

type Run = {
  id: string;
  actionId?: string;
  stage: "define" | "solutions" | "sync";
  status: WorkStatus;
  title: string;
  goalArtifactId?: string;
  inputItemIds: string[];
  units: Array<{
    id: string;
    label: string;
    status: WorkStatus;
    agentLabel?: string;
  }>;
  createdAt: string;
  updatedAt: string;
};
```

`agentLabel` 是用于用户理解的显示名称，不承诺映射到 Codex 的内部 Agent ID。

新建 `define` Run 时，服务端自动注入并置顶 `socratic_problem_framing` 工作单元，所有工作单元从 `queued` 开始。该单元完成前，服务端拒绝启动其他 Define 工作单元、登记 Define artifact 或将 Run 标记为 `completed`。是否已获得用户确认由执行 `socratic-asking` 的 Asterism 编排器负责；用户明确跳过时，编排器必须先把未决假设写入 Define handoff。

### 4.5 Artifact

```ts
type Artifact = {
  id: string;
  stage: "define" | "solutions";
  relativePath: string;
  title: string;
  version: number;
  runId: string;
  sourceGoalArtifactId?: string;
  sourceItemIds: string[];
  active: boolean;
  createdAt: string;
};
```

Define artifacts 中最多一个 `active: true`。设置新 Active Goal 应在一次原子操作中取消旧值并设置新值。

## 5. 存储策略

MVP 推荐 JSON，理由是本地单用户、便于检查、便于版本迁移。写入必须：

1. 先写同目录临时文件。
2. 校验 JSON。
3. 原子 rename 替换目标文件。
4. 使用 `schemaVersion` 支持迁移。

若后续加入多进程写入、全文索引或大型关系查询，再迁移 SQLite；不要在 MVP 同时维护 JSON 和数据库两套真源。

## 6. 文件扫描规则

默认扫描当前绑定项目根目录，并排除：

- `.git/`
- `.asterism/`
- `node_modules/`
- 常见构建与缓存目录，如 `dist/`、`build/`、`.next/`
- Asterism 服务配置中明确排除的路径

扫描产生文件索引和 Inbox 候选，不读取所有文件全文。内容只在 Codex 需要处理、用户打开或生成上下文快照时读取。

文件 identity 推荐使用相对路径加轻量 fingerprint。路径变化无法可靠确认时显示 Missing，不自行猜测新位置。

## 7. MCP 工具契约

MVP 最少需要：

| 工具 | 用途 |
|---|---|
| `asterism_initialize_project` | 在明确根目录初始化；若已存在则恢复 |
| `asterism_get_project` | 获取项目与连接状态 |
| `asterism_scan_files` | 扫描并更新 Inbox 候选 |
| `asterism_list_board` | 获取四区条目和 Active Goal |
| `asterism_classify_item` | 更新条目分类，不移动文件 |
| `asterism_list_actions` | 列出待处理动作 |
| `asterism_claim_action` | 幂等领取一个动作 |
| `asterism_complete_action` | 完成或失败动作 |
| `asterism_create_run` | 创建 Define/Solutions 运行记录 |
| `asterism_update_run` | 更新运行或 work unit 状态 |
| `asterism_register_artifact` | 登记产物文件和输入来源 |
| `asterism_set_active_goal` | 设置唯一 Active Goal |

所有写工具必须验证：

- 项目已初始化。
- 目标路径在绑定根目录内。
- action/run 状态转换合法。
- 不覆盖已有用户文件，除非调用中有明确的 overwrite 意图。

## 8. H5 API

H5 API 与 MCP 工具应调用相同 domain service。建议资源：

```text
GET    /api/project
POST   /api/project/scan
GET    /api/board
PATCH  /api/items/:id
POST   /api/requests
GET    /api/actions
POST   /api/actions
GET    /api/runs
GET    /api/artifacts
```

MVP 可在页面获得焦点时刷新，并提供手动 Refresh。若需要进度感，可对 runs 做短轮询；不需要流式传输 Agent 内容。

## 9. Codex 触发模型

```text
用户在 H5 保存 Request
        ↓
本地服务创建 pending action
        ↓
用户回到 Codex：$asterism 处理待办
        ↓
Skill 通过 MCP claim action
        ↓
Codex 对话 / 按需 Skill / 可选多 Agent
        ↓
关键节点通过 MCP 更新 run 状态
        ↓
结果写成文件并 register artifact
        ↓
H5 刷新后显示完成
```

H5 保存并不等同于向 Codex 推送。未来若增加后台 runner，应作为独立能力，不改变 action 和 run 数据模型。

## 10. Notion 流程

MVP 推荐：

1. H5 保存 Notion URL，创建 `sync_notion` action。
2. 用户在 Codex 中触发 Asterism。
3. Codex 使用当前可用的 Notion connector 读取原页面。
4. Codex/MCP 将快照保存为 Markdown 或结构化文件。
5. Board item 更新为 synced，并保留原 URL 和同步时间。

不要把 Codex 的授权 token 写入 Asterism 项目。若页面无法读取，保留 URL 并显示 failed，不用搜索结果或转载页面替代原文。

## 11. 安全边界

- 本地服务默认只监听 loopback。
- 项目根目录必须通过显式初始化确定。
- 防止 `../`、符号链接逃逸和任意绝对路径写入。
- 打开文件前再次验证实际路径仍在项目根目录。
- 上传文件名需要清理，并避免静默覆盖。
- 日志不记录文件全文、Notion token 或敏感环境变量。
- 删除操作 MVP 优先做 metadata 移除，不删除原文件。

## 12. 技术验证项

开发开始时先做三个 spike：

1. Codex 能否稳定安装并显式调用本地 Asterism Skill。
2. MCP server 能否获得或由 Skill 明确传入当前工作目录，并安全绑定项目。
3. Codex App 是否允许直接打开本地 H5；若不允许，返回 URL 作为 MVP 行为。
