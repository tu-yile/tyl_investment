import path from "node:path";
import { getGlobalCodexTaskRunner } from "#src/codex-app-server/index.js";

interface RunAgentTurnInput {
  agentId: string;
  repoRoot: string;
  baseInstructions: string;
  prompt: string;
}

export interface RunAgentTurnResult {
  finalText: string;
  threadId: string;
  turnId: string;
  rawMessages: string[];
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const repoRoot = path.resolve(input.repoRoot);
  const client = getGlobalCodexTaskRunner();

  const result = await client.runTask({
    workspace: repoRoot,
    prompt: input.prompt,
    model: "gpt-5.4",
    approvalPolicy: "never",
    sandboxMode: "read-only",
    networkAccessEnabled: true,
    webSearchMode: "live",
    effort: "high",
    personality: "pragmatic",
    summary: "none",
    timeoutMs: 18000000,
    ephemeral: true,
    baseInstructions: input.baseInstructions,
    developerInstructions:
      "",
  });

  return {
    finalText: result.finalResponse,
    threadId: result.threadId,
    turnId: result.turnId,
    rawMessages: result.rawMessages,
  };
}

export function buildAgentRuntimeHeader(agentId: string): string {
  return [
    `Agent ID: ${agentId}`,
    "Runtime Policy:",
    "- You must stay within read-only behavior. Do not attempt to modify files.",
    "- You may use search and network access when helpful.",
    "- Your final answer must strictly follow the response contract provided in the user task.",
    "- Do not invent extra top-level sections beyond that response contract.",
  ].join("\n");
}

export function stringifyPromptContext(title: string, value: unknown): string {
  return [`## ${title}`, "```json", JSON.stringify(value, null, 2), "```"].join("\n");
}
