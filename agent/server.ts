// Alfred web interface — tool use under policy
import { createServer } from "node:http";
import { checkAction, commitAction, Policy, Usage } from "./policy";
import { callGrok } from "./llm";
import { load, save, State, HistoryItem } from "./store";
import { fetchPage } from "./tools";

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

const TASKS: Record<string, { cost: number; prompt: (t: string, ctx: string) => string; label: string; usesTool?: boolean }> = {
  chat: {
    cost: 5,
    label: "Chat",
    prompt: (t, ctx) => `You are Alfred, a helpful personal agent that works under policy. ${ctx ? "Conversation so far:\n" + ctx + "\n\n" : ""}User: ${t}\n\nReply helpfully and concisely.`,
  },
  summarize: {
    cost: 6,
    label: "Summarize",
    prompt: (t, ctx) => `You are Alfred. ${ctx ? "Recent context:\n" + ctx + "\n\n" : ""}Summarize the following in 3 concise bullet points:\n\n${t}`,
  },
  research: {
    cost: 8,
    label: "Research",
    prompt: (t, ctx) => `You are Alfred. ${ctx ? "Recent context:\n" + ctx + "\n\n" : ""}Research the topic and return 4 key points with a one-sentence takeaway:\n\n${t}`,
  },
  draft: {
    cost: 9,
    label: "Draft",
    prompt: (t, ctx) => `You are Alfred. ${ctx ? "Recent context:\n" + ctx + "\n\n" : ""}Write a short, clear draft (3-5 sentences) based on this request:\n\n${t}`,
  },
  explain: {
    cost: 7,
    label: "Explain",
    prompt: (t, ctx) => `You are Alfred. ${ctx ? "Recent context:\n" + ctx + "\n\n" : ""}Explain the following simply, as if to a smart non-expert, in 2-3 short paragraphs:\n\n${t}`,
  },
  actions: {
    cost: 7,
    label: "Action items",
    prompt: (t, ctx) => `You are Alfred. ${ctx ? "Recent context:\n" + ctx + "\n\n" : ""}Turn the following into a short list of concrete next actions (max 5):\n\n${t}`,
  },
  fetch: {
    cost: 9,
    label: "Fetch & Summarize",
    usesTool: true,
    prompt: (t, ctx) => `You are Alfred. The user gave a URL or asked about a page. Fetch content is provided below. Summarize the key points in 3-4 bullets and note anything important.\n\n${t}`,
  },
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
    --bg: #0c0c0f; --card: #16161c; --border: #2a2a32;
    --text: #e8e8ed; --muted: #8a8a96; --accent: #c8f542;
    --accent-dim: #9bc92e; --danger: #ff6b6b;
  }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: system-ui, -apple-system, sans-serif; background: var(--bg); color: var(--text); }
  .wrap { max-width: 860px; margin: 0 auto; padding: 28px 18px 70px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
  h1 { margin: 0; font-size: 26px; }
  h1 span { color: var(--accent); }
  .badge { font-size: 12px; background: #1e2a12; color: var(--accent); padding: 4px 10px; border-radius: 999px; border: 1px solid #2f4018; }
  .status { background: var(--card); border: 1px solid var(--border); border-radius: 12px; padding: 14px 16px; margin-bottom: 16px; display: grid; grid-template-columns: 1fr auto; gap: 12px; font-size: 14px; }
  .status b { color: var(--accent); }
  .meter { height: 6px; background: #222; border-radius: 3px; margin-top: 6px; overflow: hidden; }
  .meter > div { height: 100%; background: var(--accent); width: 0%; transition: width .3s; }
  .controls { display: flex; gap: 8px; flex-wrap: wrap; }
  .controls button, .controls input { background: #111114; color: var(--text); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 13px; }
  .card { background: var(--card); border: 1px solid var(--border); border-radius: 16px; padding: 18px; margin-bottom: 14px; }
  .tasks { display: flex; gap: 6px; flex-wrap: wrap; margin-bottom: 12px; }
  .tasks button { background: transparent; color: var(--muted); border: 1px solid var(--border); padding: 7px 12px; border-radius: 8px; cursor: pointer; font-size: 13px; }
  .tasks button.active { background: #1e2a12; color: var(--accent); border-color: #3a4f20; }
  textarea { width: 100%; min-height: 88px; background: #111114; color: var(--text); border: 1px solid var(--border); border-radius: 10px; padding: 12px; font-family: inherit; font-size: 15px; resize: vertical; }
  textarea:focus { outline: none; border-color: var(--accent-dim); }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
  button.primary { background: var(--accent); color: #111; border: none; padding: 10px 18px; border-radius: 8px; font-weight: 600; cursor: pointer; }
  button.primary:disabled { opacity: .5; cursor: not-allowed; }
  .cost { color: var(--muted); font-size: 13px; }
  .result { white-space: pre-wrap; line-height: 1.55; font-size: 15px; }
  .error { color: var(--danger); }
  .meta { color: var(--muted); font-size: 13px; margin-top: 10px; display: flex; justify-content: space-between; }
  .copy { background: transparent; border: 1px solid var(--border); color: var(--muted); border-radius: 6px; padding: 3px 8px; cursor: pointer; font-size: 12px; }
  .history { margin-top: 20px; }
  .history h3 { font-size: 13px; color: var(--muted); margin: 0 0 8px; font-weight: 500; }
  .item { background: var(--card); border: 1px solid var(--border); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; font-size: 14px; }
  .item .q { color: var(--muted); margin-bottom: 4px; }
  .frozen-banner { background: #3a1a1a; color: var(--danger); padding: 10px 14px; border-radius: 10px; margin-bottom: 14px; display: none; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><span>Alfred</span></h1>
    <div class="badge">Sprite + Policy + Tools</div>
  </header>

  <div id="frozenBanner" class="frozen-banner">Agent is frozen. Unfreeze to continue.</div>

  <div class="status">
    <div>
      Spent today: <b id="spent">0</b> / <b id="daily">50</b>
      <div class="meter"><div id="bar"></div></div>
    </div>
    <div class="controls">
      <button id="freezeBtn">Freeze</button>
      <button id="resetBtn">Reset usage</button>
      <button id="clearHistory">Clear history</button>
      <input id="maxSingle" type="number" min="1" style="width:70px" title="Max single">
      <input id="maxDaily" type="number" min="1" style="width:70px" title="Max daily">
      <button id="saveLimits">Save limits</button>
    </div>
  </div>

  <div class="card">
    <div class="tasks" id="tasks">
      <button data-task="chat" class="active">Chat</button>
      <button data-task="summarize">Summarize</button>
      <button data-task="research">Research</button>
      <button data-task="draft">Draft</button>
      <button data-task="explain">Explain</button>
      <button data-task="actions">Action items</button>
      <button data-task="fetch">Fetch & Summarize</button>
    </div>
    <textarea id="topic" placeholder="Talk to Alfred, give a task, or paste a URL for Fetch & Summarize..."></textarea>
    <div class="row">
      <span class="cost" id="costLabel">Cost: 5</span>
      <button class="primary" id="go">Ask Alfred</button>
    </div>
  </div>

  <div id="out"></div>
  <div class="history" id="history"></div>
</div>

<script>
const tasks = ${JSON.stringify(Object.fromEntries(Object.entries(TASKS).map(([k,v]) => [k, {cost: v.cost, label: v.label}])))};
let current = "chat";

const $ = (id) => document.getElementById(id);

function setTask(t) {
  current = t;
  document.querySelectorAll("#tasks button").forEach(b => b.classList.toggle("active", b.dataset.task === t));
  $("costLabel").textContent = "Cost: " + tasks[t].cost;
}

document.getElementById("tasks").onclick = (e) => {
  if (e.target.dataset.task) setTask(e.target.dataset.task);
};

async function refreshStatus() {
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
  hist.innerHTML = r.history?.length ? '<h3>Recent</h3>' : '';
  (r.history || []).forEach(h => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = '<div class="q">' + h.task + ': ' + (h.topic || '').slice(0, 90) + '</div><div>' + (h.reply || '').slice(0, 180) + '</div>';
    hist.appendChild(div);
  });
}

$("go").onclick = async () => {
  const topic = $("topic").value.trim();
  if (!topic) return;
  $("go").disabled = true;
  $("out").innerHTML = '<div class="card"><div class="meta">Thinking…</div></div>';

  const res = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: current, topic })
  });
  const data = await res.json();

  if (data.error) {
    $("out").innerHTML = '<div class="card error">' + data.error + '</div>';
  } else {
    $("out").innerHTML = '<div class="card"><div class="result">' + data.reply + '</div><div class="meta"><span>' + data.meta + '</span><button class="copy" onclick="navigator.clipboard.writeText(this.closest(\'.card\').querySelector(\'.result\').textContent)">Copy</button></div></div>';
  }
  $("topic").value = "";
  refreshStatus();
};

$("freezeBtn").onclick = async () => { await fetch("/freeze", { method: "POST" }); refreshStatus(); };
$("resetBtn").onclick = async () => { await fetch("/reset", { method: "POST" }); refreshStatus(); };
$("clearHistory").onclick = async () => { await fetch("/clear-history", { method: "POST" }); refreshStatus(); };
$("saveLimits").onclick = async () => {
  await fetch("/limits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ maxSingle: Number($("maxSingle").value), maxDaily: Number($("maxDaily").value) })
  });
  refreshStatus();
};

refreshStatus();
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  ensureDaily();
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
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
    const { task = "chat", topic } = JSON.parse(body || "{}");
    const def = TASKS[task] || TASKS.chat;

    const check = checkAction(state.policy, state.usage, def.cost);
    if (!check.allowed) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Policy blocked: ${check.reason}` }));
      return;
    }

    try {
      let promptInput = topic;

      // Tool use: fetch page under policy
      if (def.usesTool) {
        const urlMatch = topic.match(/https?:\/\/[^\s]+/);
        const target = urlMatch ? urlMatch[0] : topic.trim();
        const fetched = await fetchPage(target);
        promptInput = `URL: ${target}\n\nFetched content:\n${fetched}`;
      }

      const ctx = recentContext();
      const reply = await callGrok(def.prompt(promptInput, ctx));

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

      state.usage = commitAction(state.usage, def.cost);
      save(state);

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        reply,
        meta: `${def.label} · cost ${def.cost} · spent ${state.usage.spentToday}/${state.policy.maxDaily}`,
      }));
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
