import fs from "node:fs";
import path from "node:path";
import type { ParsedCommand, StreamingMode } from "../types/commands.js";
import type { GatewayCommandConfig } from "../../config/gateway-command-config.js";
import type { GatewayStore } from "../../core/storage/gateway-store.js";
import type { IncomingGatewayEvent, GatewayTransport } from "../types/gateway-transport.js";

function nowHuman(): string {
  return new Date().toLocaleString("zh-CN", { hour12: false });
}

function ensureDirectoryExists(targetPath: string): void {
  const stat = fs.statSync(targetPath);
  if (!stat.isDirectory()) {
    throw new Error(`${targetPath} is not a directory`);
  }
}

export interface CommandHandlerDeps {
  config: GatewayCommandConfig;
  store: GatewayStore;
  transport: GatewayTransport;
  activeControllers: Map<string, AbortController>;
  getStreamingMode: () => StreamingMode;
  setStreamingMode: (mode: StreamingMode) => void;
  pathAllowed: (targetPath: string) => boolean;
}

function renderHelpText(): string {
  return [
    "可用命令：",
    "/bind <path> 绑定工作目录",
    "/unbind 解绑工作目录并重置会话",
    "/status 查看会话状态",
    "/mode read|build 切换执行模式",
    "/stream [mode] 查看或切换流式模式",
    "/approve <id> 批准审批请求",
    "/deny <id> 拒绝审批请求",
    "/stop 停止当前任务",
    "/reset 重置当前 thread 上下文",
  ].join("\n");
}

/**
 * 命令处理器：只负责 `/xxx` 指令，不承担自然语言任务执行逻辑。
 * 这样可以让主网关类聚焦在“事件编排”，提升可读性和扩展性。
 */
export class GatewayCommandHandler {
  deps: CommandHandlerDeps;

  constructor(deps: CommandHandlerDeps) {
    this.deps = deps;
  }

  async handle(event: IncomingGatewayEvent, command: ParsedCommand): Promise<void> {
    const conversationId = event.conversationId;
    const { config, store, transport, activeControllers } = this.deps;

    if (command.name === "help") {
      await transport.sendText({ conversationId, text: renderHelpText() });
      return;
    }

    if (command.name === "bind") {
      if (!command.argsText) {
        await transport.sendText({ conversationId, text: "请提供目录，例如 /bind D:\\repo" });
        return;
      }
      const targetPath = path.resolve(command.argsText);
      if (!fs.existsSync(targetPath)) {
        await transport.sendText({ conversationId, text: `目录不存在：${targetPath}` });
        return;
      }
      ensureDirectoryExists(targetPath);
      if (!this.deps.pathAllowed(targetPath)) {
        await transport.sendText({
          conversationId,
          text: `目录不在允许范围内：${targetPath}\n允许根目录：${config.allowedRoots.join(", ")}`,
        });
        return;
      }
      const session = store.setSessionWorkspace(conversationId, targetPath);
      await transport.sendText({
        conversationId,
        text: `已绑定工作目录：${session.workspace}\n当前模式：${session.mode}`,
      });
      return;
    }

    if (command.name === "unbind") {
      store.clearSessionWorkspace(conversationId, config.defaultMode);
      await transport.sendText({ conversationId, text: "已解绑工作目录并重置会话。" });
      return;
    }

    if (command.name === "status") {
      const session = store.getSession(conversationId, config.defaultMode);
      const pending = store.countPendingApprovals(conversationId);
      const configuredMode = this.deps.getStreamingMode();
      const effectiveMode = transport.resolveStreamingMode(configuredMode);
      const lines = [
        `时间: ${nowHuman()}`,
        `传输: ${transport.platformName}`,
        `模式: ${session.mode}`,
        `流式模式: ${configuredMode}${effectiveMode !== configuredMode ? ` (当前发送将回退为 ${effectiveMode})` : ""}`,
        `支持流式: ${transport.getSupportedStreamingModes().join(" | ")}`,
        `工作目录: ${session.workspace || "(未绑定)"}`,
        `Thread: ${session.threadId || "(未创建)"}`,
        `运行状态: ${session.activeRunId ? `运行中 (${session.activeRunId})` : "空闲"}`,
        `待审批: ${pending}`,
      ];
      await transport.sendText({ conversationId, text: lines.join("\n") });
      return;
    }

    if (command.name === "stream") {
      const target = (command.args[0] || "").toLowerCase();
      const supportedModes = transport.getSupportedStreamingModes();
      if (!target) {
        await transport.sendText({
          conversationId,
          text: `当前流式模式：${this.deps.getStreamingMode()}\n可选值：${supportedModes.join(" | ")}`,
        });
        return;
      }
      if (!supportedModes.includes(target)) {
        await transport.sendText({
          conversationId,
          text: `无效流式模式：${target}\n可选值：${supportedModes.join(" | ")}`,
        });
        return;
      }
      const targetMode = target as StreamingMode;
      this.deps.setStreamingMode(targetMode);
      const effectiveMode = transport.resolveStreamingMode(targetMode);
      await transport.sendText({
        conversationId,
        text:
          effectiveMode === targetMode
            ? `已切换流式模式为：${targetMode}`
            : `已切换流式模式为：${targetMode}\n注意：当前发送会自动回退到 ${effectiveMode}。`,
      });
      return;
    }

    if (command.name === "stop") {
      const controller = activeControllers.get(conversationId);
      if (!controller) {
        await transport.sendText({ conversationId, text: "当前没有运行中的任务。" });
        return;
      }
      controller.abort();
      await transport.sendText({ conversationId, text: "已发送停止信号，任务会尽快中断。" });
      return;
    }

    if (command.name === "reset") {
      const session = store.getSession(conversationId, config.defaultMode);
      session.threadId = null;
      session.activeRunId = null;
      store.upsertSession(session);
      await transport.sendText({ conversationId, text: "已重置上下文，会保留当前绑定目录。" });
      return;
    }

    if (command.name === "mode") {
      const target = (command.args[0] || "").toLowerCase();
      if (!["read", "build"].includes(target)) {
        await transport.sendText({ conversationId, text: "模式仅支持 read 或 build，例如 /mode build" });
        return;
      }
      store.setSessionMode(conversationId, target);
      await transport.sendText({ conversationId, text: `已切换到 ${target} 模式。` });
      return;
    }

    if (command.name === "approve" || command.name === "deny") {
      const approvalId = Number(command.args[0] || "");
      if (!Number.isInteger(approvalId) || approvalId <= 0) {
        await transport.sendText({ conversationId, text: "请提供有效审批编号，例如 /approve 12" });
        return;
      }
      const approval = store.getApproval(approvalId);
      if (!approval || approval.conversationId !== conversationId) {
        await transport.sendText({ conversationId, text: `找不到审批 #${approvalId}` });
        return;
      }
      if (approval.status !== "pending") {
        await transport.sendText({
          conversationId,
          text: `审批 #${approvalId} 当前状态是 ${approval.status}，不可重复处理。`,
        });
        return;
      }
      if (command.name === "deny") {
        store.resolveApproval(approvalId, "denied");
        await transport.sendText({ conversationId, text: `已拒绝审批 #${approvalId}` });
        return;
      }
      store.resolveApproval(approvalId, "approved");
      await transport.sendText({ conversationId, text: `已批准审批 #${approvalId}` });
      return;
    }

    // 未识别命令统一回落到帮助文案，避免静默失败。
    await transport.sendText({
      conversationId,
      text: renderHelpText(),
    });
  }
}
