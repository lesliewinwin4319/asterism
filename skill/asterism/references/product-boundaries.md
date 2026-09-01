# Product boundaries

- Asterism is enabled per project only through an explicit `$asterism` invocation.
- The project unit is the current, explicitly selected Codex working folder.
- Initialization must not start Define or Solutions.
- Existing files remain in place; Board sections are metadata.
- H5 displays structure and key workflow states. Conversation remains in Codex.
- Saving in H5 creates local state only; it cannot wake an inactive Codex task.
- Define and Solutions results are local files. Do not copy full results into H5.
- Do not expose chain-of-thought, live token output, or internal Agent implementation details.
- MVP is local and single-user. Do not add accounts, cloud state, remote queues, analytics, or an always-on Agent.
- All writes must remain inside the bound project root. Reject traversal and symbolic-link escapes.
