import { randomUUID } from "node:crypto";
import { lstat } from "node:fs/promises";
import { join } from "node:path";
import { AsterismError } from "./errors.mjs";
import { getProject, SCHEMA_VERSION } from "./project-service.mjs";
import { resolveProjectPath } from "./paths.mjs";
import { atomicWriteJson, readJson } from "./storage.mjs";

const ACTION_TYPES = new Set(["start_define", "generate_solution", "sync_notion"]);
const ACTION_STATUSES = new Set(["pending", "claimed", "completed", "failed", "cancelled"]);
const RUN_STAGES = new Set(["define", "solutions", "sync"]);
const WORK_STATUSES = new Set([
  "queued",
  "running",
  "waiting_user",
  "completed",
  "failed",
  "cancelled"
]);
const TERMINAL_WORK_STATUSES = new Set(["completed", "failed", "cancelled"]);
export const DEFINE_FRAMING_UNIT_ID = "socratic_problem_framing";
const DEFINE_FRAMING_UNIT = {
  id: DEFINE_FRAMING_UNIT_ID,
  label: "Frame the problem with Socratic Asking",
  status: "queued",
  agentLabel: "socratic-asking"
};
const WORK_TRANSITIONS = {
  queued: new Set(["running", "failed", "cancelled"]),
  running: new Set(["waiting_user", "completed", "failed", "cancelled"]),
  waiting_user: new Set(["running", "completed", "failed", "cancelled"]),
  completed: new Set(),
  failed: new Set(),
  cancelled: new Set()
};

function timestamp() {
  return new Date().toISOString();
}

function collectionPath(rootPath, name) {
  return join(rootPath, ".asterism", `${name}.json`);
}

async function loadCollection(rootPath, name, key) {
  const document = await readJson(collectionPath(rootPath, name));
  if (!document || document.schemaVersion !== SCHEMA_VERSION || !Array.isArray(document[key])) {
    throw new AsterismError("UNSUPPORTED_SCHEMA", `${name}.json has an unsupported schema.`);
  }
  return document;
}

function requiredText(value, label, maximumLength = 20_000) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AsterismError("INVALID_INPUT", `${label} is required.`);
  }
  const normalized = value.trim();
  if (normalized.length > maximumLength) {
    throw new AsterismError("INVALID_INPUT", `${label} is too long.`);
  }
  return normalized;
}

function validateWorkStatus(status, label = "Work status") {
  if (!WORK_STATUSES.has(status)) {
    throw new AsterismError("INVALID_WORK_STATUS", `${label} is invalid: ${status}`);
  }
}

function assertWorkTransition(current, next, label) {
  validateWorkStatus(next, label);
  if (current === next) return;
  if (!WORK_TRANSITIONS[current]?.has(next)) {
    throw new AsterismError(
      "INVALID_STATE_TRANSITION",
      `${label} cannot move from ${current} to ${next}.`
    );
  }
}

function normalizeIds(values, label) {
  if (values === undefined) return [];
  if (!Array.isArray(values) || values.some((value) => typeof value !== "string" || !value)) {
    throw new AsterismError("INVALID_INPUT", `${label} must be an array of IDs.`);
  }
  return [...new Set(values)];
}

export async function createRequest(rootInput, requestText) {
  const project = await getProject(rootInput);
  const actions = await loadCollection(project.rootPath, "actions", "actions");
  const active = actions.actions.find(
    (action) => action.type === "start_define" && ["pending", "claimed"].includes(action.status)
  );
  if (active) {
    throw new AsterismError(
      "DEFINE_REQUEST_ACTIVE",
      "A Define request is already waiting or in progress. Complete or cancel it first."
    );
  }

  const now = timestamp();
  const action = {
    id: randomUUID(),
    type: "start_define",
    status: "pending",
    payload: { request: requiredText(requestText, "Request") },
    createdAt: now,
    updatedAt: now
  };
  actions.actions.push(action);
  actions.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "actions"), actions);
  return { projectId: project.projectId, action };
}

export async function updateRequest(rootInput, actionId, requestText) {
  const project = await getProject(rootInput);
  const actions = await loadCollection(project.rootPath, "actions", "actions");
  const action = actions.actions.find(
    (candidate) => candidate.id === actionId && candidate.type === "start_define"
  );
  if (!action) throw new AsterismError("ACTION_NOT_FOUND", `Define request not found: ${actionId}`);
  if (action.status !== "pending") {
    throw new AsterismError("ACTION_NOT_EDITABLE", "Only a pending Define request can be edited.");
  }

  const now = timestamp();
  action.payload.request = requiredText(requestText, "Request");
  action.updatedAt = now;
  actions.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "actions"), actions);
  return { projectId: project.projectId, action };
}

