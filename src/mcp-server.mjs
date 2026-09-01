#!/usr/bin/env node
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
import {
  claimAction,
  completeAction,
  createRun,
  getDefineState,
  listActions,
  listArtifacts,
  listRuns,
  registerArtifact,
  setActiveGoal,
  updateRun
} from "./domain/workflow-service.mjs";

const SERVER_INFO = { name: "asterism", version: "0.0.1" };
const PROTOCOL_VERSION = "2025-06-18";

const tools = [
  {
    name: "asterism_initialize_project",
    description: "Explicitly initialize or restore Asterism in a specific project folder without moving existing files.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string", description: "Absolute path to the project folder explicitly selected by the user." }
      },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_get_project",
    description: "Read an initialized Asterism project identity and binding.",
    inputSchema: {
      type: "object",
      properties: { rootPath: { type: "string" } },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_scan_files",
    description: "Scan project files into Inbox metadata without reading file contents or moving files.",
    inputSchema: {
      type: "object",
      properties: { rootPath: { type: "string" } },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_list_board",
    description: "Read current Inbox and four-section board metadata.",
    inputSchema: {
      type: "object",
      properties: { rootPath: { type: "string" } },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_add_link",
    description: "Save an http(s) link directly to Reference or Context as local Board metadata.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        url: { type: "string" },
        title: { type: "string", maxLength: 200 },
        section: { type: "string", enum: ["reference", "context"] }
      },
      required: ["rootPath", "url", "section"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_update_item_title",
    description: "Set a readable local metadata title for one link card.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        itemId: { type: "string" },
        title: { type: "string", maxLength: 200 }
      },
      required: ["rootPath", "itemId", "title"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_remove_item",
    description: "Remove an item from Board metadata without deleting an underlying local file.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        itemId: { type: "string" }
      },
      required: ["rootPath", "itemId"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_get_define_state",
    description: "Read saved Define requests, runs, artifacts, and the Active Goal.",
    inputSchema: {
      type: "object",
      properties: { rootPath: { type: "string" } },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_list_actions",
    description: "List project workflow actions, optionally filtered by status.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        status: {
          type: "string",
          enum: ["pending", "claimed", "completed", "failed", "cancelled"]
        }
      },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_claim_action",
    description: "Idempotently claim one pending action before processing it in Codex.",
    inputSchema: {
      type: "object",
      properties: { rootPath: { type: "string" }, actionId: { type: "string" } },
      required: ["rootPath", "actionId"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_complete_action",
    description: "Mark a claimed action completed or failed.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        actionId: { type: "string" },
        outcome: { type: "string", enum: ["completed", "failed"] },
        error: { type: "string" }
      },
      required: ["rootPath", "actionId", "outcome"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_create_run",
    description: "Create a tracked Define, Solutions, or sync run for a claimed action.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        actionId: { type: "string" },
        stage: { type: "string", enum: ["define", "solutions", "sync"] },
        title: { type: "string" },
        inputItemIds: { type: "array", items: { type: "string" } },
        units: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              status: {
                type: "string",
                enum: ["queued", "running", "waiting_user", "completed", "failed", "cancelled"]
              },
              agentLabel: { type: "string" }
            },
            required: ["label"],
            additionalProperties: false
          }
        }
      },
      required: ["rootPath", "stage", "title", "inputItemIds"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_list_runs",
    description: "List tracked workflow runs and their user-visible work units.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        stage: { type: "string", enum: ["define", "solutions", "sync"] }
      },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_update_run",
    description: "Update a run or one user-visible work unit at a key workflow transition.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        runId: { type: "string" },
        status: {
          type: "string",
          enum: ["queued", "running", "waiting_user", "completed", "failed", "cancelled"]
        },
        unit: {
          type: "object",
          properties: {
            id: { type: "string" },
            label: { type: "string" },
            status: {
              type: "string",
              enum: ["queued", "running", "waiting_user", "completed", "failed", "cancelled"]
            },
            agentLabel: { type: "string" }
          },
          additionalProperties: false
        },
        goalArtifactId: { type: "string" }
      },
      required: ["rootPath", "runId"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_list_artifacts",
    description: "List registered Define and Solutions artifacts.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        stage: { type: "string", enum: ["define", "solutions"] }
      },
      required: ["rootPath"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_register_artifact",
    description: "Register an existing local Define or Solutions file and its source items.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        stage: { type: "string", enum: ["define", "solutions"] },
        relativePath: { type: "string" },
        title: { type: "string" },
        version: { type: "integer", minimum: 1 },
        runId: { type: "string" },
        sourceGoalArtifactId: { type: "string" },
        sourceItemIds: { type: "array", items: { type: "string" } }
      },
      required: ["rootPath", "stage", "relativePath", "title", "version", "runId", "sourceItemIds"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_set_active_goal",
    description: "Atomically set one registered Define artifact as the project's Active Goal.",
    inputSchema: {
      type: "object",
      properties: { rootPath: { type: "string" }, artifactId: { type: "string" } },
      required: ["rootPath", "artifactId"],
      additionalProperties: false
    }
  },
  {
    name: "asterism_classify_item",
    description: "Change one board item's semantic section without moving its underlying file.",
    inputSchema: {
      type: "object",
      properties: {
        rootPath: { type: "string" },
        itemId: { type: "string" },
        section: {
          type: "string",
          enum: ["inbox", "reference", "context", "define", "solutions"]
        }
      },
      required: ["rootPath", "itemId", "section"],
      additionalProperties: false
    }
  }
];

