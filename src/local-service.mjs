#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  addLink,
  classifyItem,
  getProject,
  initializeProject,
  listBoard,
  removeItem,
  scanFiles,
  updateItemTitle
} from "./domain/project-service.mjs";
import { asPublicError } from "./domain/errors.mjs";
import { validateProjectRoot } from "./domain/paths.mjs";
import {
  cancelAction,
  claimAction,
  completeAction,
  createRequest,
  createRun,
  getDefineState,
  listActions,
  listArtifacts,
  listRuns,
  registerArtifact,
  setActiveGoal,
  updateRequest,
  updateRun
} from "./domain/workflow-service.mjs";

const moduleDirectory = fileURLToPath(new URL(".", import.meta.url));
const publicDirectory = join(moduleDirectory, "..", "public");

const contentTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml"
};

function sendJson(response, statusCode, value) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(JSON.stringify(value));
}

async function readBody(request) {
  let body = "";
  for await (const chunk of request) {
    body += chunk;
    if (body.length > 1_000_000) throw new Error("Request body is too large.");
  }
  return body ? JSON.parse(body) : {};
}

function statusForError(error) {
  if (error?.code === "PROJECT_NOT_INITIALIZED") return 404;
  if ([
    "ITEM_NOT_FOUND",
    "FILE_NOT_FOUND",
    "ACTION_NOT_FOUND",
    "RUN_NOT_FOUND",
    "WORK_UNIT_NOT_FOUND",
    "ARTIFACT_NOT_FOUND"
  ].includes(error?.code)) return 404;
  if ([
    "DEFINE_REQUEST_ACTIVE",
    "ACTION_NOT_PENDING",
    "ACTION_NOT_EDITABLE",
    "INVALID_STATE_TRANSITION"
  ].includes(error?.code)) return 409;
  if (error?.code === "INTERNAL_ERROR") return 500;
  return 400;
}

async function serveStatic(requestPath, response) {
  const filename = requestPath === "/" ? "index.html" : requestPath.slice(1);
  if (!new Set(["index.html", "app.js", "styles.css"]).has(filename)) return false;
  const file = await readFile(join(publicDirectory, filename));
  response.writeHead(200, {
    "content-type": contentTypes[extname(filename)] ?? "application/octet-stream",
    "cache-control": "no-store"
  });
  response.end(file);
  return true;
}

