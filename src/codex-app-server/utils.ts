import { CodexRuntimeItem, CodexAppServerDefaults, CodexRunInput } from "./types.js";

export function normalizeRuntimeItem(item: Record<string, any>): CodexRuntimeItem {
  return {
    id: String(item.id || `item-${Math.random().toString(36).slice(2)}`),
    ...item,
    type: normalizeItemType(String(item.type || "")),
    aggregated_output: item.aggregated_output ?? item.aggregatedOutput,
    exit_code: item.exit_code ?? item.exitCode,
  };
}

export function normalizeSandboxPolicyType(mode?: string): string | null {
  if (!mode) {
    return null;
  }
  if (mode === "read-only") {
    return "readOnly";
  }
  if (mode === "workspace-write") {
    return "workspaceWrite";
  }
  if (mode === "danger-full-access") {
    return "dangerFullAccess";
  }
  return null;
}

export function buildProgressSnapshot({ activity, partialText }: { activity: string; partialText: string }): string {
  const normalizedPartialText = (partialText || "").trim();
  if (normalizedPartialText) {
    return normalizedPartialText;
  }

  const normalizedActivity = (activity || "").trim();
  if (normalizedActivity) {
    return normalizedActivity;
  }

  return "处理中";
}

export function resolveExecutable(defaults?: CodexAppServerDefaults): string {
  return defaults?.executable || process.env.CODEX_PATH || "codex";
}

export function normalizeItemType(type: string): string {
  const normalized = type.replace(/[A-Z]/g, (char) => `_${char.toLowerCase()}`);
  if (normalized === "agent_message") {
    return normalized;
  }
  if (normalized === "command_execution") {
    return normalized;
  }
  if (normalized === "mcp_tool_call") {
    return normalized;
  }
  if (normalized === "todo_list") {
    return normalized;
  }
  if (normalized === "web_search") {
    return normalized;
  }
  return normalized;
}

export function buildRunInputLogPayload(input: CodexRunInput & { workspace: string }): Record<string, unknown> {
  return {
    threadId: input.threadId ?? null,
    mode: input.mode ?? null,
    workspace: input.workspace,
    prompt: input.prompt,
    model: input.model ?? null,
    approvalPolicy: input.approvalPolicy ?? null,
    sandboxMode: input.sandboxMode ?? null,
    networkAccessEnabled: input.networkAccessEnabled ?? null,
    webSearchMode: input.webSearchMode ?? null,
    skipGitRepoCheck: input.skipGitRepoCheck ?? null,
    personality: input.personality ?? null,
    summary: input.summary ?? null,
    timeoutMs: input.timeoutMs ?? null,
    ephemeral: input.ephemeral ?? null,
    baseInstructions: input.baseInstructions ?? null,
    developerInstructions: input.developerInstructions ?? null,
  };
}

export function describeActivity(item: CodexRuntimeItem | undefined): string {
  if (!item) {
    return "";
  }
  if (item.type === "command_execution") {
    return `执行命令 (${item.status || "unknown"}): ${item.command || ""}`.trim();
  }
  if (item.type === "web_search") {
    return `网络搜索: ${item.query || ""}`.trim();
  }
  if (item.type === "mcp_tool_call") {
    return `调用工具 (${item.status || "unknown"}): ${item.server || ""}/${item.tool || ""}`.trim();
  }
  if (item.type === "todo_list") {
    const items = Array.isArray(item.items) ? item.items : [];
    const done = items.filter((entry: { completed?: boolean }) => entry.completed).length;
    return `计划进度: ${done}/${items.length}`;
  }
  if (item.type === "reasoning") {
    return "推理中";
  }
  return "";
}

export function isFinalAnswerPhase(phase: unknown): boolean {
  return phase === "final_answer" || phase === "finalAnswer";
}
