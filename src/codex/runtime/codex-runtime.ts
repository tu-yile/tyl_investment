import { Codex } from "@openai/codex-sdk";
import type { Logger } from "../../core/logging/logger.js";
import type { AppConfig } from "../../config/app-config.js";

interface RuntimeEventItem {
  id: string;
  type: string;
  [key: string]: any;
}

interface RuntimeTurn {
  finalResponse?: string;
  items: RuntimeEventItem[];
}

interface ProgressState {
  activity: string;
  partialText: string;
}

interface ThreadOptions {
  model?: string;
  workingDirectory: string;
  skipGitRepoCheck?: boolean;
  sandboxMode?: string;
  approvalPolicy?: string;
  networkAccessEnabled?: boolean;
  webSearchMode?: string;
}

interface RunProgress {
  activity: string;
  partialText: string;
  snapshot: string;
  eventCount: number;
  elapsedMs: number;
}

interface RunTaskInput {
  threadId: string | null;
  mode: string;
  workspace: string;
  prompt: string;
  signal: AbortSignal;
}

interface RunTaskStreamInput extends RunTaskInput {
  onProgress?: (progress: RunProgress) => Promise<void>;
}

function normalizeFinalResponse(turn: RuntimeTurn): string {
  if (turn.finalResponse && turn.finalResponse.trim()) {
    return turn.finalResponse.trim();
  }
  const agentItems = turn.items.filter((item) => item.type === "agent_message");
  if (agentItems.length === 0) {
    return "";
  }
  return agentItems
    .map((item) => item.text?.trim() || "")
    .filter(Boolean)
    .join("\n\n");
}

export class CodexRuntime {
  logger: Logger;
  client: any;
  model?: string;
  networkAccessEnabled?: boolean;
  webSearchMode?: string;
  approvalPolicy?: string;
  sandboxMode?: string;
  skipGitRepoCheck?: boolean;

  constructor({ logger, config }: { logger: Logger; config: AppConfig }) {
    this.logger = logger;
    const options: Record<string, string> = {};
    if (config.codexApiKey) {
      options.apiKey = config.codexApiKey;
    }
    if (config.codexBaseUrl) {
      options.baseUrl = config.codexBaseUrl;
    }
    if (config.codexPath) {
      options.codexPathOverride = config.codexPath;
    }
    this.client = new Codex(options);
    this.model = config.codexModel || undefined;
    this.networkAccessEnabled = config.networkAccessEnabled;
    this.webSearchMode = config.webSearchMode || undefined;
    this.approvalPolicy = config.approvalPolicy || undefined;
    this.sandboxMode = config.sandboxMode || undefined;
    this.skipGitRepoCheck = config.skipGitRepoCheck;
  }

  createThreadOptions({ mode, workspace }: { mode: string; workspace: string }): ThreadOptions {
    const _mode = mode;
    void _mode;
    const options: ThreadOptions = {
      model: this.model,
      workingDirectory: workspace,
    };

    if (this.skipGitRepoCheck !== undefined) {
      options.skipGitRepoCheck = this.skipGitRepoCheck;
    }
    if (this.sandboxMode) {
      options.sandboxMode = this.sandboxMode;
    }
    if (this.approvalPolicy) {
      options.approvalPolicy = this.approvalPolicy;
    }
    if (this.networkAccessEnabled !== undefined) {
      options.networkAccessEnabled = this.networkAccessEnabled;
    }
    if (this.webSearchMode) {
      options.webSearchMode = this.webSearchMode;
    }

    return options;
  }

  getThread({ threadId, mode, workspace }: { threadId: string | null; mode: string; workspace: string }): any {
    const options = this.createThreadOptions({ mode, workspace });
    if (threadId) {
      return this.client.resumeThread(threadId, options);
    }
    return this.client.startThread(options);
  }

  buildProgressSnapshot(state: ProgressState): string {
    const partial = (state.partialText || "").trim();
    if (partial) {
      return partial;
    }

    const activity = (state.activity || "").trim();
    if (activity) {
      return activity;
    }

    return "处理中";
  }

  describeActivity(item: RuntimeEventItem | undefined): string {
    if (!item) {
      return "";
    }
    if (item.type === "command_execution") {
      return `执行命令 (${item.status}): ${item.command}`;
    }
    if (item.type === "web_search") {
      return `网络搜索: ${item.query}`;
    }
    if (item.type === "mcp_tool_call") {
      return `调用工具 (${item.status}): ${item.server}/${item.tool}`;
    }
    if (item.type === "todo_list") {
      const done = item.items.filter((x) => x.completed).length;
      return `计划进度: ${done}/${item.items.length}`;
    }
    if (item.type === "reasoning") {
      return "推理中";
    }
    return "";
  }

