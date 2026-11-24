// Grok LLM client via Sprites Custom API connector
const CONNECTOR_ID = "8oMcogpL4Dh-ttow5F4tTw";
const GATEWAY = `https://api.sprites.dev/v1/gateway/custom_api/${CONNECTOR_ID}`;

export async function callGrok(prompt: string, maxTokens = 200): Promise<string> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "grok-4.7",
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok call failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
