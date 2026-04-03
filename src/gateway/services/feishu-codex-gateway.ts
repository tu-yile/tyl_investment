import path from "node:path";
import { parseCommand } from "../types/commands.js";
import type { AppConfig } from "../../config/app-config.js";
import type { Logger } from "../../core/logging/logger.js";
import type { GatewayStore, SessionState } from "../../core/storage/gateway-store.js";
import type { LarkClient } from "../../lark/services/lark-client.js";
import type { CodexRuntime } from "../../codex/runtime/codex-runtime.js";
import type { StreamingMode } from "../types/commands.js";
import type { IncomingEvent, TimingData, ProgressPayload } from "../types/gateway-models.js";
import { GatewayCommandHandler } from "./gateway-command-handler.js";
import { createStreamingMessenger } from "./gateway-messengers.js";
import {
  createTiming,
  durationMs,
  formatDuration,
  safeParseJson,
  truncate,
} from "../utils/gateway-utils.js";

/**
 * Feishu -> Codex 网关主编排器。
 * 只负责事件路由、会话生命周期、任务执行控制。
 * 命令处理和流式消息发送已拆分到独立模块，降低单文件复杂度。
 */
export class FeishuCodexGateway {
  config: AppConfig;
  logger: Logger;
  store: GatewayStore;
  lark: LarkClient;
  codex: CodexRuntime;

  allowedOpenIds: Set<string>;
  messageQueues: Map<string, Promise<void>>;
  activeControllers: Map<string, AbortController>;
  listenerProcess: ReturnType<LarkClient["startEventStream"]> | null;
  isStopping: boolean;

  streamingMode: StreamingMode;
  streamUpdateIntervalMs: number;
  commandHandler: GatewayCommandHandler;

  constructor({
    config,
    logger,
    store,
    lark,
    codex,
  }: {
    config: AppConfig;
    logger: Logger;
    store: GatewayStore;
    lark: LarkClient;
    codex: CodexRuntime;
  }) {
    this.config = config;
    this.logger = logger;
    this.store = store;
    this.lark = lark;
    this.codex = codex;

    this.allowedOpenIds = new Set(config.allowedOpenIds);
    this.messageQueues = new Map();
    this.activeControllers = new Map();
    this.listenerProcess = null;
    this.isStopping = false;

    this.streamingMode = config.streamingMode;
    this.streamUpdateIntervalMs = config.streamUpdateIntervalMs ?? 700;

    this.commandHandler = new GatewayCommandHandler({
      config: this.config,
      store: this.store,
      lark: this.lark,
      activeControllers: this.activeControllers,
      getStreamingMode: () => this.streamingMode,
      setStreamingMode: (mode) => {
        this.streamingMode = mode;
      },
      pathAllowed: (targetPath) => this.pathAllowed(targetPath),
    });
  }

  async init(): Promise<void> {
    const recoveredRunIds = this.store.recoverDanglingRuns();
    if (this.allowedOpenIds.size === 0) {
      const selfOpenId = await this.lark.getCurrentUserOpenId();
      if (selfOpenId) {
        this.allowedOpenIds.add(selfOpenId);
      }
    }

    this.logger.info("gateway.init", {
      allowedOpenIds: [...this.allowedOpenIds],
      allowedRoots: this.config.allowedRoots,
      defaultMode: this.config.defaultMode,
      streamingMode: this.streamingMode,
      openApiEnabled: this.lark.isOpenApiEnabled(),
      codexRuntimeDefaultsAligned: true,
      recoveredDanglingRuns: recoveredRunIds.length,
      recoveredRunIds,
    });

    if (this.config.defaultMode === "build") {
      this.store.upgradeAllSessionsMode("build");
    }
  }

