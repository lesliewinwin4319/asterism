import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { initializeProject } from "../src/domain/project-service.mjs";
import { createAsterismServer } from "../src/local-service.mjs";

test("local API saves pasted links into the requested Board section", async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), "asterism-http-test-"));
  await initializeProject(rootPath);
  const app = await createAsterismServer({ rootPath, port: 0 });
  t.after(async () => {
    await app.close();
    await rm(rootPath, { recursive: true, force: true });
  });

  const createdResponse = await fetch(`${app.url}/api/links`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      url: "https://example.com/project-brief",
      title: "Project brief",
      section: "context"
    })
  });
  const created = await createdResponse.json();
  const boardResponse = await fetch(`${app.url}/api/board`);
  const board = await boardResponse.json();

  assert.equal(createdResponse.status, 201);
  assert.equal(created.item.section, "context");
  assert.equal(created.item.sourceUrl, "https://example.com/project-brief");
  assert.equal(created.item.title, "Project brief");
  assert.equal(board.items.length, 1);
  assert.equal(board.items[0].id, created.item.id);

  const renamedResponse = await fetch(`${app.url}/api/items/${created.item.id}/title`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ title: "Updated project brief" })
  });
  const renamed = await renamedResponse.json();
  assert.equal(renamedResponse.status, 200);
  assert.equal(renamed.item.title, "Updated project brief");

  const deletedResponse = await fetch(`${app.url}/api/items/${created.item.id}`, {
    method: "DELETE"
  });
  const boardAfterDelete = await (await fetch(`${app.url}/api/board`)).json();
  assert.equal(deletedResponse.status, 200);
  assert.equal(boardAfterDelete.items.length, 0);
});

test("local API saves, edits, exposes, and cancels a Define request", async (t) => {
  const rootPath = await mkdtemp(join(tmpdir(), "asterism-http-define-test-"));
  await initializeProject(rootPath);
  const app = await createAsterismServer({ rootPath, port: 0 });
  t.after(async () => {
    await app.close();
    await rm(rootPath, { recursive: true, force: true });
  });

  const createdResponse = await fetch(`${app.url}/api/requests`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: "Initial request" })
  });
  const created = await createdResponse.json();
  const updatedResponse = await fetch(`${app.url}/api/requests/${created.action.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ request: "Updated request" })
  });
  const defineBeforeCancel = await (await fetch(`${app.url}/api/define`)).json();
  const cancelledResponse = await fetch(`${app.url}/api/requests/${created.action.id}`, {
    method: "DELETE"
  });
  const defineAfterCancel = await (await fetch(`${app.url}/api/define`)).json();

  assert.equal(createdResponse.status, 201);
  assert.equal(updatedResponse.status, 200);
  assert.equal(defineBeforeCancel.actions[0].payload.request, "Updated request");
  assert.equal(cancelledResponse.status, 200);
  assert.equal(defineAfterCancel.actions[0].status, "cancelled");
});
