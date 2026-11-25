// Alfred web interface — polished UI
import { createServer } from "node:http";
import { checkAction, commitAction } from "./policy";
import { callGrok } from "./llm";
import { load, save, State, HistoryItem } from "./store";
import { fetchPage } from "./tools";
import { runAgentLoop } from "./agent";

let state: State = load();

function ensureDaily() {
  const today = new Date().toISOString().slice(0, 10);
  if (state.usage.lastReset !== today) {
    state.usage.spentToday = 0;
    state.usage.lastReset = today;
    save(state);
  }
}
ensureDaily();

const TASKS: Record<string, { cost: number; prompt: (t: string, ctx: string) => string; label: string; usesTool?: boolean; agent?: boolean }> = {
  agent: { cost: 8, label: "Agent", agent: true, prompt: () => "" },
  chat: { cost: 5, label: "Chat", prompt: (t, ctx) => `You are Alfred. ${ctx ? "Context:\n" + ctx + "\n\n" : ""}User: ${t}\n\nReply helpfully.` },
  summarize: { cost: 6, label: "Summarize", prompt: (t, ctx) => `Summarize in 3 bullets:\n\n${t}` },
  research: { cost: 8, label: "Research", prompt: (t, ctx) => `Research and give 4 key points:\n\n${t}` },
  draft: { cost: 9, label: "Draft", prompt: (t, ctx) => `Write a short draft:\n\n${t}` },
  explain: { cost: 7, label: "Explain", prompt: (t, ctx) => `Explain simply:\n\n${t}` },
  actions: { cost: 7, label: "Actions", prompt: (t, ctx) => `List concrete next actions:\n\n${t}` },
  fetch: { cost: 9, label: "Fetch", usesTool: true, prompt: (t) => `Summarize this page:\n\n${t}` },
};

