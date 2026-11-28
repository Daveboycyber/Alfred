import { test } from "node:test";
import assert from "node:assert/strict";
import { stepsToEvents, truncate } from "./events";

test("stepsToEvents maps tool steps to leash decisions", () => {
  const events = stepsToEvents([
    { thought: "Look it up", tool: "search", toolInput: "fly sprites" },
    { thought: "Policy blocked: Folder 9 is not in the read allowlist", tool: "box_read", toolInput: "9" },
    { thought: "Shall I proceed with fetch?", tool: "fetch", toolInput: "https://example.com", needsApproval: true },
    { thought: "Policy blocked further steps: Exceeds daily budget" },
    { thought: "Ready to answer" },
  ]);
  assert.deepEqual(events.map(e => e.kind), ["allowed", "declined", "waiting", "declined"]);
  assert.equal(events[1].detail, "box_read(9) · Folder 9 is not in the read allowlist");
  assert.equal(events[3].title, "Stopped by policy");
  assert.equal(events[3].detail, "Exceeds daily budget");
});

test("stepsToEvents tolerates no steps", () => {
  assert.deepEqual(stepsToEvents(undefined), []);
});

test("truncate keeps short strings", () => {
  assert.equal(truncate("abc", 5), "abc");
  assert.equal(truncate("abcdef", 4), "abc…");
});