  async start(): Promise<void> {
    await this.init();
    this.listenerProcess = this.lark.startEventStream({
      filter: this.config.eventFilter,
      onEvent: (event) => this.onRawEvent(event),
      onError: (error) => this.logger.error("listener.error", { message: error.message }),
      onExit: (code, signal) => {
        this.logger.warn("listener.exit", { code, signal, isStopping: this.isStopping });
        if (!this.isStopping) {
          setTimeout(() => {
            if (!this.isStopping) {
              this.start().catch((error) => {
                this.logger.error("listener.restart.failed", { message: error.message });
              });
            }
          }, 1500);
        }
      },
    });
    this.logger.info("gateway.started");
  }

  stop(): void {
    this.isStopping = true;
    if (this.listenerProcess && !this.listenerProcess.killed) {
      this.listenerProcess.kill();
    }
    for (const controller of this.activeControllers.values()) {
      controller.abort();
    }
    this.store.close();
    this.logger.info("gateway.stopped");
  }

  normalizeIncomingEvent(payload: Record<string, any>): IncomingEvent | null {
    if (payload?.header?.event_type !== "im.message.receive_v1") {
      return null;
    }
    const rawContent = payload?.event?.message?.content || "";
    const content = safeParseJson(rawContent) || {};
    return {
      eventId: payload?.header?.event_id,
      messageId: payload?.event?.message?.message_id,
      chatId: payload?.event?.message?.chat_id,
      chatType: payload?.event?.message?.chat_type,
      senderType: payload?.event?.sender?.sender_type || "",
      senderOpenId: payload?.event?.sender?.sender_id?.open_id || "",
      text: (content.text || "").trim(),
    };
  }

  enqueue(chatId: string, taskFn: () => Promise<void>): void {
    const prev = this.messageQueues.get(chatId) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(taskFn)
      .finally(() => {
        if (this.messageQueues.get(chatId) === next) {
          this.messageQueues.delete(chatId);
        }
      });
    this.messageQueues.set(chatId, next);
  }

  async onRawEvent(payload: Record<string, any>): Promise<void> {
    const event = this.normalizeIncomingEvent(payload);
    if (!event) {
      return;
    }
    event.receivedAt = Date.now();

    if (event.chatType !== "p2p") {
      return;
    }
    if (event.senderType !== "user") {
      return;
    }
    if (this.allowedOpenIds.size > 0 && !this.allowedOpenIds.has(event.senderOpenId)) {
      await this.lark.sendText({
        chatId: event.chatId,
        text: "当前账号不在白名单中，无法使用该网关。",
      });
      return;
    }

    const isNew = this.store.insertEventIfNew(event);
    if (!isNew) {
      return;
    }

    this.enqueue(event.chatId, async () => {
      event.dequeuedAt = Date.now();
      try {
        await this.handleEvent(event);
        this.store.markEventHandled(event.eventId);
      } catch (error: any) {
        this.logger.error("event.handle.failed", {
          eventId: event.eventId,
          message: error.message,
        });
        try {
          await this.lark.sendText({
            chatId: event.chatId,
            text: `处理消息失败：${error.message}`,
          });
        } catch (notifyError: any) {
          this.logger.error("event.handle.failed.notify", {
            eventId: event.eventId,
            message: notifyError.message,
          });
        }
      }
    });
  }

  pathAllowed(targetPath: string): boolean {
    const normalized = path.resolve(targetPath).toLowerCase();
    return this.config.allowedRoots.some((root) => normalized.startsWith(path.resolve(root).toLowerCase()));
  }

  formatStreamingSnapshot({ progress }: { progress: ProgressPayload }): string {
    const step = Number.isFinite(progress.eventCount) ? Number(progress.eventCount) : 0;
    const elapsedSec = Number.isFinite(progress.elapsedMs) ? (Number(progress.elapsedMs) / 1000).toFixed(1) : "-";
    if (progress?.partialText) {
      return `处理中...（步骤 ${step}，${elapsedSec}s）\n\n${progress.partialText}`;
    }
    if (progress?.activity) {
      return `处理中...（步骤 ${step}，${elapsedSec}s）\n\n${progress.activity}`;
    }
    return `处理中...（步骤 ${step}，${elapsedSec}s）`;
  }

  formatFinalMessage({ response }: { response: string }): string {
    return response || "任务完成，但没有返回文本。";
  }

