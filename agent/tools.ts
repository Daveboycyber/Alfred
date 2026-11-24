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
    // Strip tags roughly and limit size
    const plain = text.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
    return plain.slice(0, 4000);
  } catch (err: any) {
    clearTimeout(timeout);
    throw new Error(`Could not fetch ${url}: ${err.message}`);
  }
}
