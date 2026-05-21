import { spawn } from "child_process";
import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { CodexRuntimeItem, CodexRunResult, CodexResolvedRunInput, CodexAppServerLogger, JsonRpcMessage, JsonRpcNotification, JsonRpcRequest, JsonRpcResponse } from "./types.js";
import { buildProgressSnapshot, normalizeSandboxPolicyType, normalizeRuntimeItem, describeActivity, isFinalAnswerPhase } from "./utils.js";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type ActiveRunState = {
  input: CodexResolvedRunInput;
  logger?: CodexAppServerLogger;
  startedAt: number;
  itemsById: Map<string, CodexRuntimeItem>;
  agentMessageIds: string[];
  agentMessagesById: Map<string, string>;
  finalAnswerText: string;
  lastPartialText: string;
  lastActivity: string;
  lastSnapshot: string;
  eventCount: number;
  usage: unknown;
  pendingFailure: Error | null;
  completionResolver: ((value: CodexRunResult) => void) | null;
  completionRejecter: ((error: Error) => void) | null;
  completionPromise: Promise<CodexRunResult>;
  timeoutHandle: NodeJS.Timeout | null;
  activeThreadId: string;
  activeTurnId: string;
  abortListener: (() => void) | null;
};

class JsonRpcStdioCodexClient {
  child: ChildProcessWithoutNullStreams;
  buffer = "";
  nextId = 1;
  pending = new Map<number, PendingRequest>();
  stderrChunks: string[] = [];
  initializedPromise: Promise<void> | null = null;
  activeRun: ActiveRunState | null = null;
  closed = false;

  constructor(
    private readonly executable: string,
    spawnCwd = process.cwd(),
  ) {
    this.child = spawn(this.executable, ["app-server", "--listen", "stdio://"], {
      stdio: ["pipe", "pipe", "pipe"],
      cwd: spawnCwd,
      env: process.env,
    });

    this.child.stdout.on("data", (chunk: Buffer) => {
      this.buffer += chunk.toString("utf8");
      this.drainBuffer();
    });
    this.child.stderr.on("data", (chunk: Buffer) => {
      this.stderrChunks.push(chunk.toString("utf8"));
    });
    this.child.on("error", (error) => {
      this.handleConnectionFailure(error instanceof Error ? error : new Error(String(error)));
    });
    this.child.on("exit", (code, signal) => {
      const suffix = this.stderrChunks.join("").trim();
      this.handleConnectionFailure(
        new Error(
          `Codex app server exited (code=${code ?? "null"}, signal=${signal ?? "null"}).${suffix ? ` stderr: ${suffix}` : ""}`,
        ),
      );
    });
  }

  isClosed(): boolean {
    return this.closed;
  }

  async run(input: CodexResolvedRunInput, logger?: CodexAppServerLogger): Promise<CodexRunResult> {
    if (this.closed) {
      throw new Error("Codex app server client is closed.");
    }
    if (this.activeRun) {
      throw new Error("Codex app server client already has an active run.");
    }

    await this.ensureInitialized();

    const runState = this.createRunState(input, logger);
    this.activeRun = runState;
    this.attachAbortListener(runState);

    try {
      await this.emitInitialProgress(runState);

      let threadId = input.threadId || null;
      if (!threadId) {
        threadId = await this.startThread(runState);
      } else {
        runState.activeThreadId = threadId;
      }

      try {
        await this.startTurn(runState, threadId);
      } catch (error) {
        if (!threadId || !this.shouldRestartWithFreshThread(runState, error)) {
          throw error;
        }
        this.logResumeFallback(runState, error);
        threadId = await this.startThread(runState);
        await this.startTurn(runState, threadId);
      }

      return await this.waitForCompletion(runState);
    } catch (error) {
      if (this.activeRun === runState) {
        this.cleanupRunState(runState);
        this.activeRun = null;
      }
      throw error;
    }
  }

