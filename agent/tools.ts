import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateIp(ip: string): boolean {
  const l = ip.toLowerCase();
  if (l.includes(":")) {
    if (l.startsWith("::ffff:")) return isPrivateIp(l.slice(7));
    return l === "::1" || l === "::" || l.startsWith("fc") || l.startsWith("fd") || l.startsWith("fe80");
  }
  const [a, b] = l.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127);
}

function allowedByList(host: string): boolean {
  const list = (process.env.ALFRED_ALLOWED_DOMAINS ?? "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.length === 0 || list.some(d => host === d || host.endsWith("." + d));
}

export async function assertPublicUrl(raw: string): Promise<URL> {
  let u: URL;
  try { u = new URL(raw); } catch { throw new Error("Not a valid URL"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("Only http(s) URLs are allowed");
  const host = u.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local") || host.endsWith(".flycast"))
    throw new Error("Internal hosts are blocked");
  if (!allowedByList(host)) throw new Error(`Host ${host} is not on the allowlist`);
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map(a => a.address);
  if (addrs.length === 0 || addrs.some(isPrivateIp)) throw new Error("Private or internal addresses are blocked");
  return u;
}

async function guardedFetch(raw: string, init: RequestInit = {}): Promise<Response> {
  let url = raw;
  for (let hop = 0; hop < 4; hop++) {
    const u = await assertPublicUrl(url);
    const res = await fetch(u, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(8000),
      headers: { "User-Agent": "Alfred-Sprite-Agent/1.0", ...(init.headers ?? {}) },
    });
    const loc = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && loc) {
      url = new URL(loc, u).toString();
      continue;
    }
    return res;
  }
  throw new Error("Too many redirects");
}

export async function fetchPage(url: string): Promise<string> {
  const res = await guardedFetch(url);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
  let text = await res.text();
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return text.slice(0, 400_000);
}

export async function webSearch(query: string): Promise<string> {
  const exa = process.env.EXA_GATEWAY_URL;
  if (exa) {
    try {
      const res = await fetch(`${exa}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, numResults: 5, contents: { text: { maxCharacters: 400 } } }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) {
        const data = await res.json();
        const results = data.results || [];
        return results.map((r: any, i: number) => `${i + 1}. ${r.title}\n${r.url}\n${(r.text || "").slice(0, 300)}`).join("\n\n") || "No results";
      }
    } catch { /* fall through */ }
  }

  const ddg = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const res = await guardedFetch(ddg);
  const html = await res.text();
  const results: string[] = [];
  const re = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) && results.length < 5) {
    let href = m[1];
    if (href.includes("uddg=")) {
      const u = new URL(href.startsWith("//") ? "https:" + href : href);
      href = decodeURIComponent(u.searchParams.get("uddg") || href);
    }
    const title = m[2].replace(/<[^>]+>/g, "").replace(/&/g, "&").replace(/</g, "<").replace(/>/g, ">").replace(/"/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, " ").trim();
    const snippet = (html.slice(m.index, m.index + 800).match(/result__snippet[^>]*>([\s\S]*?)<\//)?.[1] || "").replace(/<[^>]+>/g, "").slice(0, 300);
    results.push(`${results.length + 1}. ${title}\n${href}\n${snippet}`);
  }
  return results.join("\n\n") || "No results";
}

export function calculate(expr: string): string {
  if (expr.length > 200) throw new Error("Expression too long");
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) throw new Error("Invalid characters");
  try {
    const result = Function(`"use strict"; return (${expr})`)();
    if (typeof result !== "number" || !Number.isFinite(result)) throw new Error("Non-finite result");
    return String(result);
  } catch {
    throw new Error("Invalid expression");
  }
}
