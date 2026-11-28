import { test } from "node:test";
import assert from "node:assert/strict";
import { assertPublicUrl, calculate, webSearch } from "./tools";

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

test("exa search sends query, objective, and highlights", async () => {
  const prevKey = process.env.EXA_API_KEY;
  const prevGateway = process.env.EXA_GATEWAY_URL;
  process.env.EXA_API_KEY = "test-key";
  delete process.env.EXA_GATEWAY_URL;
  const original = globalThis.fetch;
  let seen: { url: string; headers: Record<string, string>; body: Record<string, unknown> } | undefined;
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    seen = {
      url: String(url),
      headers: init.headers as Record<string, string>,
      body: JSON.parse(String(init.body)),
    };
    return {
      ok: true,
      json: async () => ({ results: [{ title: "T", url: "https://exa.ai", highlights: ["a fact"] }] }),
    } as Response;
  }) as typeof fetch;
  try {
    const out = await webSearch("latest Fly.io Sprites", "Rank official docs first and pull the connector model.");
    assert.equal(seen?.url, "https://api.exa.ai/search");
    assert.equal(seen?.headers["x-api-key"], "test-key");
    assert.equal(seen?.body.query, "latest Fly.io Sprites");
    assert.equal(seen?.body.objective, "Rank official docs first and pull the connector model.");
    assert.deepEqual(seen?.body.contents, { highlights: true });
    assert.equal(seen?.body.type, "auto");
    assert.equal("numResults" in (seen?.body || {}), false);
    assert.match(out, /a fact/);
  } finally {
    globalThis.fetch = original;
    if (prevKey === undefined) delete process.env.EXA_API_KEY;
    else process.env.EXA_API_KEY = prevKey;
    if (prevGateway === undefined) delete process.env.EXA_GATEWAY_URL;
    else process.env.EXA_GATEWAY_URL = prevGateway;
  }
});
