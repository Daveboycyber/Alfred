// Alfred agent entrypoint
// Runs on a Fly.io Sprite and uses an LLM connector under policy

import { checkAction, commitAction, Policy, Usage } from "./policy";
import { callGrok } from "./llm";

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

  // Example useful work under policy (cost = 5 units)
  const cost = 5;
  const result = checkAction(policy, usage, cost);

  if (!result.allowed) {
    console.log("Blocked:", result.reason);
    return;
  }

  console.log("Policy allowed. Asking Grok for a short status...");
  const reply = await callGrok(
    "You are Alfred, a personal agent. In one sentence, confirm you are running on a Fly.io Sprite under policy and ready to help."
  );
  console.log("Grok:", reply);

  usage = commitAction(usage, cost);
  console.log("Usage updated:", usage);
}

main().catch(console.error);
