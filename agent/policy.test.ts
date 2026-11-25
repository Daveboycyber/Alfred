import { test } from "node:test";
import assert from "node:assert/strict";
import { checkAction, commitAction, Policy, Usage } from "./policy";

const basePolicy: Policy = { maxSingle: 10, maxDaily: 50, frozen: false };
const baseUsage: Usage = { spentToday: 0, lastReset: "2026-11-25" };

test("allows within limits", () => {
  const r = checkAction(basePolicy, baseUsage, 5);
  assert.equal(r.allowed, true);
});

test("blocks over single limit", () => {
  const r = checkAction(basePolicy, baseUsage, 15);
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /single/);
});

test("blocks over daily", () => {
  const r = checkAction(basePolicy, { ...baseUsage, spentToday: 48 }, 5);
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /daily/);
});

test("frozen blocks everything", () => {
  const r = checkAction({ ...basePolicy, frozen: true }, baseUsage, 1);
  assert.equal(r.allowed, false);
  assert.match(r.reason ?? "", /frozen/);
});

test("commitAction does not mutate input", () => {
  const before = { ...baseUsage };
  const after = commitAction(before, 7);
  assert.equal(before.spentToday, 0);
  assert.equal(after.spentToday, 7);
});
