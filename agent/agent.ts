// Multi-step agent loop for Alfred
import { callGrok } from "./llm";
import { fetchPage, webSearch, calculate } from "./tools";
import { checkAction, Policy, Usage } from "./policy";

export interface StepResult {
  thought: string;
  tool?: string;
  toolInput?: string;
  toolOutput?: string;
  final?: string;
}

export async function runAgentLoop(
  goal: string,
  policy: Policy,
  usage: Usage,
  maxSteps = 3
): Promise<{ steps: StepResult[]; final: string; totalCost: number }> {
  const steps: StepResult[] = [];
  let context = `Goal: ${goal}`;
  let totalCost = 0;

  for (let i = 0; i < maxSteps; i++) {
    const cost = 6;
    const check = checkAction(policy, { ...usage, spentToday: usage.spentToday + totalCost }, cost);
    if (!check.allowed) {
      steps.push({ thought: `Policy blocked further steps: ${check.reason}` });
      break;
    }

    const planPrompt = `You are Alfred. Decide the next action for this goal.

${context}

Respond with EXACTLY one of:
THINK: <your reasoning>
TOOL: fetch|search|calculate
INPUT: <input for the tool>

OR if you have enough information:
FINAL: <your final answer>

Be concise.`;

    const decision = await callGrok(planPrompt, 300);
    totalCost += cost;

    if (decision.includes("FINAL:")) {
      const final = decision.split("FINAL:")[1]?.trim() || decision;
      steps.push({ thought: "Ready to answer", final });
      return { steps, final, totalCost };
    }

    const toolMatch = decision.match(/TOOL:\s*(fetch|search|calculate)/i);
    const inputMatch = decision.match(/INPUT:\s*(.+)/i);

    if (!toolMatch || !inputMatch) {
      steps.push({ thought: decision });
      continue;
    }

    const tool = toolMatch[1].toLowerCase();
    const input = inputMatch[1].trim();
    let toolOutput = "";

    try {
      if (tool === "fetch") toolOutput = await fetchPage(input);
      else if (tool === "search") toolOutput = await webSearch(input);
      else if (tool === "calculate") toolOutput = calculate(input);
    } catch (err: any) {
      toolOutput = `Tool error: ${err.message}`;
    }

    steps.push({
      thought: decision.split("TOOL:")[0].replace("THINK:", "").trim(),
      tool,
      toolInput: input,
      toolOutput: toolOutput.slice(0, 500),
    });

    context += `\n\nTool ${tool} result:\n${toolOutput.slice(0, 800)}`;
  }

  // Final synthesis if we didn't finish earlier
  const synth = await callGrok(`Based on the steps so far, give a clear final answer for the goal:\n${context}`, 250);
  totalCost += 5;
  return { steps, final: synth, totalCost };
}
