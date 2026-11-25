/**
 * Approval queue: risky tool calls pause instead of running.
 * In-memory for the single server process.
 */

export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, string>;
  reason: string;
  createdAt: number;
  goal: string;
  status: "pending" | "approved" | "denied";
  output?: string;
}

const pending = new Map<string, PendingAction>();

export function createApproval(tool: string, args: Record<string, string>, reason: string, goal = ""): PendingAction {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const item: PendingAction = { id, tool, args, reason, createdAt: Date.now(), goal, status: "pending" };
  pending.set(id, item);
  return item;
}

export function listApprovals(): PendingAction[] {
  return [...pending.values()].sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
}

export function getApproval(id: string): PendingAction | undefined {
  return pending.get(id);
}

export function resolveApproval(id: string, allow: boolean, output?: string): PendingAction | undefined {
  const item = pending.get(id);
  if (!item || item.status !== "pending") return undefined;
  item.status = allow ? "approved" : "denied";
  item.reason = allow ? "approved" : "denied";
  if (output !== undefined) item.output = output.slice(0, 4000);
  return item;
}
