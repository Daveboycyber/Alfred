// Tools Alfred can use under policy
export async function fetchPage(url: string): Promise<string> {
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    throw new Error("Only http(s) URLs are allowed");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Alfred-Sprite-Agent/1.0" },
    });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const text = await res.text();
    const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return plain.slice(0, 4000);
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(`Could not fetch ${url}: ${err.message}`);
  }
}

export async function webSearch(query: string): Promise<string> {
  // Simple DuckDuckGo HTML search (no key needed)
  const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Alfred-Sprite-Agent/1.0" },
    });
    clearTimeout(timeout);
    if (!res.ok) throw new Error(`Search failed: ${res.status}`);
    const html = await res.text();
    // Rough extract of result snippets
    const snippets = html.match(/<a[^>]+class="result__a"[^>]*>.*?<\/a>/g) || [];
    const titles = snippets.slice(0, 5).map(s => s.replace(/<[^>]*>/g, "").trim());
    return titles.length ? `Search results for "${query}":\n` + titles.map((t, i) => `${i + 1}. ${t}`).join("\n") : "No results found.";
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(`Search failed: ${err.message}`);
  }
}

export function calculate(expr: string): string {
  // Very limited safe calculator (numbers and basic operators only)
  if (!/^[0-9+\-*/().\s]+$/.test(expr)) {
    throw new Error("Only numbers and + - * / ( ) allowed");
  }
  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${expr})`)();
    return String(result);
  } catch {
    throw new Error("Invalid expression");
  }
}
