export type JsonRpcRequest = {
  jsonrpc: "2.0";
  id: number;
  method: string;
  params?: unknown;
};

export type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export type JsonRpcMessage = JsonRpcRequest | JsonRpcNotification | JsonRpcResponse;

export type CodexSandboxMode = "read-only" | "workspace-write" | "danger-full-access";

export interface CodexAppServerLogger {
  info?: (event: string, payload?: Record<string, unknown>) => void;
  warn?: (event: string, payload?: Record<string, unknown>) => void;
}

export interface CodexRuntimeItem {
  id: string;
  type: string;
  [key: string]: any;
}

export interface CodexRunProgress {
  activity: string;
  partialText: string;
  snapshot: string;
  eventCount: number;
  elapsedMs: number;
}

export interface CodexRunResult {
  threadId: string;
  turnId: string;
  finalResponse: string;
  items: CodexRuntimeItem[];
  rawMessages: string[];
  usage: unknown;
}

export interface CodexTaskRunner {
  runTask(input: CodexRunInput): Promise<CodexRunResult>;
  runTaskStream(input: CodexRunInput): Promise<CodexRunResult>;
}

export type CodexResolvedRunInput = Required<
  Pick<
    CodexRunInput,
    | "workspace"
    | "prompt"
    | "approvalPolicy"
    | "networkAccessEnabled"
    | "webSearchMode"
    | "skipGitRepoCheck"
    | "personality"
    | "summary"
    | "timeoutMs"
  >
> &
  Pick<
    CodexRunInput,
    "threadId" | "mode" | "signal" | "model" | "sandboxMode" | "effort" | "ephemeral" | "baseInstructions" | "developerInstructions" | "onProgress"
  >;

export interface CodexRunInput {
  threadId?: string | null;
  mode?: string;
  workspace: string;
  prompt: string;
  signal?: AbortSignal;
  model?: string;
  approvalPolicy?: string;
  sandboxMode?: CodexSandboxMode | string;
  networkAccessEnabled?: boolean;
  webSearchMode?: string;
  skipGitRepoCheck?: boolean;
  personality?: string;
  effort?: string;
  summary?: string;
  timeoutMs?: number;
  ephemeral?: boolean;
  baseInstructions?: string;
  developerInstructions?: string;
  onProgress?: (progress: CodexRunProgress) => Promise<void> | void;
}

export interface CodexAppServerDefaults {
  executable?: string;
  model?: string;
  approvalPolicy?: string;
  sandboxMode?: CodexSandboxMode | string;
  networkAccessEnabled?: boolean;
  webSearchMode?: string;
  skipGitRepoCheck?: boolean;
  personality?: string;
  summary?: string;
  timeoutMs?: number;
}
