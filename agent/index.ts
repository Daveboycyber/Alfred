// Alfred agent entrypoint
// Runs on a Fly.io Sprite and uses an LLM connector under policy

import { checkAction, commitAction, Policy, Usage } from "./policy";

const policy: Policy = {
  maxSingle: 10,
  maxDaily: 50,
  frozen: false,
};

let usage: Usage = {
  spentToday: 0,
  lastReset: new Date().toISOString().slice(0, 10),
};

async function main() {
  console.log("Alfred starting on Sprite...");

  // Example: attempt an action under policy
  const amount = 5;
  const result = checkAction(policy, usage, amount);

  if (!result.allowed) {
    console.log("Blocked:", result.reason);
    return;
  }

  // TODO: call LLM connector here for useful work
  console.log("Action allowed. Doing useful work...");
  usage = commitAction(usage, amount);
  console.log("Usage updated:", usage);
}

main().catch(console.error);