export async function createAsterismServer({ rootPath, host = "127.0.0.1", port = 4317 }) {
  const canonicalRoot = await validateProjectRoot(rootPath);
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, `http://${request.headers.host ?? `${host}:${port}`}`);
    try {
      if (request.method === "GET" && (await serveStatic(url.pathname, response))) return;

      if (request.method === "GET" && url.pathname === "/api/health") {
        return sendJson(response, 200, { service: "asterism", status: "ok", rootPath: canonicalRoot });
      }
      if (request.method === "POST" && url.pathname === "/api/project/initialize") {
        return sendJson(response, 200, await initializeProject(canonicalRoot));
      }
      if (request.method === "GET" && url.pathname === "/api/project") {
        return sendJson(response, 200, { project: await getProject(canonicalRoot) });
      }
      if (request.method === "POST" && url.pathname === "/api/project/scan") {
        return sendJson(response, 200, await scanFiles(canonicalRoot));
      }
      if (request.method === "GET" && url.pathname === "/api/board") {
        return sendJson(response, 200, await listBoard(canonicalRoot));
      }
      if (request.method === "GET" && url.pathname === "/api/define") {
        return sendJson(response, 200, await getDefineState(canonicalRoot));
      }
      if (request.method === "POST" && url.pathname === "/api/requests") {
        const body = await readBody(request);
        return sendJson(response, 201, await createRequest(canonicalRoot, body.request));
      }
      if (url.pathname.startsWith("/api/requests/")) {
        const actionId = decodeURIComponent(url.pathname.slice("/api/requests/".length));
        if (request.method === "PATCH") {
          const body = await readBody(request);
          return sendJson(response, 200, await updateRequest(canonicalRoot, actionId, body.request));
        }
        if (request.method === "DELETE") {
          return sendJson(response, 200, await cancelAction(canonicalRoot, actionId));
        }
      }
      if (request.method === "GET" && url.pathname === "/api/actions") {
        return sendJson(response, 200, await listActions(canonicalRoot, url.searchParams.get("status") ?? undefined));
      }
      if (request.method === "POST" && url.pathname.match(/^\/api\/actions\/[^/]+\/claim$/)) {
        const actionId = decodeURIComponent(url.pathname.split("/")[3]);
        return sendJson(response, 200, await claimAction(canonicalRoot, actionId));
      }
      if (request.method === "POST" && url.pathname.match(/^\/api\/actions\/[^/]+\/complete$/)) {
        const actionId = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readBody(request);
        return sendJson(response, 200, await completeAction(canonicalRoot, actionId, body.outcome, body.error));
      }
      if (request.method === "GET" && url.pathname === "/api/runs") {
        return sendJson(response, 200, await listRuns(canonicalRoot, url.searchParams.get("stage") ?? undefined));
      }
      if (request.method === "POST" && url.pathname === "/api/runs") {
        return sendJson(response, 201, await createRun(canonicalRoot, await readBody(request)));
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/api/runs/")) {
        const runId = decodeURIComponent(url.pathname.slice("/api/runs/".length));
        return sendJson(response, 200, await updateRun(canonicalRoot, runId, await readBody(request)));
      }
      if (request.method === "GET" && url.pathname === "/api/artifacts") {
        return sendJson(response, 200, await listArtifacts(canonicalRoot, url.searchParams.get("stage") ?? undefined));
      }
      if (request.method === "POST" && url.pathname === "/api/artifacts") {
        return sendJson(response, 201, await registerArtifact(canonicalRoot, await readBody(request)));
      }
      if (request.method === "POST" && url.pathname.match(/^\/api\/artifacts\/[^/]+\/activate$/)) {
        const artifactId = decodeURIComponent(url.pathname.split("/")[3]);
        return sendJson(response, 200, await setActiveGoal(canonicalRoot, artifactId));
      }
      if (request.method === "POST" && url.pathname === "/api/links") {
        const body = await readBody(request);
        return sendJson(response, 201, await addLink(canonicalRoot, body.url, body.section, body.title));
      }
      if (request.method === "PATCH" && url.pathname.match(/^\/api\/items\/[^/]+\/title$/)) {
        const itemId = decodeURIComponent(url.pathname.split("/")[3]);
        const body = await readBody(request);
        return sendJson(response, 200, await updateItemTitle(canonicalRoot, itemId, body.title));
      }
      if (request.method === "PATCH" && url.pathname.startsWith("/api/items/")) {
        const itemId = decodeURIComponent(url.pathname.slice("/api/items/".length));
        const body = await readBody(request);
        return sendJson(response, 200, await classifyItem(canonicalRoot, itemId, body.section));
      }
      if (request.method === "DELETE" && url.pathname.startsWith("/api/items/")) {
        const itemId = decodeURIComponent(url.pathname.slice("/api/items/".length));
        return sendJson(response, 200, await removeItem(canonicalRoot, itemId));
      }

      sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Route not found." } });
    } catch (error) {
      const publicError = asPublicError(error);
      sendJson(response, statusForError(publicError), { error: publicError });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return {
    rootPath: canonicalRoot,
    url: `http://${host}:${actualPort}`,
    server,
    close: () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()))
  };
}

function parseArguments(argv) {
  const options = { rootPath: process.cwd(), host: "127.0.0.1", port: 4317 };
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--root") options.rootPath = argv[++index];
    else if (argv[index] === "--host") options.host = argv[++index];
    else if (argv[index] === "--port") options.port = Number(argv[++index]);
  }
  return options;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const app = await createAsterismServer(parseArguments(process.argv.slice(2)));
  process.stderr.write(`Asterism local service: ${app.url}\nBound project: ${app.rootPath}\n`);
}