  formatTimingReport(timing: TimingData): string {
    const queueWait = durationMs(timing.receivedAt, timing.dequeuedAt);
    const firstToken = durationMs(timing.receivedAt, timing.firstProgressAt);
    const modelPhase = durationMs(timing.runStartedAt, timing.modelCompletedAt);
    const sendPhase = durationMs(timing.modelCompletedAt, timing.replySentAt);
    const total = durationMs(timing.receivedAt, timing.replySentAt);
    return [
      "----",
      "耗时统计",
      `排队等待: ${formatDuration(queueWait)}`,
      `首次增量: ${formatDuration(firstToken)}`,
      `模型执行: ${formatDuration(modelPhase)}`,
      `回复发送: ${formatDuration(sendPhase)}`,
      `总耗时: ${formatDuration(total)}`,
    ].join("\n");
  }

  resolveStreamingMode(): StreamingMode {
    if (this.streamingMode === "patch" || this.streamingMode === "cardkit") {
      if (!this.lark.isOpenApiEnabled()) {
        return "snapshot";
      }
    }
    return this.streamingMode;
  }

  async handleNaturalMessage(event: IncomingEvent): Promise<void> {
    const chatId = event.chatId;
    let session = this.store.getSession(chatId, this.config.defaultMode);
    const timing = createTiming(event);

    if (!session.workspace) {
      if (this.config.autoBindWorkspace && this.pathAllowed(this.config.cwd)) {
        session = this.store.setSessionWorkspace(chatId, this.config.cwd);
        await this.lark.sendText({
          chatId,
          text: `未检测到已绑定目录，已自动绑定：${session.workspace}`,
        });
      } else {
        await this.lark.sendText({
          chatId,
          text: "当前未绑定工作目录，请先执行 /bind <path>。",
        });
        return;
      }
    }

    if (session.activeRunId) {
      await this.lark.sendText({
        chatId,
        text: "当前有任务运行中，请稍后再发，或执行 /stop。",
      });
      return;
    }

    const runId = this.store.createRun({
      chatId,
      threadId: session.threadId,
      prompt: event.text,
    });
    timing.runStartedAt = Date.now();
    this.store.setActiveRun(chatId, runId);

    const controller = new AbortController();
    this.activeControllers.set(chatId, controller);

    const effectiveStreamingMode = this.resolveStreamingMode();
    if (effectiveStreamingMode === "off") {
      await this.handleNaturalMessageNonStreaming({
        chatId,
        event,
        session,
        runId,
        controller,
        timing,
      });
      return;
    }

    await this.handleNaturalMessageStreaming({
      chatId,
      event,
      session,
      runId,
      controller,
      streamingMode: effectiveStreamingMode,
      requestedMode: this.streamingMode,
      timing,
    });
  }

  async handleNaturalMessageNonStreaming({
    chatId,
    event,
    session,
    runId,
    controller,
    timing,
  }: {
    chatId: string;
    event: IncomingEvent;
    session: SessionState;
    runId: string;
    controller: AbortController;
    timing: TimingData;
  }): Promise<void> {
    await this.lark.sendText({ chatId, text: "开始处理..." });
    try {
      const result = await this.codex.runTask({
        threadId: session.threadId,
        mode: session.mode,
        workspace: session.workspace || this.config.cwd,
        prompt: event.text,
        signal: controller.signal,
      });

      if (result.threadId) {
        this.store.setSessionThread(chatId, result.threadId);
      }
      timing.modelCompletedAt = Date.now();

      const finalResponse = result.finalResponse || "任务完成，但没有返回文本。";
      this.store.finishRun({
        runId,
        status: "completed",
        summary: truncate(finalResponse, 8000),
      });
      await this.lark.sendText({
        chatId,
        text: this.formatFinalMessage({
          response: truncate(finalResponse, 7000),
        }),
      });
      timing.replySentAt = Date.now();
      await this.lark.sendText({ chatId, text: this.formatTimingReport(timing) });

      this.logger.info("run.completed", {
        runId,
        chatId,
        usage: result.usage,
        streamingMode: "off",
      });
    } catch (error: any) {
      const aborted = controller.signal.aborted;
      const status = aborted ? "cancelled" : "failed";
      const message = aborted ? "任务已停止。" : `任务失败：${error.message}`;
      this.store.finishRun({
        runId,
        status,
        error: error.message,
      });
      await this.lark.sendText({ chatId, text: message });
      this.logger.error("run.failed", {
        runId,
        chatId,
        message: error.message,
        aborted,
        streamingMode: "off",
      });
    } finally {
      this.activeControllers.delete(chatId);
      this.store.clearActiveRun(chatId);
    }
  }

