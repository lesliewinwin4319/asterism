# Milestone 0 验证结果

验证日期：2026-09-01。

## 已实现

- 零第三方依赖的 Node/ESM 工程骨架。
- 显式、幂等的项目初始化；重复调用保留 `projectId`。
- `.asterism` JSON 状态与 `asterism` 用户产物目录。
- 文件扫描、Inbox、Reference/Context 分类 metadata。
- 原子 JSON 写入和 schema version 检查。
- 路径 traversal、文件系统根目录、符号链接逃逸和含糊状态拒绝。
- loopback HTTP/H5 服务；启动服务本身不初始化项目。
- stdio MCP server 和 5 个 Milestone 0 工具。
- explicit-only Asterism Skill 包。

## 自动验证

`npm test`：4 个测试通过。

1. 初始化显式且幂等。
2. 扫描和分类不改变原文件。
3. `../` 和不完整 `.asterism` 状态被拒绝。
4. 指向根目录外的 `asterism` 符号链接在写入状态前被拒绝。

`npm run spike`：端到端通过。

```text
本地服务启动，不产生初始化副作用
→ stdio MCP initialize 握手
→ MCP 显式初始化隔离项目
→ MCP 扫描文件
→ HTTP/H5 API 读取同一 projectId 和 Inbox
→ HTTP 修改 Reference 分类
→ MCP 读取到相同分类
→ 原文件路径与内容保持不变
```

本机 Codex 配置已能读回启用状态的 `asterism` stdio MCP；本地 Skill 已通过开发软链接安装，且 YAML、名称、frontmatter 和未完成占位检查通过。

## 已知限制

- 当前正在运行的 Codex task 不会热加载刚安装的 Skill/MCP。实际 `$asterism` UI 调用需要在下一次 task 中验证。
- Codex App 是否能由工作流直接打开 loopback 页面尚未验证；返回 URL 是当前可靠回退。
- `skill-creator` 自带的 Python 校验器因本机运行时缺少 PyYAML 无法直接执行；已使用系统 Ruby YAML 解析器完成等价的结构检查。
- Pending action、Define、Solutions、run/work unit 和 artifact API 尚未实现，不能模拟为已完成。
- 当前 H5 是技术 spike 界面，不是最终视觉或完整交互。

## 下一步

进入 Milestone 1：补齐更严格的 Board schema、持久化缺失文件状态、拖拽分类交互和浏览器级验收；随后再进入 Define pending-action 闭环。
