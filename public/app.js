const elements = {
  status: document.querySelector("#service-status"),
  projectName: document.querySelector("#project-name"),
  projectRoot: document.querySelector("#project-root"),
  projectId: document.querySelector("#project-id"),
  refresh: document.querySelector("#refresh-button"),
  scan: document.querySelector("#scan-button"),
  inboxCount: document.querySelector("#inbox-count"),
  inbox: document.querySelector("#inbox-list"),
  reference: document.querySelector("#reference-list"),
  context: document.querySelector("#context-list"),
  define: document.querySelector("#define-content"),
  linkForms: [...document.querySelectorAll(".link-form")]
};

let boardItems = [];
let defineState = { actions: [], runs: [], artifacts: [], activeGoal: null };
let definePoll = null;
let loading = false;

async function request(path, options) {
  const response = await fetch(path, {
    ...options,
    headers: { "content-type": "application/json", ...(options?.headers ?? {}) }
  });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error?.message ?? "Request failed"), body.error);
  return body;
}

function itemCard(item, fromInbox = false) {
  const card = document.createElement("div");
  card.className = "file-card";
  card.innerHTML = `<strong></strong><div class="item-source"></div><div class="actions"></div>`;
  card.querySelector("strong").textContent = item.title;
  const source = card.querySelector(".item-source");
  if (item.sourceUrl) {
    const link = document.createElement("a");
    link.href = item.sourceUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = item.sourceUrl;
    link.title = item.sourceUrl;
    source.append(link);
  } else {
    const path = document.createElement("code");
    path.textContent = item.relativePath;
    source.append(path);
  }
  const actions = card.querySelector(".actions");
  const sections = fromInbox ? ["reference", "context"] : ["inbox"];
  for (const section of sections) {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = section === "inbox" ? "Move to Inbox" : `Add to ${section}`;
    button.addEventListener("click", () => classify(item.id, section));
    actions.append(button);
  }
  if (item.sourceUrl) {
    const editTitleButton = document.createElement("button");
    editTitleButton.type = "button";
    editTitleButton.textContent = "Edit title";
    editTitleButton.addEventListener("click", () => editItemTitle(item));
    actions.append(editTitleButton);
  }
  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "remove-button";
  removeButton.textContent = item.kind === "local_file" ? "Remove from Board" : "Delete";
  removeButton.addEventListener("click", () => removeItem(item));
  actions.append(removeButton);
  return card;
}

function renderBoard() {
  for (const element of [elements.inbox, elements.reference, elements.context]) element.replaceChildren();
  const visibleItems = boardItems.filter((item) => !item.missing && !item.dismissed);
  const inbox = visibleItems.filter((item) => item.section === "inbox");
  elements.inboxCount.textContent = `${inbox.length} item${inbox.length === 1 ? "" : "s"}`;
  for (const item of inbox) elements.inbox.append(itemCard(item, true));
  for (const item of visibleItems.filter((candidate) => candidate.section === "reference")) {
    elements.reference.append(itemCard(item));
  }
  for (const item of visibleItems.filter((candidate) => candidate.section === "context")) {
    elements.context.append(itemCard(item));
  }
}

function latest(items) {
  return [...items].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))[0] ?? null;
}

function actionButton(label, onClick, className = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = label;
  if (className) button.className = className;
  button.addEventListener("click", onClick);
  return button;
}

function statusBadge(status) {
  const badge = document.createElement("span");
  badge.className = `state-badge ${status}`;
  badge.textContent = status.replace("_", " ");
  return badge;
}

function emptyDefine() {
  const empty = document.createElement("div");
  empty.className = "define-empty";
  const prompt = document.createElement("p");
  prompt.textContent = "What do you want to solve? Start with a plain-language request.";
  empty.append(prompt, actionButton("Add Request", () => showRequestForm()));
  return empty;
}

