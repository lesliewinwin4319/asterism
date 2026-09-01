# 新会话启动 Prompt

请在当前 Asterism 仓库中开发。

开始前，完整阅读该目录下的以下文档：

- `README.md`
- `PRD-Asterism.md`
- `UX-AND-STATE.md`
- `TECHNICAL-DESIGN.md`
- `ASTERISM-SKILL-SPEC.md`
- `DEVELOPMENT-HANDOFF.md`

这些文档是当前产品和技术交接的基线。请先检查工作目录、现有文件和本机可用能力，然后用自己的话简短复述以下边界：

1. Asterism 是显式调用的项目工作模式，未调用时不能创建任何项目文件。
2. 用户已有文件保持原位置，Board 只保存分类 metadata。
3. H5 展示上下文结构和流程状态；自然语言对话留在 Codex。
4. H5 保存动作只形成 pending action，MVP 仍由用户回到 Codex 触发处理。
5. 初始化不自动运行 Define 或 Solutions。
6. Define/Solutions 的完整结果保存为本地文件，H5 只显示状态与打开入口。
7. Agent 可视化展示工作单元和关键状态，不展示实时思考流。
8. Asterism Skill 必须是 explicit-only，并且初始化、领取 action、登记产物均需幂等。

复述后，先完成 `DEVELOPMENT-HANDOFF.md` 中 Milestone 0 的技术 spike，验证以下链路是否真实可行：

```text
显式 $asterism
→ MCP 初始化当前项目
→ 本地服务读取同一项目状态
→ H5 显示同一个 project ID
```

把验证结果、实际限制和建议技术栈告诉我。若关键能力可行，再制定实现计划并开始开发第一轮最短闭环。不要擅自加入账号、云端后台、多人协作、远程队列或自动常驻 Agent。
