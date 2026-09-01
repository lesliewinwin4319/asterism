import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  addLink,
  classifyItem,
  initializeProject,
  listBoard,
  removeItem,
  scanFiles,
  updateItemTitle
} from "../src/domain/project-service.mjs";
import { resolveProjectPath } from "../src/domain/paths.mjs";

async function fixture(t) {
  const rootPath = await mkdtemp(join(tmpdir(), "asterism-test-"));
  t.after(() => rm(rootPath, { recursive: true, force: true }));
  return rootPath;
}

test("initialization is explicit and idempotent", async (t) => {
  const rootPath = await fixture(t);
  const originalPath = join(rootPath, "brief.md");
  await writeFile(originalPath, "original material\n");

  const first = await initializeProject(rootPath);
  const second = await initializeProject(rootPath);

  assert.equal(first.initialized, true);
  assert.equal(second.initialized, false);
  assert.equal(second.project.projectId, first.project.projectId);
  assert.equal(await readFile(originalPath, "utf8"), "original material\n");
});

test("scan and classification preserve the original file path", async (t) => {
  const rootPath = await fixture(t);
  const sourcePath = join(rootPath, "research.md");
  await writeFile(sourcePath, "evidence\n");
  await initializeProject(rootPath);

  const scan = await scanFiles(rootPath);
  const item = scan.board.items.find((candidate) => candidate.relativePath === "research.md");
  assert.ok(item);
  assert.equal(item.section, "inbox");

  await classifyItem(rootPath, item.id, "reference");
  const board = await listBoard(rootPath);
  assert.equal(board.items.find((candidate) => candidate.id === item.id).section, "reference");
  assert.equal(await readFile(sourcePath, "utf8"), "evidence\n");
});

test("links can be added directly to Reference and Context", async (t) => {
  const rootPath = await fixture(t);
  await initializeProject(rootPath);

  const notion = await addLink(
    rootPath,
    "https://www.notion.so/Love-Archetype-0123456789abcdef0123456789abcdef",
    "context"
  );
  const web = await addLink(rootPath, "https://example.com/research?q=asterism", "reference");
  const board = await listBoard(rootPath);

  assert.equal(notion.item.kind, "notion_page");
  assert.equal(notion.item.title, "Love Archetype");
  assert.equal(notion.item.section, "context");
  assert.equal(web.item.kind, "web_link");
  assert.equal(web.item.section, "reference");
  assert.equal(board.items.length, 2);
});

test("adding the same link again reclassifies one item instead of duplicating it", async (t) => {
  const rootPath = await fixture(t);
  await initializeProject(rootPath);
  const first = await addLink(rootPath, "https://example.com/brief", "reference");
  const second = await addLink(rootPath, "https://example.com/brief", "context");
  const board = await listBoard(rootPath);

  assert.equal(second.item.id, first.item.id);
  assert.equal(board.items.length, 1);
  assert.equal(board.items[0].section, "context");
});

test("link cards accept a readable title when added and can be renamed", async (t) => {
  const rootPath = await fixture(t);
  await initializeProject(rootPath);
  const created = await addLink(
    rootPath,
    "https://app.notion.com/p/example-project-context",
    "context",
    "Registration abuse context"
  );
  assert.equal(created.item.title, "Registration abuse context");

  const renamed = await updateItemTitle(rootPath, created.item.id, "Product context notes");
  assert.equal(renamed.item.title, "Product context notes");
  assert.equal((await listBoard(rootPath)).items[0].sourceUrl, created.item.sourceUrl);
});

test("link input rejects unsafe URLs and unsupported sections", async (t) => {
  const rootPath = await fixture(t);
  await initializeProject(rootPath);

  await assert.rejects(() => addLink(rootPath, "javascript:alert(1)", "reference"), {
    code: "INVALID_LINK"
  });
  await assert.rejects(() => addLink(rootPath, "https://user:secret@example.com", "context"), {
    code: "INVALID_LINK"
  });
  await assert.rejects(() => addLink(rootPath, "https://example.com", "solutions"), {
    code: "INVALID_LINK_SECTION"
  });
});

test("removing a link deletes only its Board metadata", async (t) => {
  const rootPath = await fixture(t);
  await initializeProject(rootPath);
  const created = await addLink(rootPath, "https://app.notion.com/p/Project-brief", "reference");

  const removed = await removeItem(rootPath, created.item.id);
  const board = await listBoard(rootPath);

  assert.equal(created.item.kind, "notion_page");
  assert.equal(removed.sourceFilePreserved, false);
  assert.equal(board.items.length, 0);
});

test("removing a local file hides it without deleting or re-adding it on scan", async (t) => {
  const rootPath = await fixture(t);
  const sourcePath = join(rootPath, "keep-me.md");
  await writeFile(sourcePath, "keep this file\n");
  await initializeProject(rootPath);
  const firstScan = await scanFiles(rootPath);
  const item = firstScan.board.items.find((candidate) => candidate.relativePath === "keep-me.md");

  const removed = await removeItem(rootPath, item.id);
  const secondScan = await scanFiles(rootPath);
  const rescannedItem = secondScan.board.items.find((candidate) => candidate.id === item.id);

  assert.equal(removed.sourceFilePreserved, true);
  assert.equal(await readFile(sourcePath, "utf8"), "keep this file\n");
  assert.equal(rescannedItem.dismissed, true);
  assert.equal(secondScan.board.items.filter((candidate) => candidate.relativePath === "keep-me.md").length, 1);
});

test("unsafe paths and ambiguous existing state are rejected", async (t) => {
  const rootPath = await fixture(t);
  await assert.rejects(() => resolveProjectPath(rootPath, "../outside.md"), { code: "PATH_ESCAPE" });

  await mkdir(join(rootPath, ".asterism"));
  await writeFile(join(rootPath, ".asterism", "unknown.json"), "{}\n");
  await assert.rejects(() => initializeProject(rootPath), { code: "INCOMPLETE_STATE" });
});

test("initialization rejects an artifact directory symlink escape before creating state", async (t) => {
  const rootPath = await fixture(t);
  const outsidePath = await fixture(t);
  await symlink(outsidePath, join(rootPath, "asterism"));

  await assert.rejects(() => initializeProject(rootPath), { code: "SYMLINK_ESCAPE" });
  await assert.rejects(() => readFile(join(rootPath, ".asterism", "project.json")), { code: "ENOENT" });
});