function requestCard(action) {
  const card = document.createElement("div");
  card.className = "define-card";
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = action.status === "pending" ? "Ready in Codex" : "Define request";
  header.append(title, statusBadge(action.status));

  const requestText = document.createElement("p");
  requestText.className = "request-text";
  requestText.textContent = action.payload.request;
  card.append(header, requestText);

  if (action.status === "pending") {
    const handoff = document.createElement("div");
    handoff.className = "codex-handoff";
    const hint = document.createElement("span");
    hint.textContent = "Return to Codex and invoke";
    const command = document.createElement("code");
    command.textContent = "$asterism 处理待办";
    handoff.append(hint, command);
    const actions = document.createElement("div");
    actions.className = "actions";
    actions.append(
      actionButton("Copy command", (event) => copyCommand(event.currentTarget)),
      actionButton("Edit", () => showRequestForm(action)),
      actionButton("Delete Request", () => deleteRequest(action), "danger")
    );
    card.append(handoff, actions);
  }
  return card;
}

function runCard(action, run) {
  const card = document.createElement("div");
  card.className = "define-card";
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = run?.title ?? "Claimed in Codex";
  header.append(title, statusBadge(run?.status ?? action.status));
  card.append(header);

  if (run?.units?.length) {
    const list = document.createElement("ul");
    list.className = "work-units";
    for (const unit of run.units) {
      const row = document.createElement("li");
      row.className = `work-unit ${unit.status}`;
      const dot = document.createElement("span");
      const label = document.createElement("span");
      label.textContent = unit.label;
      const agent = document.createElement("small");
      agent.textContent = unit.agentLabel ?? unit.status.replace("_", " ");
      row.append(dot, label, agent);
      list.append(row);
    }
    card.append(list);
  } else {
    const message = document.createElement("p");
    message.className = "request-text";
    message.textContent = "Asterism has claimed this request. Continue the conversation in Codex.";
    card.append(message);
  }
  return card;
}

function activeGoalCard(artifact) {
  const card = document.createElement("div");
  card.className = "define-card";
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = artifact.title;
  header.append(title, statusBadge("completed"));
  const label = document.createElement("p");
  label.className = "request-text";
  label.textContent = `Active Goal · v${artifact.version}`;
  const path = document.createElement("code");
  path.className = "artifact-path";
  path.textContent = artifact.relativePath;
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(
    actionButton("Copy path", (event) => copyText(artifact.relativePath, event.currentTarget)),
    actionButton("Start another Define", () => showRequestForm())
  );
  card.append(header, label, path, actions);
  return card;
}

function failedCard(action) {
  const card = document.createElement("div");
  card.className = "define-card";
  const header = document.createElement("header");
  const title = document.createElement("strong");
  title.textContent = "Define failed";
  header.append(title, statusBadge("failed"));
  const message = document.createElement("p");
  message.className = "request-text error";
  message.textContent = action.error ?? "The Define workflow did not complete.";
  const actions = document.createElement("div");
  actions.className = "actions";
  actions.append(actionButton("Start again", () => showRequestForm()));
  card.append(header, message, actions);
  return card;
}

function renderDefine() {
  elements.define.replaceChildren();
  const action = latest(defineState.actions.filter((candidate) => candidate.status !== "cancelled"));
  const run = action
    ? latest(defineState.runs.filter((candidate) => candidate.actionId === action.id))
    : latest(defineState.runs);

  if (action?.status === "pending") elements.define.append(requestCard(action));
  else if (action?.status === "claimed") elements.define.append(runCard(action, run));
  else if (action?.status === "failed") elements.define.append(failedCard(action));
  else if (defineState.activeGoal) elements.define.append(activeGoalCard(defineState.activeGoal));
  else if (action?.status === "completed") {
    const card = document.createElement("div");
    card.className = "define-card";
    card.textContent = "Define completed in Codex. Waiting for an Active Goal artifact.";
    elements.define.append(card);
  } else elements.define.append(emptyDefine());

  const shouldPoll = action?.status === "claimed";
  if (shouldPoll && !definePoll) definePoll = window.setInterval(load, 3_000);
  if (!shouldPoll && definePoll) {
    window.clearInterval(definePoll);
    definePoll = null;
  }
}

