import { randomUUID } from "node:crypto";
import { lstat, mkdir, readdir } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { AsterismError } from "./errors.mjs";
import { resolveProjectPath, validateProjectRoot } from "./paths.mjs";
import { atomicWriteJson, readJson } from "./storage.mjs";

export const SCHEMA_VERSION = 1;

const STATE_FILES = {
  project: "project.json",
  board: "board.json",
  actions: "actions.json",
  runs: "runs.json",
  artifacts: "artifacts.json"
};

const EXCLUDED_DIRECTORIES = new Set([
  ".git",
  ".asterism",
  "node_modules",
  "dist",
  "build",
  ".next",
  ".cache",
  "coverage"
]);

const EXCLUDED_FILES = new Set([".DS_Store"]);

function timestamp() {
  return new Date().toISOString();
}

function statePath(rootPath, key) {
  return join(rootPath, ".asterism", STATE_FILES[key]);
}

function initialCollections(now) {
  return {
    board: { schemaVersion: SCHEMA_VERSION, items: [], updatedAt: now },
    actions: { schemaVersion: SCHEMA_VERSION, actions: [], updatedAt: now },
    runs: { schemaVersion: SCHEMA_VERSION, runs: [], updatedAt: now },
    artifacts: { schemaVersion: SCHEMA_VERSION, artifacts: [], updatedAt: now }
  };
}

function validateSchema(document, label) {
  if (!document || document.schemaVersion !== SCHEMA_VERSION) {
    throw new AsterismError(
      "UNSUPPORTED_SCHEMA",
      `${label} uses an unsupported or missing schema version.`
    );
  }
}

async function ensureCollection(rootPath, key, initialValue) {
  const path = statePath(rootPath, key);
  const existing = await readJson(path, { allowMissing: true });
  if (existing === null) {
    await atomicWriteJson(path, initialValue);
    return initialValue;
  }
  validateSchema(existing, STATE_FILES[key]);
  return existing;
}

export async function initializeProject(rootInput) {
  const rootPath = await validateProjectRoot(rootInput);
  const stateDirectory = join(rootPath, ".asterism");
  const projectFile = statePath(rootPath, "project");
  const existingProject = await readJson(projectFile, { allowMissing: true });

  if (existingProject) {
    validateSchema(existingProject, STATE_FILES.project);
    if (existingProject.rootPath !== rootPath) {
      throw new AsterismError(
        "PROJECT_ROOT_MISMATCH",
        `Stored project root does not match the current root: ${existingProject.rootPath}`
      );
    }

    const collections = initialCollections(existingProject.createdAt);
    await ensureCollection(rootPath, "board", collections.board);
    await ensureCollection(rootPath, "actions", collections.actions);
    await ensureCollection(rootPath, "runs", collections.runs);
    await ensureCollection(rootPath, "artifacts", collections.artifacts);
    await ensureArtifactDirectories(rootPath);
    return { project: existingProject, initialized: false };
  }

  const stateDirectoryStats = await lstat(stateDirectory).catch((error) => {
    if (error?.code === "ENOENT") return null;
    throw error;
  });
  if (stateDirectoryStats) {
    throw new AsterismError(
      "INCOMPLETE_STATE",
      ".asterism already exists without project.json; refusing to overwrite possible state."
    );
  }

  const now = timestamp();
  const project = {
    schemaVersion: SCHEMA_VERSION,
    projectId: randomUUID(),
    name: basename(rootPath),
    rootPath,
    createdAt: now,
    updatedAt: now
  };
  const collections = initialCollections(now);

  await ensureArtifactDirectories(rootPath);
  await mkdir(stateDirectory, { recursive: false });
  await atomicWriteJson(projectFile, project);
  await atomicWriteJson(statePath(rootPath, "board"), collections.board);
  await atomicWriteJson(statePath(rootPath, "actions"), collections.actions);
  await atomicWriteJson(statePath(rootPath, "runs"), collections.runs);
  await atomicWriteJson(statePath(rootPath, "artifacts"), collections.artifacts);

  return { project, initialized: true };
}

async function ensureArtifactDirectories(rootPath) {
  for (const folder of ["imports", "define", "solutions"]) {
    const target = await resolveProjectPath(rootPath, join("asterism", folder));
    await mkdir(target, { recursive: true });
  }
}

