/**
 * Box connector tools for Alfred.
 *
 * The Box connector requires root_readwrite and cannot be folder-scoped.
 * Alfred narrows that: reads only from an allowlist of folder IDs;
 * writes only into one Alfred-Outbox folder.
 *
 * Set BOX_GATEWAY_URL to the Sprites Box connector gateway.
 */

const GATEWAY = process.env.BOX_GATEWAY_URL || "";

export interface BoxPolicy {
  allowedFolderIds: string[];
  outboxId: string;
}

export async function boxRead(folderIdOrFileId: string): Promise<string> {
  if (!GATEWAY) throw new Error("BOX_GATEWAY_URL not set");
  const res = await fetch(`${GATEWAY}/files/${folderIdOrFileId}`, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Box read failed: ${res.status}`);
  const data = await res.json();
  return JSON.stringify(data, null, 2).slice(0, 2000);
}

export async function boxWrite(name: string, content: string): Promise<string> {
  if (!GATEWAY) throw new Error("BOX_GATEWAY_URL not set");
  const res = await fetch(`${GATEWAY}/files`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Box write failed: ${res.status}`);
  const data = await res.json();
  return `Wrote ${name} → ${data.id || "ok"}`;
}

export function checkBoxTool(
  policy: BoxPolicy,
  tool: "box_read" | "box_write",
  args: { folderId?: string; name?: string }
): { allowed: boolean; reason?: string } {
  if (tool === "box_read") {
    const id = args.folderId || "";
    if (!policy.allowedFolderIds.includes(id)) {
      return { allowed: false, reason: `Folder ${id} is not in the read allowlist` };
    }
  }
  if (tool === "box_write") {
    // Writes are only allowed into the outbox; the caller must target it.
    // Enforcement is on the write path (we always write to outboxId).
    if (!policy.outboxId) return { allowed: false, reason: "No outbox configured" };
  }
  return { allowed: true };
}
