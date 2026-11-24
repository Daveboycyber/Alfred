// Alfred web interface
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
};

const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Alfred</title>
<style>
  :root {
    --bg: #0c0c0f;
    --card: #16161c;
    --border: #2a2a32;
    --text: #e8e8ed;
    --muted: #8a8a96;
    --accent: #c8f542;
    --accent-dim: #9bc92e;
    --danger: #ff6b6b;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; font-family: "SF Pro Text", system-ui, -apple-system, sans-serif;
    background: var(--bg); color: var(--text); min-height: 100vh;
  }
  .wrap { max-width: 800px; margin: 0 auto; padding: 32px 20px 60px; }
  header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 28px; }
  h1 { margin: 0; font-size: 28px; letter-spacing: -0.5px; }
  h1 span { color: var(--accent); }
  .badge {
    font-size: 12px; background: #1e2a12; color: var(--accent); padding: 4px 10px;
    border-radius: 999px; border: 1px solid #2f4018;
  }
  .status {
    background: var(--card); border: 1px solid var(--border); border-radius: 12px;
    padding: 14px 18px; margin-bottom: 20px; display: flex; gap: 24px; font-size: 14px;
  }
  .status b { color: var(--accent); }
  .meter { flex: 1; height: 6px; background: #222; border-radius: 3px; margin-top: 6px; overflow: hidden; }
  .meter > div { height: 100%; background: var(--accent); width: 0%; transition: width .3s; }
  .card {
    background: var(--card); border: 1px solid var(--border); border-radius: 16px;
    padding: 20px; margin-bottom: 16px;
  }
  .tasks { display: flex; gap: 8px; margin-bottom: 12px; }
  .tasks button {
    flex: 1; background: transparent; color: var(--muted); border: 1px solid var(--border);
    padding: 8px 12px; border-radius: 8px; cursor: pointer; font-size: 14px;
  }
  .tasks button.active { background: #1e2a12; color: var(--accent); border-color: #3a4f20; }
  textarea {
    width: 100%; min-height: 90px; background: #111114; color: var(--text);
    border: 1px solid var(--border); border-radius: 10px; padding: 12px;
    font-family: inherit; font-size: 15px; resize: vertical;
  }
  textarea:focus { outline: none; border-color: var(--accent-dim); }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 12px; }
  button.primary {
    background: var(--accent); color: #111; border: none; padding: 10px 20px;
    border-radius: 8px; font-weight: 600; cursor: pointer; font-size: 15px;
  }
  button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
  .cost { color: var(--muted); font-size: 13px; }
  .result {
    white-space: pre-wrap; line-height: 1.5; font-size: 15px;
  }
  .error { color: var(--danger); }
  .meta { color: var(--muted); font-size: 13px; margin-top: 8px; }
  .history { margin-top: 24px; }
  .history h3 { font-size: 14px; color: var(--muted); margin: 0 0 10px; font-weight: 500; }
  .item {
    background: var(--card); border: 1px solid var(--border); border-radius: 10px;
    padding: 12px 14px; margin-bottom: 8px; font-size: 14px;
  }
  .item .q { color: var(--muted); margin-bottom: 6px; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1><span>Alfred</span></h1>
    <div class="badge">Sprite + Policy</div>
  </header>

  <div class="status" id="status">
    <div>Spent today: <b id="spent">0</b> / <b id="daily">50</b>
      <div class="meter"><div id="bar"></div></div>
    </div>
    <div>Single limit: <b id="single">10</b></div>
    <div id="frozen" style="display:none;color:var(--danger)">FROZEN</div>
  </div>

  <div class="card">
    <div class="tasks" id="tasks">
      <button data-task="summarize" class="active">Summarize</button>
      <button data-task="research">Research</button>
      <button data-task="draft">Draft</button>
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

const els = {
  tasks: document.getElementById("tasks"),
  topic: document.getElementById("topic"),
  go: document.getElementById("go"),
  cost: document.getElementById("costLabel"),
  out: document.getElementById("out"),
  history: document.getElementById("history"),
  spent: document.getElementById("spent"),
  daily: document.getElementById("daily"),
  single: document.getElementById("single"),
  bar: document.getElementById("bar"),
  frozen: document.getElementById("frozen"),
};

function setTask(t) {
  current = t;
  els.tasks.querySelectorAll("button").forEach(b => b.classList.toggle("active", b.dataset.task === t));
  els.cost.textContent = "Cost: " + tasks[t].cost;
}

els.tasks.onclick = (e) => {
  if (e.target.dataset.task) setTask(e.target.dataset.task);
};

async function refreshStatus() {
  const r = await fetch("/status").then(r => r.json());
  els.spent.textContent = r.spentToday;
  els.daily.textContent = r.maxDaily;
  els.single.textContent = r.maxSingle;
  els.bar.style.width = Math.min(100, (r.spentToday / r.maxDaily) * 100) + "%";
  els.frozen.style.display = r.frozen ? "block" : "none";
}

els.go.onclick = async () => {
  const topic = els.topic.value.trim();
  if (!topic) return;
  els.go.disabled = true;
  els.out.innerHTML = '<div class="card"><div class="meta">Thinking…</div></div>';

  const res = await fetch("/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ task: current, topic })
  });
  const data = await res.json();

  if (data.error) {
    els.out.innerHTML = '<div class="card error">' + data.error + '</div>';
  } else {
    els.out.innerHTML = '<div class="card"><div class="result">' + data.reply + '</div><div class="meta">' + data.meta + '</div></div>';
    addHistory(tasks[current].label, topic, data.reply);
  }
  els.go.disabled = false;
  refreshStatus();
};

function addHistory(label, q, a) {
  const div = document.createElement("div");
  div.className = "item";
  div.innerHTML = '<div class="q">' + label + ': ' + q.slice(0, 80) + '</div><div>' + a.slice(0, 160) + (a.length > 160 ? "…" : "") + '</div>';
  els.history.prepend(div);
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
