// Simple web interface for Alfred
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

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Alfred</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 720px; margin: 40px auto; padding: 0 16px; background: #0f0f0f; color: #eee; }
    h1 { color: #d4ff00; }
    textarea { width: 100%; height: 80px; background: #1a1a1a; color: #eee; border: 1px solid #333; padding: 8px; border-radius: 6px; }
    button { background: #d4ff00; color: #000; border: none; padding: 10px 18px; border-radius: 6px; font-weight: 600; cursor: pointer; }
    pre { background: #1a1a1a; padding: 16px; border-radius: 6px; white-space: pre-wrap; }
    .meta { color: #888; font-size: 0.9em; }
  </style>
</head>
<body>
  <h1>Alfred</h1>
  <p>Personal agent on a Fly.io Sprite — useful work under policy.</p>
  <form id="f">
    <textarea id="topic" placeholder="What should Alfred summarize or research?"></textarea><br><br>
    <button type="submit">Ask Alfred</button>
  </form>
  <div id="out"></div>
  <script>
    document.getElementById('f').onsubmit = async (e) => {
      e.preventDefault();
      const topic = document.getElementById('topic').value.trim();
      if (!topic) return;
      const out = document.getElementById('out');
      out.innerHTML = '<p class="meta">Thinking...</p>';
      const res = await fetch('/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic })
      });
      const data = await res.json();
      out.innerHTML = '<pre>' + (data.error || data.reply || '') + '</pre>' +
        '<p class="meta">' + (data.meta || '') + '</p>';
    };
  </script>
</body>
</html>`;

const server = createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end(html);
    return;
  }

  if (req.method === "POST" && req.url === "/ask") {
    let body = "";
    for await (const chunk of req) body += chunk;
    const { topic } = JSON.parse(body || "{}");

    const cost = 8;
    const check = checkAction(policy, usage, cost);

    if (!check.allowed) {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: `Policy blocked: ${check.reason}`, meta: `Usage: ${usage.spentToday}/${policy.maxDaily}` }));
      return;
    }

    try {
      const reply = await callGrok(
        `You are Alfred, a personal agent. Summarize the following in 3 concise bullet points:\n\n${topic}`
      );
      usage = commitAction(usage, cost);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ reply, meta: `Cost ${cost} · spent today ${usage.spentToday}/${policy.maxDaily}` }));
    } catch (err: any) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  res.writeHead(404);
  res.end("Not found");
});

const port = process.env.PORT || 8080;
server.listen(port, () => {
  console.log(`Alfred web UI listening on port ${port}`);
});