async function callTool(name, args) {
  switch (name) {
    case "asterism_initialize_project":
      return initializeProject(args.rootPath);
    case "asterism_get_project":
      return { project: await getProject(args.rootPath) };
    case "asterism_scan_files":
      return scanFiles(args.rootPath);
    case "asterism_list_board":
      return listBoard(args.rootPath);
    case "asterism_add_link":
      return addLink(args.rootPath, args.url, args.section, args.title);
    case "asterism_update_item_title":
      return updateItemTitle(args.rootPath, args.itemId, args.title);
    case "asterism_remove_item":
      return removeItem(args.rootPath, args.itemId);
    case "asterism_get_define_state":
      return getDefineState(args.rootPath);
    case "asterism_list_actions":
      return listActions(args.rootPath, args.status);
    case "asterism_claim_action":
      return claimAction(args.rootPath, args.actionId);
    case "asterism_complete_action":
      return completeAction(args.rootPath, args.actionId, args.outcome, args.error);
    case "asterism_create_run":
      return createRun(args.rootPath, args);
    case "asterism_list_runs":
      return listRuns(args.rootPath, args.stage);
    case "asterism_update_run":
      return updateRun(args.rootPath, args.runId, args);
    case "asterism_list_artifacts":
      return listArtifacts(args.rootPath, args.stage);
    case "asterism_register_artifact":
      return registerArtifact(args.rootPath, args);
    case "asterism_set_active_goal":
      return setActiveGoal(args.rootPath, args.artifactId);
    case "asterism_classify_item":
      return classifyItem(args.rootPath, args.itemId, args.section);
    default:
      throw Object.assign(new Error(`Unknown tool: ${name}`), { code: "METHOD_NOT_FOUND" });
  }
}

async function handleRequest(message) {
  switch (message.method) {
    case "initialize":
      return {
        protocolVersion: message.params?.protocolVersion || PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: "Asterism is explicit-only. Never initialize a project unless the user invoked $asterism for that folder."
      };
    case "ping":
      return {};
    case "tools/list":
      return { tools };
    case "tools/call": {
      try {
        const result = await callTool(message.params?.name, message.params?.arguments ?? {});
        return {
          content: [{ type: "text", text: JSON.stringify(result) }],
          structuredContent: result
        };
      } catch (error) {
        const publicError = asPublicError(error);
        return {
          content: [{ type: "text", text: JSON.stringify({ error: publicError }) }],
          isError: true
        };
      }
    }
    default:
      throw Object.assign(new Error(`Method not found: ${message.method}`), { code: -32601 });
  }
}

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

let buffer = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", async (chunk) => {
  buffer += chunk;
  const lines = buffer.split("\n");
  buffer = lines.pop() ?? "";

  for (const line of lines) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } });
      continue;
    }

    if (message.id === undefined) continue;
    try {
      const result = await handleRequest(message);
      send({ jsonrpc: "2.0", id: message.id, result });
    } catch (error) {
      send({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: typeof error.code === "number" ? error.code : -32603, message: error.message }
      });
    }
  }
});

process.stdin.resume();
