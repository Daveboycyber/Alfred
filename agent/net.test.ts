import { test } from "node:test";
import assert from "node:assert/strict";
import { clientIp } from "./net";

const req = (headers: Record<string, string>, remoteAddress = "10.0.0.1") => ({ headers, socket: { remoteAddress } });

test("prefers the address Fly's proxy sets", () => {
  assert.equal(clientIp(req({ "fly-client-ip": "203.0.113.7", "x-forwarded-for": "1.2.3.4, 203.0.113.7" })), "203.0.113.7");
});

test("ignores client-supplied X-Forwarded-For entries", () => {
  // A client sends a fake first entry; the proxy appends the real address.
  assert.equal(clientIp(req({ "x-forwarded-for": "6.6.6.6, 198.51.100.9" })), "198.51.100.9");
});

test("falls back to the socket", () => {
  assert.equal(clientIp(req({})), "10.0.0.1");
});