  shouldRetryWithoutStreaming(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || "");
    if (!message) {
      return false;
    }
    return (
      message.includes("Reconnecting...") ||
      message.includes("stream disconnected") ||
      message.includes("timeout waiting for child process to exit")
    );
  }

  isRecoverableStreamError(message: string): boolean {
    return (
      message.includes("Reconnecting...") ||
      message.includes("timeout waiting for child process to exit")
    );
  }

  async runTaskStream({ threadId, mode, workspace, prompt, signal, onProgress }: RunTaskStreamInput) {
    const thread = this.getThread({ threadId, mode, workspace });
    const startedAt = Date.now();

    try {
      const stream = await thread.runStreamed(prompt, { signal });

      let usage = null;
      let finalResponse = "";
      let activity = "";
      let eventCount = 0;
      const itemsById = new Map<string, RuntimeEventItem>();
      let lastSnapshot = "";

      if (onProgress) {
        const snapshot = this.buildProgressSnapshot({
          activity: "已接收任务，准备执行",
          partialText: "",
        });
        lastSnapshot = snapshot;
        await onProgress({
          activity: "已接收任务，准备执行",
          partialText: "",
          snapshot,
          eventCount,
          elapsedMs: 0,
        });
      }

      for await (const event of stream.events) {
        if (event.type === "turn.completed") {
          usage = event.usage;
          continue;
        }

        if (event.type === "turn.failed") {
          throw new Error(event.error?.message || "turn failed");
        }

        if (event.type === "error") {
          const message = event.message || "stream failed";
          if (this.isRecoverableStreamError(message)) {
            this.logger.warn("codex.stream.recoverable_error", { message, workspace });
            if (onProgress) {
              const snapshot = this.buildProgressSnapshot({
                activity: "模型连接波动，正在自动重试",
                partialText: finalResponse,
              });
              if (snapshot !== lastSnapshot) {
                lastSnapshot = snapshot;
                await onProgress({
                  activity: "模型连接波动，正在自动重试",
                  partialText: finalResponse,
                  snapshot,
                  eventCount,
                  elapsedMs: Date.now() - startedAt,
                });
              }
            }
            continue;
          }
          throw new Error(message);
        }

        if (!event.type.startsWith("item.")) {
          continue;
        }
        eventCount += 1;

        const item = event.item as RuntimeEventItem;
        itemsById.set(item.id, item);
        const nextActivity = this.describeActivity(item);
        if (nextActivity) {
          activity = nextActivity;
        }

        if (item.type === "agent_message") {
          finalResponse = (item.text || "").trim();
        }

        if (onProgress) {
          const snapshot = this.buildProgressSnapshot({
            activity,
            partialText: finalResponse,
          });
          if (snapshot === lastSnapshot) {
            continue;
          }
          lastSnapshot = snapshot;
          await onProgress({
            activity,
            partialText: finalResponse,
            snapshot,
            eventCount,
            elapsedMs: Date.now() - startedAt,
          });
        }
      }

      return {
        threadId: thread.id,
        finalResponse,
        items: [...itemsById.values()],
        usage,
      };
    } catch (error) {
      if (!this.shouldRetryWithoutStreaming(error) || signal.aborted) {
        throw error;
      }

      this.logger.warn("codex.stream.retry_non_streaming", {
        message: error instanceof Error ? error.message : String(error || ""),
        workspace,
      });

      if (onProgress) {
        const snapshot = this.buildProgressSnapshot({
          activity: "流式连接不稳定，正在切换为普通模式重试",
          partialText: "",
        });
        await onProgress({
          activity: "流式连接不稳定，正在切换为普通模式重试",
          partialText: "",
          snapshot,
          eventCount: 0,
          elapsedMs: Date.now() - startedAt,
        });
      }

      const result = await thread.run(prompt, { signal });
      const normalizedFinalResponse = normalizeFinalResponse(result);
      return {
        threadId: thread.id,
        finalResponse: normalizedFinalResponse,
        items: result.items,
        usage: result.usage,
      };
    }
  }

  async runTask({ threadId, mode, workspace, prompt, signal }: RunTaskInput) {
    const thread = this.getThread({ threadId, mode, workspace });
    const turn = await thread.run(prompt, { signal });
    const finalResponse = normalizeFinalResponse(turn);
    return {
      threadId: thread.id,
      finalResponse,
      items: turn.items,
      usage: turn.usage,
    };
  }
}
