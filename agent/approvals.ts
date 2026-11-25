/**
 * Approval queue: risky tool calls pause instead of failing.
 * State is kept in-memory for the demo; persist via store if needed.
 */

export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, string>;
  reason: string;
  createdAt: number;
}

const pending = new Map<string, PendingAction>();

export function createApproval(tool: string, args: Record<string, string>, reason: string): PendingAction {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const item: PendingAction = { id, tool, args, reason, createdAt: Date.now() };
  pending.set(id, item);
  return item;
}

export function listApprovals(): PendingAction[] {
  return [...pending.values()].sort((a, b) => b.createdAt - a.createdAt);
}

export function getApproval(id: string): PendingAction | undefined {
  return pending.get(id);
}

export function resolveApproval(id: string, allow: boolean): PendingAction | undefined {
  const item = pending.get(id);
  if (!item) return undefined;
  pending.delete(id);
  return { ...item, reason: allow ? "approved" : "denied" };
}