export async function getProject(rootInput) {
  const rootPath = await validateProjectRoot(rootInput);
  const project = await readJson(statePath(rootPath, "project"), { allowMissing: true });
  if (!project) {
    throw new AsterismError("PROJECT_NOT_INITIALIZED", "This project has not enabled Asterism.");
  }
  validateSchema(project, STATE_FILES.project);
  if (project.rootPath !== rootPath) {
    throw new AsterismError("PROJECT_ROOT_MISMATCH", "Stored project root does not match this folder.");
  }
  return project;
}

async function listProjectFiles(rootPath) {
  const files = [];

  async function walk(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory() && EXCLUDED_DIRECTORIES.has(entry.name)) continue;
      if (entry.isFile() && EXCLUDED_FILES.has(entry.name)) continue;

      const absolutePath = join(directory, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile()) {
        const stats = await lstat(absolutePath);
        files.push({
          relativePath: relative(rootPath, absolutePath).split(sep).join("/"),
          title: entry.name,
          size: stats.size,
          modifiedAt: stats.mtime.toISOString(),
          fingerprint: `${stats.size}:${Math.trunc(stats.mtimeMs)}`
        });
      }
    }
  }

  await walk(rootPath);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

export async function scanFiles(rootInput) {
  const project = await getProject(rootInput);
  const rootPath = project.rootPath;
  const boardFile = statePath(rootPath, "board");
  const board = await readJson(boardFile);
  validateSchema(board, STATE_FILES.board);

  const files = await listProjectFiles(rootPath);
  const foundPaths = new Set(files.map((file) => file.relativePath));
  const existingByPath = new Map(
    board.items
      .filter((item) => item.kind === "local_file" && item.relativePath)
      .map((item) => [item.relativePath, item])
  );
  const now = timestamp();

  for (const file of files) {
    const existing = existingByPath.get(file.relativePath);
    if (existing) {
      existing.title = file.title;
      existing.fingerprint = file.fingerprint;
      existing.modifiedAt = file.modifiedAt;
      existing.missing = false;
      existing.updatedAt = now;
    } else {
      board.items.push({
        id: randomUUID(),
        kind: "local_file",
        section: "inbox",
        relativePath: file.relativePath,
        title: file.title,
        included: true,
        fingerprint: file.fingerprint,
        modifiedAt: file.modifiedAt,
        missing: false,
        createdAt: now,
        updatedAt: now
      });
    }
  }

  for (const item of board.items) {
    if (item.kind === "local_file" && item.relativePath && !foundPaths.has(item.relativePath)) {
      item.missing = true;
      item.updatedAt = now;
    }
  }

  board.updatedAt = now;
  await atomicWriteJson(boardFile, board);
  return { projectId: project.projectId, scanned: files.length, board };
}

export async function listBoard(rootInput) {
  const project = await getProject(rootInput);
  const board = await readJson(statePath(project.rootPath, "board"));
  validateSchema(board, STATE_FILES.board);
  const artifacts = await readJson(statePath(project.rootPath, "artifacts"));
  validateSchema(artifacts, STATE_FILES.artifacts);
  const activeGoal = artifacts.artifacts.find(
    (artifact) => artifact.stage === "define" && artifact.active === true
  ) ?? null;
  return { projectId: project.projectId, items: board.items, activeGoal, updatedAt: board.updatedAt };
}

function parseSourceUrl(sourceUrl) {
  if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
    throw new AsterismError("INVALID_LINK", "Paste a complete http:// or https:// link.");
  }
  if (sourceUrl.length > 4_096) {
    throw new AsterismError("INVALID_LINK", "The pasted link is too long.");
  }

  let parsed;
  try {
    parsed = new URL(sourceUrl.trim());
  } catch {
    throw new AsterismError("INVALID_LINK", "Paste a complete http:// or https:// link.");
  }

  if (!["http:", "https:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new AsterismError("INVALID_LINK", "Only http:// and https:// links are supported.");
  }
  if (parsed.username || parsed.password) {
    throw new AsterismError("INVALID_LINK", "Links containing credentials are not supported.");
  }
  return parsed;
}

function isNotionHost(hostname) {
  const host = hostname.toLowerCase();
  return host === "notion.so" || host.endsWith(".notion.so") ||
    host === "notion.site" || host.endsWith(".notion.site") ||
    host === "notion.com" || host.endsWith(".notion.com");
}