function recentContext(): string {
  return state.messages.slice(-6).map(m => `${m.role}: ${m.content}`).join("\n");
}

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Alfred</title>
<style>
  :root {
    --bg: #111111;
    --surface: #1c1c1c;
    --surface-2: #242424;
    --border: #2e2e2e;
    --text: #f4f4f0;
    --muted: #a1a1a1;
    --accent: #d4ff00;
    --accent-fg: #111;
    --danger: #ff6b6b;
    --radius: 12px;
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; background: var(--bg); color: var(--text); font-family: system-ui, -apple-system, sans-serif; }
  body { min-height: 100dvh; }
  .page { max-width: 920px; margin: 0 auto; padding: 28px 20px 80px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  .logo { font-size: 28px; font-weight: 700; letter-spacing: -0.5px; }
  .logo span { color: var(--accent); }
  .pill { font-size: 12px; background: #1e2a12; color: var(--accent); padding: 5px 12px; border-radius: 999px; border: 1px solid #33421a; }
  .status-grid { display: grid; grid-template-columns: 1fr auto; gap: 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; margin-bottom: 16px; }
  .status-grid b { color: var(--accent); }
  .meter { height: 6px; background: #2a2a2a; border-radius: 3px; margin-top: 8px; overflow: hidden; }
  .meter > div { height: 100%; background: var(--accent); width: 0%; transition: width .35s ease; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
  button, .btn {
    background: var(--surface-2); color: var(--text); border: 1px solid var(--border);
    border-radius: 8px; padding: 8px 14px; font-size: 13px; cursor: pointer;
    transition: background .15s, border-color .15s, transform .1s;
  }
  button:hover, .btn:hover { background: #2e2e2e; border-color: #444; }
  button:active { transform: translateY(1px); }
  button.primary { background: var(--accent); color: var(--accent-fg); border: none; font-weight: 600; padding: 10px 20px; }
  button.primary:hover { background: #e0ff33; }
  button:disabled { opacity: 0.45; cursor: not-allowed; transform: none; }
  .tasks { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 14px; }
  .tasks button { border-radius: 999px; padding: 6px 14px; }
  .tasks button.active { background: #1e2a12; color: var(--accent); border-color: #3a4f20; }
  .composer { background: var(--surface); border: 1px solid var(--border); border-radius: 16px; padding: 18px; }
  textarea {
    width: 100%; min-height: 96px; background: #111; color: var(--text);
    border: 1px solid var(--border); border-radius: 10px; padding: 14px;
    font-family: inherit; font-size: 15px; resize: vertical;
  }
  textarea:focus { outline: none; border-color: #5a7a2a; }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 14px; }
  .cost { color: var(--muted); font-size: 13px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; padding: 18px; margin-top: 16px; }
  .result { white-space: pre-wrap; line-height: 1.55; font-size: 15.5px; }
  .steps { font-size: 13px; color: var(--muted); margin-top: 12px; line-height: 1.5; }
  .meta { color: var(--muted); font-size: 13px; margin-top: 12px; display: flex; justify-content: space-between; align-items: center; }
  .copy { background: transparent; border: 1px solid var(--border); color: var(--muted); padding: 4px 10px; border-radius: 6px; cursor: pointer; font-size: 12px; }
  .history { margin-top: 28px; }
  .history h3 { font-size: 13px; color: var(--muted); font-weight: 500; margin: 0 0 10px; }
  .item { background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; font-size: 14px; }
  .item .q { color: var(--muted); margin-bottom: 4px; }
  .frozen { background: #3a1a1a; color: var(--danger); padding: 12px 16px; border-radius: 10px; margin-bottom: 14px; display: none; }
  .error { color: var(--danger); }
  input[type=number] { background: #111; border: 1px solid var(--border); color: var(--text); border-radius: 8px; padding: 6px 8px; width: 70px; }
</style>
</head>
<body>
<div class="page">
  <header>
    <div class="logo"><span>Alfred</span></div>
    <div class="pill">Sprite · Policy · Agent</div>
  </header>

  <div id="frozenBanner" class="frozen">Agent is frozen. Unfreeze to continue.</div>

  <div class="status-grid">
    <div>
      Spent today: <b id="spent">0</b> / <b id="daily">50</b>
      <div class="meter"><div id="bar"></div></div>
    </div>
    <div class="controls">
      <button id="freezeBtn" type="button">Freeze</button>
      <button id="resetBtn" type="button">Reset</button>
      <button id="clearHistory" type="button">Clear</button>
      <input id="maxSingle" type="number" min="1" title="Max single">
      <input id="maxDaily" type="number" min="1" title="Max daily">
      <button id="saveLimits" type="button">Save</button>
    </div>
  </div>

  <div class="composer">
    <div class="tasks" id="tasks">
      <button type="button" data-task="agent" class="active">Agent</button>
      <button type="button" data-task="chat">Chat</button>
      <button type="button" data-task="summarize">Summarize</button>
      <button type="button" data-task="research">Research</button>
      <button type="button" data-task="draft">Draft</button>
      <button type="button" data-task="explain">Explain</button>
      <button type="button" data-task="actions">Actions</button>
      <button type="button" data-task="fetch">Fetch</button>
    </div>
    <textarea id="topic" placeholder="Give Alfred a goal. Agent mode plans and uses tools under policy."></textarea>
    <div class="row">
      <span class="cost" id="costLabel">Cost ~8+</span>
      <button class="primary" id="go" type="button">Run Alfred</button>
    </div>
  </div>

  <div id="out"></div>
  <div class="history" id="history"></div>
</div>

<script>
const tasks = ${JSON.stringify(Object.fromEntries(Object.entries(TASKS).map(([k,v]) => [k, {cost: v.cost, label: v.label, agent: !!v.agent}])))};
let current = "agent";

function $(id) { return document.getElementById(id); }

function setTask(t) {
  current = t;
  document.querySelectorAll("#tasks button").forEach(b => {
    b.classList.toggle("active", b.dataset.task === t);
  });
  $("costLabel").textContent = tasks[t].agent ? "Cost ~8+" : "Cost " + tasks[t].cost;
}

document.getElementById("tasks").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-task]");
  if (btn) setTask(btn.dataset.task);
});

async function refreshStatus() {
  try {
    const r = await fetch("/status").then(r => r.json());
    $("spent").textContent = r.spentToday;
    $("daily").textContent = r.maxDaily;
    $("bar").style.width = Math.min(100, (r.spentToday / r.maxDaily) * 100) + "%";
    $("maxSingle").value = r.maxSingle;
    $("maxDaily").value = r.maxDaily;
    $("freezeBtn").textContent = r.frozen ? "Unfreeze" : "Freeze";
    $("frozenBanner").style.display = r.frozen ? "block" : "none";
    $("go").disabled = r.frozen;

    const hist = $("history");
    hist.innerHTML = r.history && r.history.length ? "<h3>Recent</h3>" : "";
    (r.history || []).forEach(h => {
      const div = document.createElement("div");
      div.className = "item";
      div.innerHTML = "<div class=\\\"q\\\">" + h.task + ": " + (h.topic || "").slice(0, 90) + "</div><div>" + (h.reply || "").slice(0, 180) + "</div>";
      hist.appendChild(div);
    });
  } catch (e) { console.error(e); }
}

$("go").addEventListener("click", async () => {
  const topic = $("topic").value.trim();
  if (!topic) return;
  $("go").disabled = true;
  $("out").innerHTML = '<div class="card"><div class="meta">Working...</div></div>';

  try {
    const res = await fetch("/ask", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: current, topic })
    });
    const data = await res.json();

    if (data.error) {
      $("out").innerHTML = '<div class="card error">' + data.error + '</div>';
    } else {
      let stepsHtml = "";
      if (data.steps) {
        stepsHtml = '<div class="steps">' + data.steps.map(s =>
          (s.tool ? "- " + s.tool + "(" + (s.toolInput || "") + ")" : "") +
          (s.thought ? "<br>- " + s.thought : "")
        ).join("<br>") + '</div>';
      }
      $("out").innerHTML = '<div class="card"><div class="result">' + data.reply + '</div>' + stepsHtml + '<div class="meta"><span>' + (data.meta || "") + '</span><button class="copy" type="button">Copy</button></div></div>';
      $("out").querySelector(".copy").onclick = () => navigator.clipboard.writeText(data.reply);
    }
  } catch (err) {
    $("out").innerHTML = '<div class="card error">Request failed</div>';
  }
  $("topic").value = "";
  refreshStatus();
});

$("freezeBtn").addEventListener("click", async () => { await fetch("/freeze", { method: "POST" }); refreshStatus(); });
$("resetBtn").addEventListener("click", async () => { await fetch("/reset", { method: "POST" }); refreshStatus(); });
$("clearHistory").addEventListener("click", async () => { await fetch("/clear-history", { method: "POST" }); refreshStatus(); });
$("saveLimits").addEventListener("click", async () => {
  await fetch("/limits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxSingle: Number($("maxSingle").value), maxDaily: Number($("maxDaily").value) })
  });
  refreshStatus();
});

refreshStatus();
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  ensureDaily();
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      spentToday: state.usage.spentToday,
      maxDaily: state.policy.maxDaily,
      maxSingle: state.policy.maxSingle,
      frozen: state.policy.frozen,
      history: state.history.slice(0, 12),
    }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/freeze") {
    state.policy.frozen = !state.policy.frozen;
    save(state);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ frozen: state.policy.frozen }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/reset") {
    state.usage.spentToday = 0;
    state.usage.lastReset = new Date().toISOString().slice(0, 10);
    save(state);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/clear-history") {
    state.history = [];
    state.messages = [];
    save(state);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/limits") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { maxSingle, maxDaily } = JSON.parse(body || "{}");
    if (typeof maxSingle === "number" && maxSingle > 0) state.policy.maxSingle = maxSingle;
    if (typeof maxDaily === "number" && maxDaily > 0) state.policy.maxDaily = maxDaily;
    save(state);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ maxSingle: state.policy.maxSingle, maxDaily: state.policy.maxDaily }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/ask") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { task = "agent", topic } = JSON.parse(body || "{}");
    const def = TASKS[task] || TASKS.agent;

    try {
      let reply = "";
      let meta = "";
      let steps: any[] | undefined;

      if (def.agent) {
        const result = await runAgentLoop(topic, state.policy, state.usage);
        reply = result.final;
        steps = result.steps;
        state.usage = commitAction(state.usage, result.totalCost);
        meta = `Agent · cost ${result.totalCost} · spent ${state.usage.spentToday}/${state.policy.maxDaily}`;
      } else {
        const check = checkAction(state.policy, state.usage, def.cost);
        if (!check.allowed) {
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: `Policy blocked: ${check.reason}` }));
          return;
        }

        let promptInput = topic;
        if (def.usesTool) {
          const urlMatch = topic.match(/https?:\/\/[^\s]+/);
          const target = urlMatch ? urlMatch[0] : topic.trim();
          const fetched = await fetchPage(target);
          promptInput = `URL: ${target}\n\nFetched content:\n${fetched}`;
        }

        const ctx = recentContext();
        reply = await callGrok(def.prompt(promptInput, ctx));
        state.usage = commitAction(state.usage, def.cost);
        meta = `${def.label} · cost ${def.cost} · spent ${state.usage.spentToday}/${state.policy.maxDaily}`;
      }

      state.messages.push({ role: "user", content: topic });
      state.messages.push({ role: "assistant", content: reply });

      const item: HistoryItem = {
        id: Date.now().toString(36),
        task: def.label,
        topic,
        reply,
        ts: Date.now(),
      };
      state.history.unshift(item);
      save(state);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ reply, meta, steps }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message || String(err) }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const port = process.env.PORT || 8080;
server.listen(port, () => console.log(`Alfred web UI on port ${port}`));
