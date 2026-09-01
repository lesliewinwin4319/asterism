# MCP tools

## Current tools

- `asterism_initialize_project(rootPath)`: Explicitly initialize or idempotently restore a project.
- `asterism_get_project(rootPath)`: Read the bound project and stable project ID.
- `asterism_scan_files(rootPath)`: Refresh Inbox metadata without reading file contents.
- `asterism_list_board(rootPath)`: Read Board metadata.
- `asterism_add_link(rootPath, url, section)`: Save an HTTP(S) link directly to Reference or Context metadata.
- `asterism_remove_item(rootPath, itemId)`: Remove Board metadata without deleting an underlying local file.
- `asterism_classify_item(rootPath, itemId, section)`: Change semantic classification without moving the file.
- `asterism_get_define_state(rootPath)`: Read saved Define requests, runs, artifacts, and the Active Goal.
- `asterism_list_actions(rootPath, status?)`: List workflow actions.
- `asterism_claim_action(rootPath, actionId)`: Atomically claim one pending action.
- `asterism_complete_action(rootPath, actionId, outcome, error?)`: Complete or fail a claimed action.
- `asterism_create_run(rootPath, actionId, stage, title, inputItemIds, units?)`: Create a tracked workflow run.
- `asterism_list_runs(rootPath, stage?)`: Read runs and work units.
- `asterism_update_run(rootPath, runId, status?, unit?, goalArtifactId?)`: Update key run/work-unit states.
- `asterism_list_artifacts(rootPath, stage?)`: Read registered artifacts.
- `asterism_register_artifact(rootPath, stage, relativePath, title, version, runId, sourceItemIds, sourceGoalArtifactId?)`: Register an existing verified local artifact.
- `asterism_set_active_goal(rootPath, artifactId)`: Atomically set one Define artifact as Active Goal.

Use absolute `rootPath` values. Claim actions before creating runs. Register only files that already exist inside the bound project root. Update work units before moving a run to a terminal state. Complete the action only after the run and artifact state are consistent.

## Local panel

The local service is started from the Asterism application repository:

```bash
node src/local-service.mjs --root /absolute/project/path
```

It listens on loopback and prints the panel URL to stderr. If the environment cannot open the browser, return that URL to the user.
