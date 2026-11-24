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

async function doUsefulWork(topic: string): Promise<void> {
  const cost = 8;
  const result = checkAction(policy, usage, cost);

  if (!result.allowed) {
    console.log("Policy blocked useful work:", result.reason);
    return;
  }

  console.log(`Policy allowed (cost=${cost}). Asking Grok to summarize: "${topic}"`);
  const reply = await callGrok(
    `You are Alfred, a personal agent. Summarize the following topic in 3 concise bullet points:\n\n${topic}`
  );
  console.log("Grok summary:\n", reply);

  usage = commitAction(usage, cost);
  console.log("Usage updated:", usage);
}

async function demoPolicyBlock(): Promise<void> {
  console.log("\n--- Policy block demo ---");
  const oversized = 20; // exceeds maxSingle of 10
  const result = checkAction(policy, usage, oversized);
  console.log(`Attempted cost=${oversized} →`, result.allowed ? "ALLOWED" : `BLOCKED: ${result.reason}`);
}

async function main() {
  console.log("Alfred starting on Sprite...\n");

  // Useful work under policy
  await doUsefulWork("Why persistent agents on isolated Linux computers matter for security and reliability.");

  // Show a policy block
  await demoPolicyBlock();

  console.log("\nAlfred finished.");
}

main().catch(console.error);
