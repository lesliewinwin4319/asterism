# Asterism 开发说明

## 运行要求

- Node.js 22 或更高版本。
- 当前实现无第三方运行时依赖，不需要执行 `npm install`。

## 目录

```text
src/domain/             项目绑定、路径安全、Board 与 Define 工作流状态
src/mcp-server.mjs      stdio MCP server
src/local-service.mjs   loopback HTTP 与静态 H5 server
public/                 最小四区 H5
skill/asterism/         explicit-only Codex Skill 源码
scripts/verify-spike.mjs  隔离端到端验证
test/                   Node 单元测试
```

## 本地验证

```bash
npm test
npm run spike
```

`npm run spike` 会在系统临时目录创建隔离项目，并临时监听随机 loopback 端口。结束时关闭服务并删除测试项目。

## 启动面板

目标项目必须先通过显式 Asterism 初始化。服务本身不会自动初始化：

```bash
node src/local-service.mjs --root /absolute/path/to/project --port 4317
```

打开输出的 `http://127.0.0.1:4317`。H5 与 MCP 读取目标项目内同一份 `.asterism` JSON 状态。

## Codex 开发安装

本机开发环境采用指向仓库源码的 Skill 软链接，避免复制后产生两个版本：

```bash
ln -s /absolute/path/to/Asterism/skill/asterism ~/.codex/skills/asterism
codex mcp add asterism -- node /absolute/path/to/Asterism/src/mcp-server.mjs
```

新安装的 Skill/MCP 需要在新的 Codex task 中发现。Skill 的 `agents/openai.yaml` 设置了：

```yaml
policy:
  allow_implicit_invocation: false
```

因此普通项目不会自动加载 Asterism，只有 `$asterism` 显式调用会进入该工作模式。

## 项目状态

初始化后只创建：

```text
.asterism/project.json
.asterism/board.json
.asterism/actions.json
.asterism/runs.json
.asterism/artifacts.json
asterism/imports/
asterism/define/
asterism/solutions/
```

现有文件不会因扫描或分类而移动。JSON 写入使用同目录临时文件和原子 rename；损坏或含糊的已有状态不会被静默覆盖。
