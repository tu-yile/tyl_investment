import path from "node:path";
import { getGlobalCodexTaskRunner } from "#src/codex-app-server/index.js";
import type { CodexReasoningEffort } from "#src/codex-app-server/types.js";

interface RunAgentTurnInput {
  agentId: string;
  repoRoot: string;
  baseInstructions: string;
  prompt: string;
  model?: string;
}

export interface RunAgentTurnResult {
  finalText: string;
  threadId: string;
  turnId: string;
  rawMessages: string[];
}

function resolveAppServerTimeoutMs(): number {
  const raw = process.env.INVESTMENT_CODEX_APP_SERVER_TIMEOUT_MS;
  const parsed = raw ? Number(raw) : 180000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 180000;
}

function resolveCodexModel(): string | undefined {
  return process.env.INVESTMENT_CODEX_MODEL || undefined;
}

function resolveCodexEffort(): CodexReasoningEffort {
  const value = process.env.INVESTMENT_CODEX_REASONING_EFFORT;
  if (!value) {
    return "medium";
  }
  if (["none", "minimal", "low", "medium", "high", "xhigh"].includes(value)) {
    return value as CodexReasoningEffort;
  }
  return "medium";
}

export async function runAgentTurn(input: RunAgentTurnInput): Promise<RunAgentTurnResult> {
  const repoRoot = path.resolve(input.repoRoot);
  const client = getGlobalCodexTaskRunner();

  const result = await client.runTask({
    workspace: repoRoot,
    prompt: input.prompt,
    model: input.model ?? resolveCodexModel(),
    approvalPolicy: "never",
    sandboxMode: "read-only",
    networkAccessEnabled: true,
    webSearchMode: "live",
    personality: "pragmatic",
    effort: resolveCodexEffort(),
    summary: "none",
    timeoutMs: resolveAppServerTimeoutMs(),
    ephemeral: true,
    baseInstructions: input.baseInstructions,
    developerInstructions:
      "You are running inside the investment daily-run graph. Use web search when needed, stay read-only, and return the exact response contract.",
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
    "- You are executing inside the investment daily-run graph.",
    "- You must stay within read-only behavior. Do not attempt to modify files.",
    "- You may use search and network access when helpful.",
    "- Your final answer must contain exactly two top-level sections: `## Analysis` and `## Handoff`.",
    "- The `## Handoff` section must strictly follow the response contract provided in the user task.",
  ].join("\n");
}

export function stringifyPromptContext(title: string, value: unknown): string {
  return [`## ${title}`, "```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

export function codexModelOrDefault(): string | undefined {
  return resolveCodexModel();
}