  async close(): Promise<void> {
    if (this.closed) {
      return;
    }
    this.closed = true;

    if (!this.child.killed) {
      this.child.kill();
    }
    for (const entry of this.pending.values()) {
      entry.reject(new Error("Codex app server client closed before response."));
    }
    this.pending.clear();
    if (this.activeRun) {
      this.rejectRun(this.activeRun, new Error("Codex app server client closed before turn completion."));
      this.activeRun = null;
    }
  }

  private async ensureInitialized(): Promise<void> {
    if (this.initializedPromise) {
      return this.initializedPromise;
    }
    this.initializedPromise = (async () => {
      await this.request("initialize", {
        clientInfo: {
          name: "lark-codex-base",
          version: "1.0.0",
        },
        capabilities: {
          experimentalApi: false,
        },
      });
      this.notify("initialized", {});
    })();

    try {
      await this.initializedPromise;
    } catch (error) {
      this.initializedPromise = null;
      throw error;
    }
  }

  private createRunState(input: CodexResolvedRunInput, logger?: CodexAppServerLogger): ActiveRunState {
    let completionResolver: ((value: CodexRunResult) => void) | null = null;
    let completionRejecter: ((error: Error) => void) | null = null;
    const completionPromise = new Promise<CodexRunResult>((resolve, reject) => {
      completionResolver = resolve;
      completionRejecter = reject;
    });
    return {
      input,
      logger,
      startedAt: Date.now(),
      itemsById: new Map(),
      agentMessageIds: [],
      agentMessagesById: new Map(),
      finalAnswerText: "",
      lastPartialText: "",
      lastActivity: "",
      lastSnapshot: "",
      eventCount: 0,
      usage: null,
      pendingFailure: null,
      completionResolver,
      completionRejecter,
      completionPromise,
      timeoutHandle: null,
      activeThreadId: "",
      activeTurnId: "",
      abortListener: null,
    };
  }

  private attachAbortListener(runState: ActiveRunState): void {
    if (!runState.input.signal) {
      return;
    }
    runState.abortListener = () => {
      this.rejectRun(runState, new Error("Codex app server turn aborted."));
    };
    runState.input.signal.addEventListener("abort", runState.abortListener, { once: true });
  }

  private cleanupRunState(runState: ActiveRunState): void {
    if (runState.abortListener && runState.input.signal) {
      runState.input.signal.removeEventListener("abort", runState.abortListener);
      runState.abortListener = null;
    }
    if (runState.timeoutHandle) {
      clearTimeout(runState.timeoutHandle);
      runState.timeoutHandle = null;
    }
  }

  private async emitInitialProgress(runState: ActiveRunState): Promise<void> {
    if (!runState.input.onProgress) {
      return;
    }
    const snapshot = buildProgressSnapshot({
      activity: "已接收任务，准备执行",
      partialText: "",
    });
    runState.lastSnapshot = snapshot;
    await runState.input.onProgress({
      activity: "已接收任务，准备执行",
      partialText: "",
      snapshot,
      eventCount: 0,
      elapsedMs: 0,
    });
  }

  private async startThread(runState: ActiveRunState): Promise<string> {
    const config: Record<string, unknown> = {};
    if (runState.input.webSearchMode) {
      config.web_search = runState.input.webSearchMode;
    }

    const result = (await this.request("thread/start", {
      cwd: runState.input.workspace,
      approvalPolicy: runState.input.approvalPolicy,
      ephemeral: runState.input.ephemeral ?? false,
      sandbox: runState.input.sandboxMode || undefined,
      personality: runState.input.personality,
      baseInstructions: runState.input.baseInstructions ?? null,
      developerInstructions: runState.input.developerInstructions ?? null,
      model: runState.input.model ?? null,
      skipGitRepoCheck: runState.input.skipGitRepoCheck,
      config,
    })) as { thread?: { id?: string } };

    const threadId = result?.thread?.id;
    if (!threadId) {
      throw new Error("Codex app server thread/start response did not include thread id.");
    }
    runState.activeThreadId = threadId;
    return threadId;
  }