  async handleNaturalMessageStreaming({
    chatId,
    event,
    session,
    runId,
    controller,
    streamingMode,
    requestedMode,
    timing,
  }: {
    chatId: string;
    event: IncomingEvent;
    session: SessionState;
    runId: string;
    controller: AbortController;
    streamingMode: StreamingMode;
    requestedMode: StreamingMode;
    timing: TimingData;
  }): Promise<void> {
    const messenger = createStreamingMessenger({
      streamingMode,
      chatId,
      streamUpdateIntervalMs: this.streamUpdateIntervalMs,
      lark: this.lark,
      logger: this.logger,
    });

    const fallbackHint =
      requestedMode !== streamingMode ? `\n(提示：已从 ${requestedMode} 自动回退到 ${streamingMode})` : "";

    await messenger.send(`开始处理...${fallbackHint}`, true);

    try {
      const result = await this.codex.runTaskStream({
        threadId: session.threadId,
        mode: session.mode,
        workspace: session.workspace || this.config.cwd,
        prompt: event.text,
        signal: controller.signal,
        onProgress: async (progress: ProgressPayload) => {
          if (!timing.firstProgressAt) {
            timing.firstProgressAt = Date.now();
          }
          await messenger.send(this.formatStreamingSnapshot({ progress }), false);
        },
      });

      if (result.threadId) {
        this.store.setSessionThread(chatId, result.threadId);
      }
      timing.modelCompletedAt = Date.now();

      const finalResponse = result.finalResponse || "任务完成，但没有返回文本。";
      this.store.finishRun({
        runId,
        status: "completed",
        summary: truncate(finalResponse, 8000),
      });

      const baseFinalText = this.formatFinalMessage({
        response: truncate(finalResponse, 7000),
      });
      await messenger.flushAndClose(`${baseFinalText}\n\n${this.formatTimingReport(timing)}`);
      timing.replySentAt = Date.now();
      await messenger.updateFinalText(`${baseFinalText}\n\n${this.formatTimingReport(timing)}`);

      this.logger.info("run.completed", {
        runId,
        chatId,
        usage: result.usage,
        streamingMode,
      });
    } catch (error: any) {
      const aborted = controller.signal.aborted;
      const status = aborted ? "cancelled" : "failed";
      const message = aborted ? "任务已停止。" : `任务失败：${error.message}`;
      this.store.finishRun({
        runId,
        status,
        error: error.message,
      });
      try {
        await messenger.flushAndClose();
      } catch (_messengerError) {
        // 保持原始错误路径稳定
      }
      await this.lark.sendText({ chatId, text: message });
      this.logger.error("run.failed", {
        runId,
        chatId,
        message: error.message,
        aborted,
        streamingMode,
      });
    } finally {
      this.activeControllers.delete(chatId);
      this.store.clearActiveRun(chatId);
    }
  }

  async handleEvent(event: IncomingEvent): Promise<void> {
    this.logger.info("event.received", {
      chatId: event.chatId,
      eventId: event.eventId,
      text: event.text,
      senderOpenId: event.senderOpenId,
    });

    if (!event.text) {
      return;
    }

    const command = parseCommand(event.text);
    if (command) {
      await this.commandHandler.handle(event, command);
      return;
    }
    await this.handleNaturalMessage(event);
  }
}