export async function listActions(rootInput, status = undefined) {
  const project = await getProject(rootInput);
  if (status !== undefined && !ACTION_STATUSES.has(status)) {
    throw new AsterismError("INVALID_ACTION_STATUS", `Unknown action status: ${status}`);
  }
  const actions = await loadCollection(project.rootPath, "actions", "actions");
  const selected = status
    ? actions.actions.filter((action) => action.status === status)
    : actions.actions;
  return { projectId: project.projectId, actions: selected, updatedAt: actions.updatedAt };
}

export async function claimAction(rootInput, actionId) {
  const project = await getProject(rootInput);
  const actions = await loadCollection(project.rootPath, "actions", "actions");
  const action = actions.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new AsterismError("ACTION_NOT_FOUND", `Action not found: ${actionId}`);
  if (action.status !== "pending") {
    throw new AsterismError(
      "ACTION_NOT_PENDING",
      `Action ${actionId} is ${action.status} and cannot be claimed again.`
    );
  }

  const now = timestamp();
  action.status = "claimed";
  action.claimedAt = now;
  action.updatedAt = now;
  actions.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "actions"), actions);
  return { projectId: project.projectId, action };
}

export async function completeAction(rootInput, actionId, outcome, error = undefined) {
  if (!["completed", "failed"].includes(outcome)) {
    throw new AsterismError("INVALID_ACTION_STATUS", "Action outcome must be completed or failed.");
  }
  const project = await getProject(rootInput);
  const actions = await loadCollection(project.rootPath, "actions", "actions");
  const action = actions.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new AsterismError("ACTION_NOT_FOUND", `Action not found: ${actionId}`);
  if (action.status !== "claimed") {
    throw new AsterismError(
      "INVALID_STATE_TRANSITION",
      `Only a claimed action can be marked ${outcome}.`
    );
  }

  const now = timestamp();
  action.status = outcome;
  action.completedAt = now;
  action.updatedAt = now;
  if (outcome === "failed") action.error = requiredText(error, "Failure reason", 2_000);
  else delete action.error;
  actions.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "actions"), actions);
  return { projectId: project.projectId, action };
}

export async function cancelAction(rootInput, actionId) {
  const project = await getProject(rootInput);
  const actions = await loadCollection(project.rootPath, "actions", "actions");
  const action = actions.actions.find((candidate) => candidate.id === actionId);
  if (!action) throw new AsterismError("ACTION_NOT_FOUND", `Action not found: ${actionId}`);
  if (action.status !== "pending") {
    throw new AsterismError("INVALID_STATE_TRANSITION", "Only a pending action can be cancelled here.");
  }

  const now = timestamp();
  action.status = "cancelled";
  action.completedAt = now;
  action.updatedAt = now;
  actions.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "actions"), actions);
  return { projectId: project.projectId, action };
}

function normalizeUnits(units = []) {
  if (!Array.isArray(units)) {
    throw new AsterismError("INVALID_INPUT", "Run units must be an array.");
  }
  const seen = new Set();
  return units.map((unit) => {
    const id = unit.id || randomUUID();
    if (seen.has(id)) throw new AsterismError("INVALID_INPUT", `Duplicate work unit ID: ${id}`);
    seen.add(id);
    const status = unit.status ?? "queued";
    validateWorkStatus(status, "Work unit status");
    return {
      id,
      label: requiredText(unit.label, "Work unit label", 200),
      status,
      ...(unit.agentLabel ? { agentLabel: requiredText(unit.agentLabel, "Agent label", 120) } : {})
    };
  });
}

export async function createRun(rootInput, input) {
  const project = await getProject(rootInput);
  if (!RUN_STAGES.has(input?.stage)) {
    throw new AsterismError("INVALID_RUN_STAGE", `Unknown run stage: ${input?.stage}`);
  }
  const actions = await loadCollection(project.rootPath, "actions", "actions");
  if (input.actionId) {
    const action = actions.actions.find((candidate) => candidate.id === input.actionId);
    if (!action) throw new AsterismError("ACTION_NOT_FOUND", `Action not found: ${input.actionId}`);
    if (action.status !== "claimed") {
      throw new AsterismError("INVALID_STATE_TRANSITION", "A run requires a claimed action.");
    }
  }

  const inputItemIds = normalizeIds(input.inputItemIds, "Input item IDs");
  const board = await readJson(collectionPath(project.rootPath, "board"));
  const boardIds = new Set(board.items.map((item) => item.id));
  const unknownItem = inputItemIds.find((id) => !boardIds.has(id));
  if (unknownItem) throw new AsterismError("ITEM_NOT_FOUND", `Board item not found: ${unknownItem}`);

  const runs = await loadCollection(project.rootPath, "runs", "runs");
  const now = timestamp();
  const units = normalizeUnits(input.units);
  if (input.stage === "define") {
    for (const unit of units) unit.status = "queued";
    const framingIndex = units.findIndex((unit) => unit.id === DEFINE_FRAMING_UNIT_ID);
    if (framingIndex === -1) units.unshift({ ...DEFINE_FRAMING_UNIT });
    else {
      const [framing] = units.splice(framingIndex, 1);
      units.unshift({ ...framing, ...DEFINE_FRAMING_UNIT });
    }
  }
  const run = {
    id: randomUUID(),
    ...(input.actionId ? { actionId: input.actionId } : {}),
    stage: input.stage,
    status: "queued",
    title: requiredText(input.title, "Run title", 200),
    inputItemIds,
    units,
    createdAt: now,
    updatedAt: now
  };
  runs.runs.push(run);
  runs.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "runs"), runs);
  return { projectId: project.projectId, run };
}

