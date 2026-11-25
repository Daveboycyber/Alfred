const CONNECTOR_ID = process.env.LLM_CONNECTOR_ID || "8oMcogpL4Dh-ttow5F4tTw";
const MODEL = process.env.LLM_MODEL || "grok-4.7";
const GATEWAY = process.env.LLM_GATEWAY_URL || `https://api.sprites.dev/v1/gateway/custom_api/${CONNECTOR_ID}`;

export async function callGrok(prompt: string, maxTokens = 700): Promise<string> {
  const res = await fetch(`${GATEWAY}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: maxTokens,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Grok call failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}
