// Simple file-based persistence for Alfred
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import type { Policy, Usage } from "./policy";

const FILE = "/tmp/alfred-state.json";

export interface HistoryItem {
  id: string;
  task: string;
  topic: string;
  reply: string;
  ts: number;
}

export interface State {
  policy: Policy;
  usage: Usage;
  history: HistoryItem[];
  messages: { role: "user" | "assistant"; content: string }[];
}

const defaults: State = {
  policy: { maxSingle: 10, maxDaily: 50, frozen: false },
  usage: { spentToday: 0, lastReset: new Date().toISOString().slice(0, 10) },
  history: [],
  messages: [],
};

export function load(): State {
  try {
    if (!existsSync(FILE)) return structuredClone(defaults);
    const raw = readFileSync(FILE, "utf8");
    return { ...structuredClone(defaults), ...JSON.parse(raw) };
  } catch {
    return structuredClone(defaults);
  }
}

export function save(state: State) {
  // Keep history and messages bounded
  state.history = state.history.slice(0, 40);
  state.messages = state.messages.slice(-20);
  writeFileSync(FILE, JSON.stringify(state, null, 2));
}
