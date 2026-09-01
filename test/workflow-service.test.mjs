import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initializeProject, listBoard } from "../src/domain/project-service.mjs";
import {
  DEFINE_FRAMING_UNIT_ID,
  cancelAction,
  claimAction,
  completeAction,
  createRequest,
  createRun,
  getDefineState,
  listActions,
  registerArtifact,
  setActiveGoal,
  updateRequest,
  updateRun
} from "../src/domain/workflow-service.mjs";

async function fixture(t) {
  const rootPath = await mkdtemp(join(tmpdir(), "asterism-workflow-test-"));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  await initializeProject(rootPath);
  return rootPath;
}

test("a pending Define request can be edited or cancelled before Codex claims it", async (t) => {
  const rootPath = await fixture(t);
  const created = await createRequest(rootPath, "  Understand the project  ");
  const updated = await updateRequest(rootPath, created.action.id, "Define a measurable project goal");
  const pending = await listActions(rootPath, "pending");

  assert.equal(created.action.payload.request, "Understand the project");
  assert.equal(updated.action.payload.request, "Define a measurable project goal");
  assert.equal(pending.actions.length, 1);
  await assert.rejects(() => createRequest(rootPath, "A competing request"), {
    code: "DEFINE_REQUEST_ACTIVE"
  });

  const cancelled = await cancelAction(rootPath, created.action.id);
  assert.equal(cancelled.action.status, "cancelled");
  assert.equal((await listActions(rootPath, "pending")).actions.length, 0);
});

test("Define request flows through claim, tracked work, artifact, and Active Goal", async (t) => {
  const rootPath = await fixture(t);
  const request = await createRequest(rootPath, "Turn the request into a decision-ready goal");
  const claimed = await claimAction(rootPath, request.action.id);
  assert.equal(claimed.action.status, "claimed");
  await assert.rejects(() => claimAction(rootPath, request.action.id), { code: "ACTION_NOT_PENDING" });
  await assert.rejects(() => updateRequest(rootPath, request.action.id, "Too late"), {
    code: "ACTION_NOT_EDITABLE"
  });

  const createdRun = await createRun(rootPath, {
    actionId: request.action.id,
    stage: "define",
    title: "Define project goal",
    inputItemIds: [],
    units: [
      { id: "understand", label: "Understand request" },
      { id: "synthesize", label: "Synthesize goal" }
    ]
  });
  const runId = createdRun.run.id;
  assert.equal(createdRun.run.units[0].id, DEFINE_FRAMING_UNIT_ID);
  await updateRun(rootPath, runId, { status: "running" });
  await assert.rejects(
    () => updateRun(rootPath, runId, {
      unit: { id: "understand", status: "running", agentLabel: "Analysis" }
    }),
    { code: "PROBLEM_FRAMING_REQUIRED" }
  );
  await assert.rejects(
    () => updateRun(rootPath, runId, { status: "completed" }),
    { code: "PROBLEM_FRAMING_REQUIRED" }
  );
  await updateRun(rootPath, runId, {
    unit: { id: DEFINE_FRAMING_UNIT_ID, status: "running" }
  });
  await updateRun(rootPath, runId, {
    unit: { id: DEFINE_FRAMING_UNIT_ID, status: "waiting_user" }
  });
  await updateRun(rootPath, runId, { status: "waiting_user" });
  await updateRun(rootPath, runId, {
    unit: { id: DEFINE_FRAMING_UNIT_ID, status: "completed" }
  });
  await updateRun(rootPath, runId, { status: "running" });
  await updateRun(rootPath, runId, { unit: { id: "understand", status: "running", agentLabel: "Analysis" } });
  await updateRun(rootPath, runId, { unit: { id: "understand", status: "completed" } });
  await updateRun(rootPath, runId, { unit: { id: "synthesize", status: "running" } });
  await updateRun(rootPath, runId, { unit: { id: "synthesize", status: "completed" } });

  const artifactRelativePath = "asterism/define/project-goal-v1.md";
  await writeFile(
    join(rootPath, artifactRelativePath),
    "# Project goal\n\nReadiness: Ready for Solutions\n"
  );
  const registered = await registerArtifact(rootPath, {
    stage: "define",
    relativePath: artifactRelativePath,
    title: "Project goal",
    version: 1,
    runId,
    sourceItemIds: []
  });
  const activated = await setActiveGoal(rootPath, registered.artifact.id);
  await updateRun(rootPath, runId, {
    status: "completed",
    goalArtifactId: registered.artifact.id
  });
  await completeAction(rootPath, request.action.id, "completed");

  const state = await getDefineState(rootPath);
  const board = await listBoard(rootPath);
  assert.equal(activated.artifact.active, true);
  assert.equal(state.actions[0].status, "completed");
  assert.equal(state.runs[0].status, "completed");
  assert.equal(state.activeGoal.id, registered.artifact.id);
  assert.equal(board.activeGoal.relativePath, artifactRelativePath);
});

test("artifact registration rejects missing files and paths outside the stage folder", async (t) => {
  const rootPath = await fixture(t);
  const request = await createRequest(rootPath, "Define a goal");
  await claimAction(rootPath, request.action.id);
  const run = await createRun(rootPath, {
    actionId: request.action.id,
    stage: "define",
    title: "Define",
    inputItemIds: []
  });

  assert.equal(run.run.units[0].id, DEFINE_FRAMING_UNIT_ID);

  await assert.rejects(() => registerArtifact(rootPath, {
    stage: "define",
    relativePath: "asterism/solutions/wrong.md",
    title: "Wrong",
    version: 1,
    runId: run.run.id,
    sourceItemIds: []
  }), { code: "INVALID_ARTIFACT_PATH" });
  await assert.rejects(() => registerArtifact(rootPath, {
    stage: "define",
    relativePath: "asterism/define/missing.md",
    title: "Missing",
    version: 1,
    runId: run.run.id,
    sourceItemIds: []
  }), { code: "FILE_NOT_FOUND" });
});

test("new Define runs cannot bypass the Socratic gate with pre-completed units", async (t) => {
  const rootPath = await fixture(t);
  const request = await createRequest(rootPath, "Jump straight to a solution");
  await claimAction(rootPath, request.action.id);
  const created = await createRun(rootPath, {
    actionId: request.action.id,
    stage: "define",
    title: "Define safely",
    inputItemIds: [],
    units: [
      { id: "analysis", label: "Analyze", status: "running" },
      { id: DEFINE_FRAMING_UNIT_ID, label: "Bypass", status: "completed" }
    ]
  });

  assert.deepEqual(
    created.run.units.map(({ id, status }) => ({ id, status })),
    [
      { id: DEFINE_FRAMING_UNIT_ID, status: "queued" },
      { id: "analysis", status: "queued" }
    ]
  );

  const artifactRelativePath = "asterism/define/unframed-v1.md";
  await writeFile(join(rootPath, artifactRelativePath), "# Unframed\n");
  await assert.rejects(() => registerArtifact(rootPath, {
    stage: "define",
    relativePath: artifactRelativePath,
    title: "Unframed",
    version: 1,
    runId: created.run.id,
    sourceItemIds: []
  }), { code: "PROBLEM_FRAMING_REQUIRED" });
});