export async function listRuns(rootInput, stage = undefined) {
  const project = await getProject(rootInput);
  if (stage !== undefined && !RUN_STAGES.has(stage)) {
    throw new AsterismError("INVALID_RUN_STAGE", `Unknown run stage: ${stage}`);
  }
  const runs = await loadCollection(project.rootPath, "runs", "runs");
  return {
    projectId: project.projectId,
    runs: stage ? runs.runs.filter((run) => run.stage === stage) : runs.runs,
    updatedAt: runs.updatedAt
  };
}

export async function updateRun(rootInput, runId, patch = {}) {
  const project = await getProject(rootInput);
  const runs = await loadCollection(project.rootPath, "runs", "runs");
  const run = runs.runs.find((candidate) => candidate.id === runId);
  if (!run) throw new AsterismError("RUN_NOT_FOUND", `Run not found: ${runId}`);

  if (patch.status !== undefined) {
    const framing = run.units.find((unit) => unit.id === DEFINE_FRAMING_UNIT_ID);
    if (run.stage === "define" && patch.status === "completed" && framing?.status !== "completed") {
      throw new AsterismError(
        "PROBLEM_FRAMING_REQUIRED",
        "A Define run cannot complete before Socratic problem framing is completed."
      );
    }
    assertWorkTransition(run.status, patch.status, "Run status");
    run.status = patch.status;
  }
  if (patch.unit !== undefined) {
    if (TERMINAL_WORK_STATUSES.has(run.status)) {
      throw new AsterismError("INVALID_STATE_TRANSITION", "A terminal run cannot update work units.");
    }
    const incoming = patch.unit;
    let unit = incoming.id
      ? run.units.find((candidate) => candidate.id === incoming.id)
      : undefined;
    if (incoming.id && !unit) {
      throw new AsterismError("WORK_UNIT_NOT_FOUND", `Work unit not found: ${incoming.id}`);
    }
    const framing = run.units.find((candidate) => candidate.id === DEFINE_FRAMING_UNIT_ID);
    const startsWork = incoming.status !== undefined && incoming.status !== "queued";
    if (
      run.stage === "define" &&
      unit?.id !== DEFINE_FRAMING_UNIT_ID &&
      startsWork &&
      framing?.status !== "completed"
    ) {
      throw new AsterismError(
        "PROBLEM_FRAMING_REQUIRED",
        "Complete Socratic problem framing before starting later Define work."
      );
    }
    if (!unit) {
      unit = normalizeUnits([incoming])[0];
      run.units.push(unit);
    } else {
      if (incoming.status !== undefined) {
        assertWorkTransition(unit.status, incoming.status, "Work unit status");
        unit.status = incoming.status;
      }
      if (incoming.label !== undefined) {
        unit.label = requiredText(incoming.label, "Work unit label", 200);
      }
      if (incoming.agentLabel !== undefined) {
        if (incoming.agentLabel) {
          unit.agentLabel = requiredText(incoming.agentLabel, "Agent label", 120);
        } else {
          delete unit.agentLabel;
        }
      }
    }
  }
  if (patch.goalArtifactId !== undefined) run.goalArtifactId = patch.goalArtifactId;

  const now = timestamp();
  run.updatedAt = now;
  runs.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "runs"), runs);
  return { projectId: project.projectId, run };
}

export async function listArtifacts(rootInput, stage = undefined) {
  const project = await getProject(rootInput);
  if (stage !== undefined && !["define", "solutions"].includes(stage)) {
    throw new AsterismError("INVALID_ARTIFACT_STAGE", `Unknown artifact stage: ${stage}`);
  }
  const artifacts = await loadCollection(project.rootPath, "artifacts", "artifacts");
  return {
    projectId: project.projectId,
    artifacts: stage
      ? artifacts.artifacts.filter((artifact) => artifact.stage === stage)
      : artifacts.artifacts,
    updatedAt: artifacts.updatedAt
  };
}

