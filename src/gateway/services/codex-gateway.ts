import path from "node:path";
import { codexAppServerDefaultsConfig } from "../../config/codex-app-server-defaults-config.js";
import { parseCommand } from "../types/commands.js";
import type { CodexGatewayConfig } from "../../config/codex-gateway-config.js";
import { gatewayCommandConfig } from "../../config/gateway-command-config.js";
import type { Logger } from "../../core/logging/logger.js";
import type { GatewayStore, SessionState } from "../../core/storage/gateway-store.js";
import type { CodexTaskRunner } from "../../codex-app-server/types.js";
import type { IncomingGatewayEvent, GatewayTransport } from "../types/gateway-transport.js";
import type { TimingData, ProgressPayload } from "../types/gateway-models.js";
import { GatewayCommandHandler } from "./gateway-command-handler.js";
import {
  createTiming,
  durationMs,
  formatDuration,
  truncate,
} from "../utils/gateway-utils.js";

/**
 * 通讯网关主编排器。
 * 只处理事件路由、会话生命周期和任务执行，不感知具体通讯软件。
 */
export class CodexGateway {
  config: CodexGatewayConfig;
  logger: Logger;
  store: GatewayStore;
  transport: GatewayTransport;
  codex: CodexTaskRunner;

  messageQueues: Map<string, Promise<void>>;
  activeControllers: Map<string, AbortController>;
  listenerProcess: ReturnType<GatewayTransport["startEventStream"]> | null;
  isStopping: boolean;

  streamingMode: string;
  streamUpdateIntervalMs: number;
  commandHandler: GatewayCommandHandler;

