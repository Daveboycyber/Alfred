/**
 * The leash log: every decision the policy made, newest last.
 * Kept in state so the UI can show it after a reload.
 */

export type EventKind =
  | "allowed"
  | "declined"
  | "waiting"
  | "approved"
  | "denied"
  | "frozen"
  | "unfrozen"
  | "policy";

export interface LeashEvent {
  id: string;
  ts: number;
  kind: EventKind;
  title: string;
  detail?: string;
  cost?: number;
  /** History item holding the answer, if this event produced one. */
  historyId?: string;
}

interface StepLike {
  thought?: string;
  tool?: string;
  toolInput?: string;
  needsApproval?: boolean;
}

let seq = 0;
export function makeEvent(e: Omit<LeashEvent, "id" | "ts">, ts = Date.now()): LeashEvent {
  seq = (seq + 1) % 1e6;
  return { id: ts.toString(36) + seq.toString(36), ts, ...e };
}

const BLOCKED = /^Policy blocked( further steps)?:\s*/;

/** One event per gated tool call or policy stop in an agent run. */
export function stepsToEvents(steps: StepLike[] | undefined, ts = Date.now()): LeashEvent[] {
  const out: LeashEvent[] = [];
  for (const s of steps ?? []) {
    const blocked = BLOCKED.test(s.thought ?? "");
    const reason = (s.thought ?? "").replace(BLOCKED, "");
    const call = s.tool ? `${s.tool}(${truncate(s.toolInput ?? "", 80)})` : "";
    if (blocked) {
      out.push(makeEvent({ kind: "declined", title: call ? `Declined ${s.tool}` : "Stopped by policy", detail: [call, reason].filter(Boolean).join(" · ") }, ts));
    } else if (s.needsApproval && s.tool) {
      out.push(makeEvent({ kind: "waiting", title: `Paused ${s.tool} for approval`, detail: call }, ts));
    } else if (s.tool) {
      out.push(makeEvent({ kind: "allowed", title: `Ran ${s.tool}`, detail: call }, ts));
    }
  }
  return out;
}

export function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