export async function registerArtifact(rootInput, input) {
  const project = await getProject(rootInput);
  if (!["define", "solutions"].includes(input?.stage)) {
    throw new AsterismError("INVALID_ARTIFACT_STAGE", `Unknown artifact stage: ${input?.stage}`);
  }
  const relativePath = requiredText(input.relativePath, "Artifact path", 1_000);
  const expectedPrefix = `asterism/${input.stage}/`;
  if (!relativePath.startsWith(expectedPrefix)) {
    throw new AsterismError(
      "INVALID_ARTIFACT_PATH",
      `${input.stage} artifacts must be saved under ${expectedPrefix}`
    );
  }
  const absolutePath = await resolveProjectPath(project.rootPath, relativePath, { mustExist: true });
  const stats = await lstat(absolutePath);
  if (!stats.isFile()) throw new AsterismError("INVALID_ARTIFACT_PATH", "Artifact must be a file.");

  const runs = await loadCollection(project.rootPath, "runs", "runs");
  const run = runs.runs.find((candidate) => candidate.id === input.runId);
  if (!run) throw new AsterismError("RUN_NOT_FOUND", `Run not found: ${input.runId}`);
  if (run.stage !== input.stage) {
    throw new AsterismError("INVALID_ARTIFACT_STAGE", "Artifact stage must match its run stage.");
  }
  const framing = run.units.find((unit) => unit.id === DEFINE_FRAMING_UNIT_ID);
  if (run.stage === "define" && framing?.status !== "completed") {
    throw new AsterismError(
      "PROBLEM_FRAMING_REQUIRED",
      "Complete Socratic problem framing before registering a Define artifact."
    );
  }
  const sourceItemIds = normalizeIds(input.sourceItemIds, "Source item IDs");
  const board = await readJson(collectionPath(project.rootPath, "board"));
  const boardIds = new Set(board.items.map((item) => item.id));
  const unknownItem = sourceItemIds.find((id) => !boardIds.has(id));
  if (unknownItem) throw new AsterismError("ITEM_NOT_FOUND", `Board item not found: ${unknownItem}`);

  const artifacts = await loadCollection(project.rootPath, "artifacts", "artifacts");
  const existing = artifacts.artifacts.find((artifact) => artifact.relativePath === relativePath);
  if (existing) return { projectId: project.projectId, artifact: existing, registered: false };
  const version = Number(input.version);
  if (!Number.isInteger(version) || version < 1) {
    throw new AsterismError("INVALID_ARTIFACT_VERSION", "Artifact version must be a positive integer.");
  }

  const now = timestamp();
  const artifact = {
    id: randomUUID(),
    stage: input.stage,
    relativePath,
    title: requiredText(input.title, "Artifact title", 200),
    version,
    runId: run.id,
    ...(input.sourceGoalArtifactId ? { sourceGoalArtifactId: input.sourceGoalArtifactId } : {}),
    sourceItemIds,
    active: false,
    createdAt: now
  };
  artifacts.artifacts.push(artifact);
  artifacts.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "artifacts"), artifacts);
  return { projectId: project.projectId, artifact, registered: true };
}

export async function setActiveGoal(rootInput, artifactId) {
  const project = await getProject(rootInput);
  const artifacts = await loadCollection(project.rootPath, "artifacts", "artifacts");
  const target = artifacts.artifacts.find((artifact) => artifact.id === artifactId);
  if (!target) throw new AsterismError("ARTIFACT_NOT_FOUND", `Artifact not found: ${artifactId}`);
  if (target.stage !== "define") {
    throw new AsterismError("INVALID_ACTIVE_GOAL", "Only a Define artifact can be the Active Goal.");
  }

  for (const artifact of artifacts.artifacts) {
    if (artifact.stage === "define") artifact.active = artifact.id === target.id;
  }
  const now = timestamp();
  artifacts.updatedAt = now;
  await atomicWriteJson(collectionPath(project.rootPath, "artifacts"), artifacts);
  return { projectId: project.projectId, artifact: target };
}

export async function getDefineState(rootInput) {
  const project = await getProject(rootInput);
  const [actions, runs, artifacts] = await Promise.all([
    loadCollection(project.rootPath, "actions", "actions"),
    loadCollection(project.rootPath, "runs", "runs"),
    loadCollection(project.rootPath, "artifacts", "artifacts")
  ]);
  return {
    projectId: project.projectId,
    actions: actions.actions.filter((action) => action.type === "start_define"),
    runs: runs.runs.filter((run) => run.stage === "define"),
    artifacts: artifacts.artifacts.filter((artifact) => artifact.stage === "define"),
    activeGoal: artifacts.artifacts.find(
      (artifact) => artifact.stage === "define" && artifact.active === true
    ) ?? null
  };
}
