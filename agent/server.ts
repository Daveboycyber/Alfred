// Alfred web interface — expanded capabilities
import { createServer } from "node:http";
import { checkAction, commitAction, Policy, Usage } from "./policy";
import { callGrok } from "./llm";

const policy: Policy = {
  maxSingle: 10,
  maxDaily: 50,
  frozen: false,
};

let usage: Usage = {
  spentToday: 0,
  lastReset: new Date().toISOString().slice(0, 10),
};

const TASKS: Record<string, { cost: number; prompt: (t: string) => string; label: string }> = {
  summarize: {
    cost: 6,
    label: "Summarize",
    prompt: (t) => `You are Alfred. Summarize the following in 3 concise bullet points:\n\n${t}`,
  },
  research: {
    cost: 8,
    label: "Research",
    prompt: (t) => `You are Alfred. Research the topic and return 4 key points with a one-sentence takeaway:\n\n${t}`,
  },
  draft: {
    cost: 9,
    label: "Draft",
    prompt: (t) => `You are Alfred. Write a short, clear draft (3-5 sentences) based on this request:\n\n${t}`,
  },
  explain: {
    cost: 7,
    label: "Explain",
    prompt: (t) => `You are Alfred. Explain the following simply, as if to a smart non-expert, in 2-3 short paragraphs:\n\n${t}`,
  },
  actions: {
    cost: 7,
    label: "Action items",
    prompt: (t) => `You are Alfred. Turn the following into a short list of concrete next actions (max 5):\n\n${t}`,
  },
};

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
    --accent-dim: #9bc92e; --danger: #ff6b6b; --warn: #ffb347;
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
  .controls button:hover { border-color: var(--accent-dim); }
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
    <div class="badge">Sprite + Policy</div>
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
      <input id="maxSingle" type="number" min="1" style="width:70px" title="Max single">
      <input id="maxDaily" type="number" min="1" style="width:70px" title="Max daily">
      <button id="saveLimits">Save limits</button>
    </div>
  </div>

  <div class="card">
    <div class="tasks" id="tasks">
      <button data-task="summarize" class="active">Summarize</button>
      <button data-task="research">Research</button>
      <button data-task="draft">Draft</button>
      <button data-task="explain">Explain</button>
      <button data-task="actions">Action items</button>
    </div>
    <textarea id="topic" placeholder="What should Alfred do?"></textarea>
    <div class="row">
      <span class="cost" id="costLabel">Cost: 6</span>
      <button class="primary" id="go">Ask Alfred</button>
    </div>
  </div>

  <div id="out"></div>
  <div class="history" id="history"></div>
</div>

<script>
const tasks = ${JSON.stringify(Object.fromEntries(Object.entries(TASKS).map(([k,v]) => [k, {cost: v.cost, label: v.label}])))};
let current = "summarize";

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
    addHistory(tasks[current].label, topic, data.reply);
  }
  refreshStatus();
};

$("freezeBtn").onclick = async () => {
  await fetch("/freeze", { method: "POST" });
  refreshStatus();
};

$("resetBtn").onclick = async () => {
  await fetch("/reset", { method: "POST" });
  refreshStatus();
};

$("saveLimits").onclick = async () => {
  await fetch("/limits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      maxSingle: Number($("maxSingle").value),
      maxDaily: Number($("maxDaily").value),
    })
  });
  refreshStatus();
};

function addHistory(label, q, a) {
  const div = document.createElement("div");
  div.className = "item";
  div.innerHTML = '<div class="q">' + label + ': ' + q.slice(0, 90) + '</div><div>' + a.slice(0, 180) + (a.length > 180 ? "…" : "") + '</div>';
  $("history").prepend(div);
}

refreshStatus();
</script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);

  if (req.method === "GET" && url.pathname === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  if (req.method === "GET" && url.pathname === "/status") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      spentToday: usage.spentToday,
      maxDaily: policy.maxDaily,
      maxSingle: policy.maxSingle,
      frozen: policy.frozen,
    }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/freeze") {
    policy.frozen = !policy.frozen;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ frozen: policy.frozen }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/reset") {
    usage.spentToday = 0;
    usage.lastReset = new Date().toISOString().slice(0, 10);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/limits") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { maxSingle, maxDaily } = JSON.parse(body || "{}");
    if (typeof maxSingle === "number" && maxSingle > 0) policy.maxSingle = maxSingle;
    if (typeof maxDaily === "number" && maxDaily > 0) policy.maxDaily = maxDaily;
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ maxSingle: policy.maxSingle, maxDaily: policy.maxDaily }));
    return;
  }

  if (req.method === "POST" && url.pathname === "/ask") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { task = "summarize", topic } = JSON.parse(body || "{}");
    const def = TASKS[task] || TASKS.summarize;

    const check = checkAction(policy, usage, def.cost);
    if (!check.allowed) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Policy blocked: ${check.reason}` }));
      return;
    }

    try {
      const reply = await callGrok(def.prompt(topic));
      usage = commitAction(usage, def.cost);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        reply,
        meta: `${def.label} · cost ${def.cost} · spent ${usage.spentToday}/${policy.maxDaily}`,
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
