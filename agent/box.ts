/**
 * Box connector tools for Alfred.
 *
 * The Box connector requires root_readwrite and cannot be folder-scoped.
 * Alfred narrows that: reads only from an allowlist of folder IDs;
 * writes only into one Alfred-Outbox folder.
 *
 * Policy lives in checkTool (policy.ts). Set BOX_GATEWAY_URL to the
 * Sprites Box connector gateway.
 */

const GATEWAY = process.env.BOX_GATEWAY_URL || "";

/** List an allowlisted folder. The caller must have passed checkTool. */
export async function boxRead(folderId: string): Promise<string> {
  if (!GATEWAY) throw new Error("BOX_GATEWAY_URL not set");
  if (!/^\d+$/.test(folderId)) throw new Error("Box folder IDs are numeric");
  const res = await fetch(`${GATEWAY}/folders/${folderId}/items`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Box read failed: ${res.status}`);
  const data = await res.json();
  return JSON.stringify(data, null, 2).slice(0, 2000);
}

/**
 * Write a file into the outbox. The parent folder comes from BOX_OUTBOX_ID,
 * never from the agent, so a write cannot land anywhere else.
 */
export async function boxWrite(name: string, content: string): Promise<string> {
  if (!GATEWAY) throw new Error("BOX_GATEWAY_URL not set");
  const outbox = process.env.BOX_OUTBOX_ID || "";
  if (!outbox) throw new Error("BOX_OUTBOX_ID not set");
  const res = await fetch(`${GATEWAY}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content, parent: { id: outbox } }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Box write failed: ${res.status}`);
  const data = await res.json();
  return `Wrote ${name} → ${data.id || "ok"}`;
}