function showRequestForm(action = null) {
  elements.define.replaceChildren();
  const form = document.createElement("form");
  form.className = "request-form";
  const textarea = document.createElement("textarea");
  textarea.name = "request";
  textarea.placeholder = "Describe what you want to understand, decide, or make ready for Solutions…";
  textarea.value = action?.payload?.request ?? "";
  textarea.required = true;
  textarea.maxLength = 20_000;
  const actions = document.createElement("div");
  actions.className = "actions";
  const save = document.createElement("button");
  save.type = "submit";
  save.textContent = action ? "Save changes" : "Save Request";
  actions.append(save, actionButton("Cancel", renderDefine));
  const feedback = document.createElement("p");
  feedback.className = "request-feedback";
  form.append(textarea, actions, feedback);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    save.disabled = true;
    feedback.classList.remove("error");
    feedback.textContent = "Saving…";
    try {
      await request(action ? `/api/requests/${encodeURIComponent(action.id)}` : "/api/requests", {
        method: action ? "PATCH" : "POST",
        body: JSON.stringify({ request: textarea.value })
      });
      await load();
    } catch (error) {
      feedback.classList.add("error");
      feedback.textContent = error.message;
      save.disabled = false;
    }
  });
  elements.define.append(form);
  textarea.focus();
}

async function deleteRequest(action) {
  if (!window.confirm("Delete this pending Request?")) return;
  await request(`/api/requests/${encodeURIComponent(action.id)}`, { method: "DELETE" });
  await load();
}

async function copyText(value, button) {
  try {
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = "Copied";
    window.setTimeout(() => { button.textContent = original; }, 1_500);
  } catch {
    window.prompt("Copy this value", value);
  }
}

function copyCommand(button) {
  return copyText("$asterism 处理待办", button);
}

async function load() {
  if (loading) return;
  loading = true;
  try {
    await request("/api/health");
    elements.status.classList.add("connected");
    elements.status.lastChild.textContent = " Local service connected";
    const { project } = await request("/api/project");
    elements.projectName.textContent = project.name;
    elements.projectRoot.textContent = project.rootPath;
    elements.projectId.textContent = project.projectId;
    elements.scan.disabled = false;
    const [board, nextDefineState] = await Promise.all([
      request("/api/board"),
      request("/api/define")
    ]);
    boardItems = board.items;
    defineState = nextDefineState;
    renderBoard();
    renderDefine();
  } catch (error) {
    elements.projectRoot.textContent = error.message;
    elements.projectRoot.classList.add("error");
    if (error.code !== "PROJECT_NOT_INITIALIZED") {
      elements.status.lastChild.textContent = " Local service unavailable";
    }
  } finally {
    loading = false;
  }
}

async function classify(itemId, section) {
  await request(`/api/items/${encodeURIComponent(itemId)}`, {
    method: "PATCH",
    body: JSON.stringify({ section })
  });
  await load();
}

async function removeItem(item) {
  const message = item.kind === "local_file"
    ? `Remove “${item.title}” from this Board? The file will remain on disk.`
    : `Delete “${item.title}” from this Board?`;
  if (!window.confirm(message)) return;
  await request(`/api/items/${encodeURIComponent(item.id)}`, { method: "DELETE" });
  await load();
}

async function editItemTitle(item) {
  const title = window.prompt("Link title", item.title);
  if (title === null) return;
  await request(`/api/items/${encodeURIComponent(item.id)}/title`, {
    method: "PATCH",
    body: JSON.stringify({ title })
  });
  await load();
}

async function addLink(form) {
  const input = form.querySelector('input[type="url"]');
  const titleInput = form.querySelector('input[name="title"]');
  const button = form.querySelector("button");
  const feedback = form.querySelector(".link-feedback");
  button.disabled = true;
  feedback.classList.remove("error", "success");
  feedback.textContent = "Saving…";
  try {
    await request("/api/links", {
      method: "POST",
      body: JSON.stringify({
        url: input.value,
        title: titleInput.value,
        section: form.dataset.linkSection
      })
    });
    input.value = "";
    titleInput.value = "";
    feedback.classList.add("success");
    feedback.textContent = "Link added";
    await load();
  } catch (error) {
    feedback.classList.add("error");
    feedback.textContent = error.message;
    input.focus();
  } finally {
    button.disabled = false;
  }
}

elements.refresh.addEventListener("click", load);
elements.scan.addEventListener("click", async () => {
  elements.scan.disabled = true;
  try {
    await request("/api/project/scan", { method: "POST", body: "{}" });
    await load();
  } finally {
    elements.scan.disabled = false;
  }
});
for (const form of elements.linkForms) {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    addLink(form);
  });
}

load();
