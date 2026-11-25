// Lightweight chain-agnostic policy for Alfred
// Limits actions/spend and supports freeze

export interface Policy {
  maxSingle: number;
  maxDaily: number;
  frozen: boolean;
}

export interface Usage {
  spentToday: number;
  lastReset: string; // ISO date
}

export function checkAction(policy: Policy, usage: Usage, amount: number): { allowed: boolean; reason?: string } {
  if (policy.frozen) return { allowed: false, reason: "Agent is frozen" };
  if (amount > policy.maxSingle) return { allowed: false, reason: "Exceeds single-action limit" };
  if (usage.spentToday + amount > policy.maxDaily) return { allowed: false, reason: "Exceeds daily budget" };
  return { allowed: true };
}

export function commitAction(usage: Usage, amount: number): Usage {
  return { ...usage, spentToday: usage.spentToday + amount };
}

function listEnv(name: string, fallback: string): string[] {
  return (process.env[name] ?? fallback).split(",").map(s => s.trim()).filter(Boolean);
}

/** Decide whether a tool may run, must wait for approval, or is refused. */
export function checkTool(tool: string, input: string): { allowed: boolean; reason?: string; needsApproval: boolean } {
  const approve = new Set(listEnv("ALFRED_APPROVE_TOOLS", "fetch,box_write"));
  const outbox = process.env.BOX_OUTBOX_ID ?? "";
  const folders = listEnv("BOX_ALLOWED_FOLDERS", "");

  if (tool === "box_write") {
    if (!outbox) return { allowed: false, needsApproval: false, reason: "No outbox configured" };
    const folder = input.trim().split(/\s+/)[0] ?? "";
    if (input.includes(" ") && folder !== outbox) {
      return { allowed: false, needsApproval: false, reason: `Writes only allowed in outbox ${outbox}` };
    }
  }

  if (tool === "box_read") {
    const id = input.trim();
    if (!folders.includes(id)) {
      return { allowed: false, needsApproval: false, reason: `Folder ${id} is not in the read allowlist` };
    }
  }

  return { allowed: true, needsApproval: approve.has(tool) };
}