function titleFromUrl(url) {
  const finalSegment = url.pathname.split("/").filter(Boolean).at(-1);
  if (finalSegment) {
    const decoded = decodeURIComponent(finalSegment)
      .replace(/-[a-f0-9]{32}$/i, "")
      .replace(/[-_]+/g, " ")
      .trim();
    if (decoded) return decoded;
  }
  return url.hostname.replace(/^www\./i, "");
}

function linkTitle(value, fallback = undefined) {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  if (typeof value !== "string" || value.trim().length > 200) {
    throw new AsterismError("INVALID_LINK_TITLE", "Link title must be 200 characters or fewer.");
  }
  return value.trim();
}

export async function addLink(rootInput, sourceUrl, section, title = undefined) {
  if (!["reference", "context"].includes(section)) {
    throw new AsterismError(
      "INVALID_LINK_SECTION",
      "Links can be added directly only to Reference or Context."
    );
  }

  const parsedUrl = parseSourceUrl(sourceUrl);
  const project = await getProject(rootInput);
  const boardFile = statePath(project.rootPath, "board");
  const board = await readJson(boardFile);
  validateSchema(board, STATE_FILES.board);
  const normalizedUrl = parsedUrl.href;
  const customTitle = linkTitle(title);
  const now = timestamp();
  let item = board.items.find(
    (candidate) => candidate.sourceUrl === normalizedUrl && candidate.kind !== "local_file"
  );

  if (item) {
    item.section = section;
    item.included = true;
    if (customTitle) item.title = customTitle;
    item.updatedAt = now;
  } else {
    item = {
      id: randomUUID(),
      kind: isNotionHost(parsedUrl.hostname) ? "notion_page" : "web_link",
      section,
      sourceUrl: normalizedUrl,
      title: customTitle ?? titleFromUrl(parsedUrl),
      included: true,
      syncStatus: "pending",
      createdAt: now,
      updatedAt: now
    };
    board.items.push(item);
  }

  board.updatedAt = now;
  await atomicWriteJson(boardFile, board);
  return { projectId: project.projectId, item };
}

export async function updateItemTitle(rootInput, itemId, title) {
  const project = await getProject(rootInput);
  const boardFile = statePath(project.rootPath, "board");
  const board = await readJson(boardFile);
  validateSchema(board, STATE_FILES.board);
  const item = board.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new AsterismError("ITEM_NOT_FOUND", `Board item not found: ${itemId}`);
  if (!item.sourceUrl) {
    throw new AsterismError("INVALID_LINK_TITLE", "Only link cards can have an edited title.");
  }

  const now = timestamp();
  item.title = linkTitle(title) ?? titleFromUrl(parseSourceUrl(item.sourceUrl));
  item.updatedAt = now;
  board.updatedAt = now;
  await atomicWriteJson(boardFile, board);
  return { projectId: project.projectId, item };
}

export async function classifyItem(rootInput, itemId, section) {
  const allowedSections = new Set(["inbox", "reference", "context", "define", "solutions"]);
  if (!allowedSections.has(section)) {
    throw new AsterismError("INVALID_SECTION", `Unknown board section: ${section}`);
  }

  const project = await getProject(rootInput);
  const boardFile = statePath(project.rootPath, "board");
  const board = await readJson(boardFile);
  validateSchema(board, STATE_FILES.board);
  const item = board.items.find((candidate) => candidate.id === itemId);
  if (!item) throw new AsterismError("ITEM_NOT_FOUND", `Board item not found: ${itemId}`);

  const now = timestamp();
  item.section = section;
  item.updatedAt = now;
  board.updatedAt = now;
  await atomicWriteJson(boardFile, board);
  return { projectId: project.projectId, item };
}

export async function removeItem(rootInput, itemId) {
  const project = await getProject(rootInput);
  const boardFile = statePath(project.rootPath, "board");
  const board = await readJson(boardFile);
  validateSchema(board, STATE_FILES.board);
  const itemIndex = board.items.findIndex((candidate) => candidate.id === itemId);
  if (itemIndex === -1) {
    throw new AsterismError("ITEM_NOT_FOUND", `Board item not found: ${itemId}`);
  }

  const item = board.items[itemIndex];
  const now = timestamp();
  if (item.kind === "local_file") {
    item.dismissed = true;
    item.included = false;
    item.updatedAt = now;
  } else {
    board.items.splice(itemIndex, 1);
  }

  board.updatedAt = now;
  await atomicWriteJson(boardFile, board);
  return {
    projectId: project.projectId,
    item,
    sourceFilePreserved: item.kind === "local_file"
  };
}