  constructor({
    config,
    logger,
    store,
    transport,
    codex,
  }: {
    config: CodexGatewayConfig;
    logger: Logger;
    store: GatewayStore;
    transport: GatewayTransport;
    codex: CodexTaskRunner;
  }) {
    this.config = config;
    this.logger = logger;
    this.store = store;
    this.transport = transport;
    this.codex = codex;

    this.messageQueues = new Map();
    this.activeControllers = new Map();
    this.listenerProcess = null;
    this.isStopping = false;

    this.streamingMode = config.streamingMode;
    this.streamUpdateIntervalMs = config.streamUpdateIntervalMs ?? 700;

    this.commandHandler = new GatewayCommandHandler({
      config: gatewayCommandConfig,
      store: this.store,
      transport: this.transport,
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
    await this.transport.initialize?.();

    this.logger.info("gateway.init", {
      transport: this.transport.platformName,
      allowedRoots: this.config.allowedRoots,
      defaultMode: this.config.defaultMode,
      streamingMode: this.streamingMode,
      supportedStreamingModes: this.transport.getSupportedStreamingModes(),
      recoveredDanglingRuns: recoveredRunIds.length,
      recoveredRunIds,
    });

    if (this.config.defaultMode === "build") {
      this.store.upgradeAllSessionsMode("build");
    }
  }

  async start(): Promise<void> {
    await this.init();
    this.listenerProcess = this.transport.startEventStream({
      onEvent: (event) => this.onEvent(event),
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
    this.logger.info("gateway.started", { transport: this.transport.platformName });
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

  enqueue(conversationId: string, taskFn: () => Promise<void>): void {
    const prev = this.messageQueues.get(conversationId) || Promise.resolve();
    const next = prev
      .catch(() => {})
      .then(taskFn)
      .finally(() => {
        if (this.messageQueues.get(conversationId) === next) {
          this.messageQueues.delete(conversationId);
        }
      });
    this.messageQueues.set(conversationId, next);
  }

  async onEvent(event: IncomingGatewayEvent): Promise<void> {
    event.receivedAt = Date.now();
    const isNew = this.store.insertEventIfNew(event);
    if (!isNew) {
      return;
    }

    this.enqueue(event.conversationId, async () => {
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
          await this.transport.sendText({
            conversationId: event.conversationId,
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
    const snapshot = (progress.snapshot || "").trim();
    if (snapshot) {
      return snapshot;
    }
    const partialText = (progress.partialText || "").trim();
    if (partialText) {
      return partialText;
    }
    const activity = (progress.activity || "").trim();
    if (activity) {
      return activity;
    }
    return "处理中...";
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

  resolveStreamingMode(): string {
    return this.transport.resolveStreamingMode(this.streamingMode);
  }

  async handleNaturalMessage(event: IncomingGatewayEvent): Promise<void> {
    const conversationId = event.conversationId;
    let session = this.store.getSession(conversationId, this.config.defaultMode);
    const timing = createTiming(event);

    if (!session.workspace) {
      if (this.config.autoBindWorkspace && this.pathAllowed(this.config.cwd)) {
        session = this.store.setSessionWorkspace(conversationId, this.config.cwd);
        await this.transport.sendText({
          conversationId,
          text: `未检测到已绑定目录，已自动绑定：${session.workspace}`,
        });
      } else {
        await this.transport.sendText({
          conversationId,
          text: "当前未绑定工作目录，请先执行 /bind <path>。",
        });
        return;
      }
    }

    if (session.activeRunId) {
      await this.transport.sendText({
        conversationId,
        text: "当前有任务运行中，请稍后再发，或执行 /stop。",
      });
      return;
    }

    const runId = this.store.createRun({
      conversationId,
      threadId: session.threadId,
      prompt: event.text,
    });
    timing.runStartedAt = Date.now();
    this.store.setActiveRun(conversationId, runId);

    const controller = new AbortController();
    this.activeControllers.set(conversationId, controller);

    const effectiveStreamingMode = this.resolveStreamingMode();
    if (effectiveStreamingMode === "off") {
      await this.handleNaturalMessageNonStreaming({
        conversationId,
        event,
        session,
        runId,
        controller,
        timing,
      });
      return;
    }

    await this.handleNaturalMessageStreaming({
      conversationId,
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
    conversationId,
    event,
    session,
    runId,
    controller,
    timing,
  }: {
    conversationId: string;
    event: IncomingGatewayEvent;
    session: SessionState;
    runId: string;
    controller: AbortController;
    timing: TimingData;
  }): Promise<void> {
    await this.transport.sendText({ conversationId, text: "开始处理..." });
    try {
      const result = await this.codex.runTask({
        threadId: session.threadId,
        mode: session.mode,
        workspace: session.workspace || this.config.cwd,
        prompt: event.text,
        signal: controller.signal,
        model: codexAppServerDefaultsConfig.model,
        approvalPolicy: codexAppServerDefaultsConfig.approvalPolicy,
        sandboxMode: codexAppServerDefaultsConfig.sandboxMode,
        networkAccessEnabled: codexAppServerDefaultsConfig.networkAccessEnabled,
        webSearchMode: codexAppServerDefaultsConfig.webSearchMode,
        skipGitRepoCheck: codexAppServerDefaultsConfig.skipGitRepoCheck,
      });

      if (result.threadId) {
        this.store.setSessionThread(conversationId, result.threadId);
      }
      timing.modelCompletedAt = Date.now();

      const finalResponse = result.finalResponse || "任务完成，但没有返回文本。";
      this.store.finishRun({
        runId,
        status: "completed",
        summary: truncate(finalResponse, 8000),
      });
      await this.transport.sendText({
        conversationId,
        text: this.formatFinalMessage({
          response: truncate(finalResponse, 7000),
        }),
      });
      timing.replySentAt = Date.now();
      await this.transport.sendText({ conversationId, text: this.formatTimingReport(timing) });

      this.logger.info("run.completed", {
        runId,
        conversationId,
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
      await this.transport.sendText({ conversationId, text: message });
      this.logger.error("run.failed", {
        runId,
        conversationId,
        message: error.message,
        aborted,
        streamingMode: "off",
      });
    } finally {
      this.activeControllers.delete(conversationId);
      this.store.clearActiveRun(conversationId);
    }
  }

  async handleNaturalMessageStreaming({
    conversationId,
    event,
    session,
    runId,
    controller,
    streamingMode,
    requestedMode,
    timing,
  }: {
    conversationId: string;
    event: IncomingGatewayEvent;
    session: SessionState;
    runId: string;
    controller: AbortController;
    streamingMode: string;
    requestedMode: string;
    timing: TimingData;
  }): Promise<void> {
    const messenger = this.transport.createStreamingMessenger({
      streamingMode,
      conversationId,
      streamUpdateIntervalMs: this.streamUpdateIntervalMs,
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
        model: codexAppServerDefaultsConfig.model,
        approvalPolicy: codexAppServerDefaultsConfig.approvalPolicy,
        sandboxMode: codexAppServerDefaultsConfig.sandboxMode,
        networkAccessEnabled: codexAppServerDefaultsConfig.networkAccessEnabled,
        webSearchMode: codexAppServerDefaultsConfig.webSearchMode,
        skipGitRepoCheck: codexAppServerDefaultsConfig.skipGitRepoCheck,
        onProgress: async (progress: ProgressPayload) => {
          if (!timing.firstProgressAt) {
            timing.firstProgressAt = Date.now();
          }
          await messenger.send(this.formatStreamingSnapshot({ progress }), false);
        },
      });

      if (result.threadId) {
        this.store.setSessionThread(conversationId, result.threadId);
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
        conversationId,
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
      await this.transport.sendText({ conversationId, text: message });
      this.logger.error("run.failed", {
        runId,
        conversationId,
        message: error.message,
        aborted,
        streamingMode,
      });
    } finally {
      this.activeControllers.delete(conversationId);
      this.store.clearActiveRun(conversationId);
    }
  }

  async handleEvent(event: IncomingGatewayEvent): Promise<void> {
    this.logger.info("event.received", {
      conversationId: event.conversationId,
      eventId: event.eventId,
      text: event.text,
      senderId: event.senderId,
      transport: this.transport.platformName,
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
