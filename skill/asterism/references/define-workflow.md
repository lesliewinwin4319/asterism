# Define workflow

Use this workflow only after an explicit `$asterism 处理待办` or `$asterism 开始 Define` invocation.

## Start

1. List pending actions and select one `start_define` action.
2. Claim it by action ID before analysis. Never process the same action twice.
3. Read the Board and retain the IDs of included Reference and Context items used in this run.
4. Create a Define run with user-visible work units. Start the run before substantive analysis.

## Orchestrate

1. Interpret the Request and identify the problem type, uncertainty, and independent analysis tracks.
2. Select the smallest relevant set of installed Skills. Read every selected `SKILL.md` completely before using it.
3. Use `define-goal`, `model-thinking`, `grilling`, or a domain Skill when appropriate; do not hard-code a single child Skill for every Request.
4. For a complex Request with at least two independent tracks, create distinct work units and delegate them to multiple sub-agents. Give each agent a bounded deliverable and the relevant Request/Board context.
5. Update work-unit status only at key transitions: queued, running, waiting_user, completed, failed, or cancelled. Agent labels are user-facing roles, not internal IDs.
6. Keep questions and answers in Codex. Before asking the user, mark the relevant unit and run `waiting_user`; resume them as `running` after the reply.
7. The main agent reconciles conflicts, separates facts from assumptions, and owns the final synthesis.

## Finish

1. Read [define-output.md](define-output.md) and write a new versioned Markdown file under `asterism/define/`.
2. Never overwrite an existing Define file. Read back the saved file and verify its readiness and key fields.
3. Register the artifact with the exact run ID and source Reference/Context item IDs.
4. If readiness is `Ready for Solutions`, set it as the unique Active Goal. Otherwise leave it inactive.
5. Complete the run, then complete the claimed action. On failure, preserve existing files, mark the run/action failed, and report the concise cause in Codex.

The H5 panel is a status surface. Do not copy the analysis transcript, agent reasoning, or full Define document into it.
