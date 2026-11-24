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
