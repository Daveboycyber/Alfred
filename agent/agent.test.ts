import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { runAgentLoop } from "./agent";
import type { Policy, Usage } from "./policy";

let calls = 0;
const originalFetch = globalThis.fetch;

beforeEach(() => {
  calls = 0;
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
});

const frozen: Policy = { maxSingle: 10, maxDaily: 50, frozen: true };
const ok: Policy = { maxSingle: 10, maxDaily: 50, frozen: false };
const usage: Usage = { spentToday: 0, lastReset: "2026-11-25" };

test("frozen makes 0 calls and costs 0", async () => {
  const r = await runAgentLoop("hi", frozen, usage);
  assert.equal(calls, 0);
  assert.equal(r.totalCost, 0);
  assert.match(r.final, /stopped|policy|frozen/i);
});

test("exhausted budget makes 0 calls", async () => {
  const r = await runAgentLoop("hi", ok, { ...usage, spentToday: 49 });
  assert.equal(calls, 0);
  assert.equal(r.totalCost, 0);
});

test("FINAL returns after 1 call", async () => {
  const r = await runAgentLoop("hi", ok, usage);
  assert.equal(calls, 1);
  assert.equal(r.final, "42");
  assert.equal(r.totalCost, 6);
});

test("maxDaily 20 never exceeds 20", async () => {
  // Force multi-step by returning non-FINAL then FINAL
  let n = 0;
  globalThis.fetch = (async () => {
    calls++;
    n++;
    const content = n === 1 ? "THINK: need more\nTOOL: calculate\nINPUT: 1+1" : "FINAL: done";
    return { ok: true, json: async () => ({ choices: [{ message: { content } }] }) } as any;
  }) as any;

  const r = await runAgentLoop("hi", { ...ok, maxDaily: 20 }, usage);
  assert.ok(r.totalCost <= 20);
});