  private async startTurn(runState: ActiveRunState, threadId: string): Promise<void> {
    const sandboxPolicyType = normalizeSandboxPolicyType(runState.input.sandboxMode);
    const sandboxPolicy = sandboxPolicyType
      ? {
          type: sandboxPolicyType,
          networkAccess: runState.input.networkAccessEnabled,
        }
      : {
          networkAccess: runState.input.networkAccessEnabled,
        };

    const result = (await this.request("turn/start", {
      threadId,
      cwd: runState.input.workspace,
      input: [{ type: "text", text: runState.input.prompt }],
      approvalPolicy: runState.input.approvalPolicy,
      personality: runState.input.personality,
      model: runState.input.model ?? null,
      summary: runState.input.summary,
      sandboxPolicy,
    })) as { turn?: { id?: string } };

    const turnId = result?.turn?.id;
    if (!turnId) {
      throw new Error("Codex app server turn/start response did not include turn id.");
    }
    runState.activeTurnId = turnId;
  }

  private async waitForCompletion(runState: ActiveRunState): Promise<CodexRunResult> {
    runState.timeoutHandle = setTimeout(() => {
      this.rejectRun(runState, new Error(`Codex app server turn timed out after ${runState.input.timeoutMs}ms.`));
    }, runState.input.timeoutMs);
    return runState.completionPromise;
  }

  private drainBuffer(): void {
    while (true) {
      const newlineIndex = this.buffer.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (!line) {
        continue;
      }
      try {
        const message = JSON.parse(line) as JsonRpcMessage;
        this.handleMessage(message);
      } catch (error) {
        this.handleConnectionFailure(error instanceof Error ? error : new Error(String(error)));
        return;
      }
    }
  }

