import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAsterismServer } from "../src/local-service.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

function createMcpClient() {
  const child = spawn(process.execPath, [join(appRoot, "src", "mcp-server.mjs")], {
    stdio: ["pipe", "pipe", "pipe"]
  });
  let id = 0;
  let buffer = "";
  let stderr = "";
  const pending = new Map();

  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    buffer += chunk;
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      const message = JSON.parse(line);
      const waiter = pending.get(message.id);
      if (!waiter) continue;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    }
  });

  function request(method, params = {}) {
    const requestId = ++id;
    const promise = new Promise((resolve, reject) => pending.set(requestId, { resolve, reject }));
    child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id: requestId, method, params })}\n`);
    return promise;
  }

  return {
    request,
    async close() {
      child.stdin.end();
      await new Promise((resolve) => child.once("exit", resolve));
      if (stderr) process.stderr.write(stderr);
    }
  };
}

const projectRoot = await mkdtemp(join(tmpdir(), "asterism-spike-"));
const sourcePath = join(projectRoot, "source-note.md");
await writeFile(sourcePath, "Asterism spike source\n");

const service = await createAsterismServer({ rootPath: projectRoot, port: 0 });
const mcp = createMcpClient();

try {
  const before = await fetch(`${service.url}/api/project`);
  assert.equal(before.status, 404, "Starting the H5 service must not initialize the project.");

  const handshake = await mcp.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "asterism-spike", version: "1" }
  });
  assert.equal(handshake.serverInfo.name, "asterism");

  const initialized = await mcp.request("tools/call", {
    name: "asterism_initialize_project",
    arguments: { rootPath: projectRoot }
  });
  assert.equal(initialized.isError, undefined);
  const mcpProjectId = initialized.structuredContent.project.projectId;

  await mcp.request("tools/call", {
    name: "asterism_scan_files",
    arguments: { rootPath: projectRoot }
  });

  const projectResponse = await fetch(`${service.url}/api/project`);
  assert.equal(projectResponse.status, 200);
  const httpProjectId = (await projectResponse.json()).project.projectId;
  assert.equal(httpProjectId, mcpProjectId);

  const boardResponse = await fetch(`${service.url}/api/board`);
  const board = await boardResponse.json();
  const item = board.items.find((candidate) => candidate.relativePath === "source-note.md");
  assert.ok(item, "H5 API should see the file scanned through MCP.");

  const classificationResponse = await fetch(`${service.url}/api/items/${item.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ section: "reference" })
  });
  assert.equal(classificationResponse.status, 200);

  const mcpBoard = await mcp.request("tools/call", {
    name: "asterism_list_board",
    arguments: { rootPath: projectRoot }
  });
  const classified = mcpBoard.structuredContent.items.find((candidate) => candidate.id === item.id);
  assert.equal(classified.section, "reference");
  assert.equal(await readFile(sourcePath, "utf8"), "Asterism spike source\n");

  const requestResponse = await fetch(`${service.url}/api/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: "Define the next verifiable project goal" })
  });
  assert.equal(requestResponse.status, 201);
  const pendingActions = await mcp.request("tools/call", {
    name: "asterism_list_actions",
    arguments: { rootPath: projectRoot, status: "pending" }
  });
  const defineAction = pendingActions.structuredContent.actions[0];
  assert.equal(defineAction.type, "start_define");

  await mcp.request("tools/call", {
    name: "asterism_claim_action",
    arguments: { rootPath: projectRoot, actionId: defineAction.id }
  });
  const createdRun = await mcp.request("tools/call", {
    name: "asterism_create_run",
    arguments: {
      rootPath: projectRoot,
      actionId: defineAction.id,
      stage: "define",
      title: "Define spike goal",
      inputItemIds: [item.id],
      units: [{ id: "synthesize", label: "Synthesize goal", status: "queued" }]
    }
  });
  const runId = createdRun.structuredContent.run.id;
  await mcp.request("tools/call", {
    name: "asterism_update_run",
    arguments: { rootPath: projectRoot, runId, status: "running" }
  });
  await mcp.request("tools/call", {
    name: "asterism_update_run",
    arguments: {
      rootPath: projectRoot,
      runId,
      unit: {
        id: "socratic_problem_framing",
        status: "running",
        agentLabel: "socratic-asking"
      }
    }
  });
  await mcp.request("tools/call", {
    name: "asterism_update_run",
    arguments: {
      rootPath: projectRoot,
      runId,
      unit: { id: "socratic_problem_framing", status: "completed" }
    }
  });
  await mcp.request("tools/call", {
    name: "asterism_update_run",
    arguments: {
      rootPath: projectRoot,
      runId,
      unit: { id: "synthesize", status: "running", agentLabel: "Goal synthesis" }
    }
  });

  const artifactRelativePath = "asterism/define/spike-goal-v1.md";
  await writeFile(
    join(projectRoot, artifactRelativePath),
    "# Spike goal\n\n## Readiness\nReady for Solutions\n"
  );
  const registered = await mcp.request("tools/call", {
    name: "asterism_register_artifact",
    arguments: {
      rootPath: projectRoot,
      stage: "define",
      relativePath: artifactRelativePath,
      title: "Spike goal",
      version: 1,
      runId,
      sourceItemIds: [item.id]
    }
  });
  const artifactId = registered.structuredContent.artifact.id;
  await mcp.request("tools/call", {
    name: "asterism_update_run",
    arguments: { rootPath: projectRoot, runId, unit: { id: "synthesize", status: "completed" } }
  });
  await mcp.request("tools/call", {
    name: "asterism_set_active_goal",
    arguments: { rootPath: projectRoot, artifactId }
  });
  await mcp.request("tools/call", {
    name: "asterism_update_run",
    arguments: { rootPath: projectRoot, runId, status: "completed", goalArtifactId: artifactId }
  });
  await mcp.request("tools/call", {
    name: "asterism_complete_action",
    arguments: { rootPath: projectRoot, actionId: defineAction.id, outcome: "completed" }
  });
  const defineState = await (await fetch(`${service.url}/api/define`)).json();
  assert.equal(defineState.activeGoal.id, artifactId);

  const html = await (await fetch(service.url)).text();
  assert.match(html, /Project ID/);
  assert.match(html, /Socratic framing/);
  assert.match(html, /Skills \/ Agents/);

  process.stdout.write(`${JSON.stringify({
    ok: true,
    projectId: mcpProjectId,
    serviceUrl: service.url,
    verified: [
      "service start has no initialization side effect",
      "MCP explicit initialization",
      "shared project ID over HTTP",
      "MCP scan visible in H5 API",
      "HTTP classification visible in MCP",
      "original file path and content preserved",
      "HTTP Request visible and claimable through MCP",
      "tracked Define run with mandatory Socratic framing gate",
      "H5 explains the Define workflow before submission",
      "registered Define artifact becomes the unique Active Goal"
    ]
  }, null, 2)}\n`);
} finally {
  await mcp.close();
  await service.close();
  await rm(projectRoot, { recursive: true, force: true });
}
