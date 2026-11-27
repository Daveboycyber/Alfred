import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop, resumeAgentLoop } from "./agent";
import { getApproval } from "./approvals";
import type { Policy, Usage } from "./policy";

let calls = 0;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = 0;
  delete process.env.BOX_OUTBOX_ID;
  delete process.env.BOX_ALLOWED_FOLDERS;
  globalThis.fetch = (async () => {
    calls++;
    return {
      ok: true,
      json: async () => ({ choices: [{ message: { content: "FINAL: 42" } }] }),
    } as any;
  }) as any;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.BOX_OUTBOX_ID;
  delete process.env.BOX_ALLOWED_FOLDERS;
});

const frozen: Policy = { maxSingle: 10, maxDaily: 50, frozen: true };
const ok: Policy = { maxSingle: 10, maxDaily: 50, frozen: false };
const usage: Usage = { spentToday: 0, lastReset: "2026-11-25" };

function mockDecision(contentFor: (n: number) => string) {
  let n = 0;
  globalThis.fetch = (async () => {
    calls++;
    n++;
    return { ok: true, json: async () => ({ choices: [{ message: { content: contentFor(n) } }] }) } as any;
  }) as any;
}

test("frozen makes 0 calls and costs 0", async () => {
  const r = await runAgentLoop("hi", frozen, usage);
  assert.equal(calls, 0);
  assert.equal(r.totalCost, 0);
  assert.equal(r.status, "stopped");
  assert.match(r.final, /stopped|policy|frozen/i);
});

test("exhausted budget makes 0 calls", async () => {
  const r = await runAgentLoop("hi", ok, { ...usage, spentToday: 49 });
  assert.equal(calls, 0);
  assert.equal(r.totalCost, 0);
  assert.equal(r.status, "stopped");
});

test("FINAL returns after 1 call", async () => {
  const r = await runAgentLoop("hi", ok, usage);
  assert.equal(calls, 1);
  assert.equal(r.final, "42");
  assert.equal(r.totalCost, 6);
  assert.equal(r.status, "ok");
});

test("maxDaily 20 never exceeds 20", async () => {
  mockDecision(n => n === 1 ? "THINK: need more\nTOOL: calculate\nINPUT: 1+1" : "FINAL: done");
  const r = await runAgentLoop("hi", { ...ok, maxDaily: 20 }, usage);
  assert.ok(r.totalCost <= 20);
});

test("fetch pauses for approval and does not run the tool", async () => {
  mockDecision(() => "THINK: need the page\nTOOL: fetch\nINPUT: https://example.com/page");
  const r = await runAgentLoop("read example", ok, usage);
  assert.equal(calls, 1);
  assert.equal(r.status, "needs_approval");
  assert.equal(r.totalCost, 6);
  assert.ok(r.approvalId);
  const item = getApproval(r.approvalId!);
  assert.equal(item?.status, "pending");
  assert.equal(item?.tool, "fetch");
  assert.equal(item?.args.input, "https://example.com/page");
  assert.equal(r.steps.at(-1)?.needsApproval, true);
});

test("box write outside the outbox is declined", async () => {
  process.env.BOX_OUTBOX_ID = "outbox1";
  mockDecision(() => "TOOL: box_write\nINPUT: other-folder secret.txt");
  const r = await runAgentLoop("write a secret", ok, usage);
  assert.equal(r.status, "stopped");
  assert.equal(r.approvalId, undefined);
  assert.match(r.steps.at(-1)?.thought ?? "", /Policy blocked/);
  assert.match(r.final, /outbox/);
});

test("resume after approve continues to FINAL", async () => {
  mockDecision(() => "FINAL: The page says hello");
  const { createApproval } = await import("./approvals");
  const item = createApproval(
    "fetch",
    { input: "https://example.com" },
    "test",
    "read the page",
    {
      context: "Goal: read the page",
      totalCost: 6,
      steps: [{ thought: "Shall I fetch?", tool: "fetch", toolInput: "https://example.com", needsApproval: true }],
      maxStepsLeft: 2,
    }
  );
  const r = await resumeAgentLoop(item, "Hello from example.com", ok, usage);
  assert.equal(r.status, "ok");
  assert.match(r.final, /hello/i);
  assert.ok(r.totalCost >= 6);
  assert.ok(r.steps.some(s => s.toolOutput && s.toolOutput.includes("Hello")));
});

test("resume does not double-count spend already committed", async () => {
  mockDecision(() => "FINAL: done");
  const { createApproval } = await import("./approvals");
  const item = createApproval(
    "fetch",
    { input: "https://example.com" },
    "test",
    "read the page",
    {
      context: "Goal: read the page",
      totalCost: 6,
      steps: [{ thought: "Shall I fetch?", tool: "fetch", toolInput: "https://example.com", needsApproval: true }],
      maxStepsLeft: 2,
    }
  );
  // 14 already on the books, of which 6 is this pause. One more step (6) fits in a daily cap of 20.
  const r = await resumeAgentLoop(item, "page text", { ...ok, maxDaily: 20 }, { ...usage, spentToday: 14 });
  assert.equal(r.status, "ok");
  assert.equal(r.final, "done");
  assert.equal(r.totalCost, 12);
  assert.equal(calls, 1);
});
