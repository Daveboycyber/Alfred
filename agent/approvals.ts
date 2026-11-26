/**
 * Approval queue: risky tool calls pause instead of running.
 * In-memory for the single server process. Stores enough state
 * to resume the agent loop after the human approves.
 */

export interface StepSnapshot {
  thought: string;
  tool?: string;
  toolInput?: string;
  toolOutput?: string;
  final?: string;
  needsApproval?: boolean;
}

export interface PendingAction {
  id: string;
  tool: string;
  args: Record<string, string>;
  reason: string;
  createdAt: number;
  goal: string;
  status: "pending" | "approved" | "denied";
  output?: string;
  /** Context string so far (goal + prior tool results) */
  context?: string;
  /** Cost already committed before the pause */
  totalCost?: number;
  /** Steps already taken */
  steps?: StepSnapshot[];
  /** Remaining max steps after resume */
  maxStepsLeft?: number;
}

const pending = new Map<string, PendingAction>();

export function createApproval(
  tool: string,
  args: Record<string, string>,
  reason: string,
  goal = "",
  resume?: {
    context: string;
    totalCost: number;
    steps: StepSnapshot[];
    maxStepsLeft: number;
  }
): PendingAction {
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const item: PendingAction = {
    id,
    tool,
    args,
    reason,
    createdAt: Date.now(),
    goal,
    status: "pending",
    context: resume?.context,
    totalCost: resume?.totalCost,
    steps: resume?.steps,
    maxStepsLeft: resume?.maxStepsLeft,
  };
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