  private handleMessage(message: JsonRpcMessage): void {
    if ("id" in message && ("result" in message || "error" in message) && !("method" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(`Codex app server request failed: ${message.error.message}`));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if ("method" in message && "id" in message && typeof message.id === "number") {
      this.handleServerRequest(message as JsonRpcRequest);
      return;
    }

    if ("method" in message) {
      this.handleNotification(message);
    }
  }

  private handleServerRequest(message: JsonRpcRequest): void {
    const runState = this.activeRun;
    const error = new Error(`Unexpected app server request during codex run: ${message.method}`);
    if (runState) {
      runState.pendingFailure = error;
    }
    this.send({
      jsonrpc: "2.0",
      id: message.id,
      error: {
        code: -32601,
        message: error.message,
      },
    });
  }

  private handleNotification(message: JsonRpcNotification): void {
    const runState = this.activeRun;
    if (!runState) {
      return;
    }

    if (message.method === "error") {
      const payload = (message.params ?? {}) as { message?: string };
      runState.pendingFailure = new Error(payload.message || "Codex app server emitted error notification.");
      return;
    }

    if (message.method === "turn/failed") {
      const payload = (message.params ?? {}) as {
        turn?: {
          error?: { message?: string } | null;
        };
      };
      this.rejectRun(runState, new Error(payload.turn?.error?.message || "Codex app server turn failed."));
      return;
    }

    if (message.method === "item/started" || message.method === "item/updated" || message.method === "item/completed") {
      const payload = (message.params ?? {}) as { item?: Record<string, any> };
      if (payload.item) {
        void this.handleItem(payload.item);
      }
      return;
    }

    if (message.method === "turn/completed") {
      const payload = (message.params ?? {}) as {
        turn?: {
          usage?: unknown;
        };
        usage?: unknown;
      };
      runState.usage = payload.turn?.usage ?? payload.usage ?? runState.usage;

      if (runState.pendingFailure) {
        this.rejectRun(runState, runState.pendingFailure);
        return;
      }

      const rawMessages = runState.agentMessageIds
        .map((id) => runState.agentMessagesById.get(id) || "")
        .filter(Boolean);
      const finalResponse = (runState.finalAnswerText || rawMessages.at(-1) || "").trim();

      if (!finalResponse) {
        this.rejectRun(
          runState,
          new Error(
            `Codex app server turn completed without final assistant text.${
              this.stderrChunks.length ? ` stderr: ${this.stderrChunks.join("").trim()}` : ""
            }`,
          ),
        );
        return;
      }

      runState.completionResolver?.({
        threadId: runState.activeThreadId,
        turnId: runState.activeTurnId,
        finalResponse,
        items: [...runState.itemsById.values()],
        rawMessages,
        usage: runState.usage,
      });
      this.cleanupRunState(runState);
      runState.completionResolver = null;
      runState.completionRejecter = null;
      if (this.activeRun === runState) {
        this.activeRun = null;
      }
    }
  }

  private async handleItem(rawItem: Record<string, any>): Promise<void> {
    const runState = this.activeRun;
    if (!runState) {
      return;
    }
    const item = normalizeRuntimeItem(rawItem);
    runState.eventCount += 1;
    runState.itemsById.set(item.id, item);

    const nextActivity = describeActivity(item);
    if (nextActivity) {
      runState.lastActivity = nextActivity;
    }

    if (item.type === "agent_message" && typeof item.text === "string") {
      if (!runState.agentMessagesById.has(item.id)) {
        runState.agentMessageIds.push(item.id);
      }
      runState.agentMessagesById.set(item.id, item.text);
      runState.lastPartialText = item.text.trim();
      if (isFinalAnswerPhase(item.phase)) {
        runState.finalAnswerText = item.text;
      }
    }

    if (!runState.input.onProgress) {
      return;
    }

    const snapshot = buildProgressSnapshot({
      activity: runState.lastActivity,
      partialText: runState.lastPartialText,
    });
    if (snapshot === runState.lastSnapshot) {
      return;
    }
    runState.lastSnapshot = snapshot;
    await runState.input.onProgress({
      activity: runState.lastActivity,
      partialText: runState.lastPartialText,
      snapshot,
      eventCount: runState.eventCount,
      elapsedMs: Date.now() - runState.startedAt,
    });
  }

  private shouldRestartWithFreshThread(runState: ActiveRunState, error: unknown): boolean {
    if (!runState.input.threadId) {
      return false;
    }
    const message = error instanceof Error ? error.message : String(error || "");
    return /thread/i.test(message);
  }

  private logResumeFallback(runState: ActiveRunState, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error || "");
    runState.logger?.warn?.("codex_app_server.resume_fallback", {
      message,
      threadId: runState.input.threadId,
      workspace: runState.input.workspace,
    });
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    const id = this.nextId++;
    const payload: JsonRpcRequest = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };
    const promise = new Promise<unknown>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
    this.send(payload);
    return promise;
  }

  private notify(method: string, params?: unknown): void {
    this.send({
      jsonrpc: "2.0",
      method,
      params,
    });
  }

  private send(message: JsonRpcRequest | JsonRpcNotification | JsonRpcResponse): void {
    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private rejectRun(runState: ActiveRunState, error: Error): void {
    if (this.activeRun !== runState) {
      return;
    }
    this.cleanupRunState(runState);
    runState.completionRejecter?.(error);
    runState.completionResolver = null;
    runState.completionRejecter = null;
    this.activeRun = null;
  }

  private handleConnectionFailure(error: Error): void {
    if (this.closed) {
      return;
    }
    this.closed = true;
    for (const pending of this.pending.values()) {
      pending.reject(error);
    }
    this.pending.clear();
    if (this.activeRun) {
      this.rejectRun(this.activeRun, error);
    }
    if (!this.child.killed) {
      this.child.kill();
    }
  }
}

export default JsonRpcStdioCodexClient;
