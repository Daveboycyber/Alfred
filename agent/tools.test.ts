import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, calculate } from "./tools";

test("rejects localhost", async () => {
  await assert.rejects(() => assertPublicUrl("http://localhost:8080"), /blocked|Internal|Private/);
});

test("rejects 127.0.0.1", async () => {
  await assert.rejects(() => assertPublicUrl("http://127.0.0.1"), /Private|blocked/);
});

test("rejects metadata", async () => {
  await assert.rejects(() => assertPublicUrl("http://169.254.169.254/latest/meta-data"), /Private|blocked/);
});

test("rejects private ranges", async () => {
  await assert.rejects(() => assertPublicUrl("http://10.0.0.5"), /Private/);
  await assert.rejects(() => assertPublicUrl("http://192.168.1.1"), /Private/);
});

test("rejects ipv6 loopback", async () => {
  await assert.rejects(() => assertPublicUrl("http://[::1]/"), /Private|blocked/);
});

test("rejects internal hosts", async () => {
  await assert.rejects(() => assertPublicUrl("http://foo.internal"), /Internal/);
  await assert.rejects(() => assertPublicUrl("http://app.flycast"), /Internal/);
});

test("rejects non-http", async () => {
  await assert.rejects(() => assertPublicUrl("file:///etc/passwd"), /http/);
  await assert.rejects(() => assertPublicUrl("ftp://example.com"), /http/);
  await assert.rejects(() => assertPublicUrl("not a url"), /valid URL/);
});

test("allows public IP", async () => {
  const u = await assertPublicUrl("https://93.184.216.34/");
  assert.equal(u.hostname, "93.184.216.34");
});

test("allowlist rejects when set", async () => {
  process.env.ALFRED_ALLOWED_DOMAINS = "fly.io";
  await assert.rejects(() => assertPublicUrl("https://93.184.216.34/"), /allowlist/);
  delete process.env.ALFRED_ALLOWED_DOMAINS;
});

test("calculate works", () => {
  assert.equal(calculate("(1+2)*3"), "9");
});

test("calculate rejects bad input", () => {
  assert.throws(() => calculate("process.exit()"), /Invalid/);
  assert.throws(() => calculate("1/0"), /Non-finite|Invalid/);
});
