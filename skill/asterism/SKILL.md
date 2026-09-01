---
name: asterism
description: Explicitly initialize, resume, scan, or organize a local Asterism project. Use only when the user invokes $asterism; do not activate for ordinary project work.
---

# Asterism

Asterism is an explicit-only local project mode. Before mutating a project, read [references/product-boundaries.md](references/product-boundaries.md). Use the registered `asterism` MCP tools according to [references/mcp-tools.md](references/mcp-tools.md).

## Route the invocation

- With no subcommand, initialize the current project if needed; otherwise restore its state. Scan files and give the user the local panel URL. Do not start Define or Solutions.
- For `初始化当前项目`, confirm the intended Codex working folder is specific enough, then initialize and scan it.
- For `处理待办`, list pending actions. Claim exactly one action by ID before doing work. If several actions could lead to different results, ask which to process. Route `start_define` through [references/define-workflow.md](references/define-workflow.md).
- For `开始 Define`, find the saved pending `start_define` action, claim it, and follow [references/define-workflow.md](references/define-workflow.md). If no saved Request exists, tell the user to save one in the panel.
- For file organization, list the Board and change metadata only. Never move, copy, rename, or delete an existing project file.
- If a required MCP tool is unavailable in the current Codex session, state that the connector must be reloaded; do not simulate a claimed action, run, artifact, or Active Goal.

Treat every explicit project path as untrusted input. Pass an absolute root to MCP and preserve its returned `projectId`. Repeated initialization must retain the same project identity and existing classifications.

H5 actions do not wake Codex. Keep natural-language discussion in Codex and show only project structure, work-unit status, and artifact entry points in the panel.

For every claimed Define request, Asterism is the orchestrator. It must first fully read and run the installed `socratic-asking` Skill. Treat the submitted Request as an initial hypothesis and do not invoke another Skill, start analysis, delegate to sub-agents, or define a goal until the user confirms the problem framing. If the user explicitly asks to skip discovery, state and record the unresolved assumption before continuing. After that gate is complete, inspect the confirmed framing and selected Reference/Context, choose and fully read the smallest relevant set of installed Skill instructions, and use those Skills in the analysis. When a complex Request contains two or more independent analysis tracks, register user-visible work units and delegate those tracks to multiple sub-agents; do not force multi-agent work for a simple Request. Synthesize all results in the main Codex conversation and never expose chain-of-thought in H5.
