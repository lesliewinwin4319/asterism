# Define workflow

Use this workflow only after an explicit `$asterism 处理待办` or `$asterism 开始 Define` invocation.

## Start

1. List pending actions and select one `start_define` action.
2. Claim it by action ID before analysis. Never process the same action twice.
3. Read the Board and retain the IDs of included Reference and Context items used in this run.
4. Fully read the installed `socratic-asking` Skill before beginning discovery.
5. Create a Define run with `socratic_problem_framing` as its first user-visible work unit. Start the run before discovery; keep all later units queued.

## Problem-framing gate

1. Set `socratic_problem_framing` to `running` and use `socratic-asking` to inspect available evidence and separate observations, impacts, interpretations, desired changes, and proposed solutions.
2. Interview adaptively in short rounds in Codex. Ask only the smallest useful batch and set the unit and run to `waiting_user` while awaiting each reply.
3. Present the strongest candidate problem statement, a materially different alternative when useful, and the evidence, assumptions, and important unknowns.
4. Ask the user to confirm, correct, or choose the framing. Do not invoke any other Skill, start downstream analysis, create Agent tasks, or define a goal before explicit confirmation.
5. If the user explicitly asks to skip discovery, state the unresolved framing assumption in Codex and record it in the Define handoff; this explicit direction satisfies the gate.
6. Mark `socratic_problem_framing` `completed` only after confirmation or an explicit skip. Resume the run as `running`, then begin Orchestrate.

## Orchestrate

1. Use the confirmed problem framing—not the raw Request alone—to identify the problem type, remaining uncertainty, and independent analysis tracks.
2. Select the smallest relevant set of installed Skills. Read every selected `SKILL.md` completely before using it.
3. Use `define-goal`, `model-thinking`, `grilling`, or a domain Skill when appropriate after the framing gate; `socratic-asking` is the only mandatory first Skill.
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
