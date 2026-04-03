import { spawn } from "node:child_process";
import readline from "node:readline";
import type { Logger } from "../../core/logging/logger.js";
import type { JsonObject, LarkEventStreamOptions } from "../types/lark-types.js";
import { createSpawnSpec, parseJsonOrNull, runLarkCli } from "../adapters/lark-cli-exec.js";
import { buildCompletedCard, buildStreamingCard, stripStatusCorner } from "../renderers/lark-card-builder.js";
import { normalizeTarget } from "../adapters/lark-target.js";

/**
 * 飞书 API 访问层（基于 lark-cli）。
 * 职责：
 * 1) 收发消息与卡片
 * 2) 提供 CardKit 流式更新能力
 * 3) 负责事件监听子进程接入
 */
export class LarkClient {
  logger: Logger;
  maxReplyChunkLength: number;

  constructor({ logger, maxReplyChunkLength }: { logger: Logger; maxReplyChunkLength: number }) {
    this.logger = logger;
    this.maxReplyChunkLength = maxReplyChunkLength ?? 1400;
  }

  isOpenApiEnabled(): boolean {
    return true;
  }

  async getCurrentUserOpenId(): Promise<string> {
    const output = await runLarkCli(["auth", "status"]);
    const payload = parseJsonOrNull(output);
    return payload?.userOpenId ?? "";
  }

  async callApi({
    method,
    path,
    params,
    data,
    as = "bot",
  }: {
    method: string;
    path: string;
    params?: Record<string, string>;
    data?: unknown;
    as?: "bot" | "user";
  }): Promise<JsonObject> {
    const args = ["api", method.toUpperCase(), path, "--as", as];
    if (params && Object.keys(params).length > 0) {
      args.push("--params", JSON.stringify(params));
    }
    if (data !== undefined) {
      args.push("--data", JSON.stringify(data));
    }
    const output = await runLarkCli(args, { forceCmd: true });
    const payload = parseJsonOrNull(output);
    if (!payload) {
      throw new Error(`Unexpected lark-cli api response: ${output}`);
    }
    if (payload.ok === false) {
      throw new Error(payload?.error?.message || "lark-cli api call failed");
    }
    return payload;
  }

  async sendText({
    chatId,
    userId,
    text,
  }: {
    chatId?: string;
    userId?: string;
    text: string;
  }): Promise<void> {
    const chunks = this.chunkText(text, this.maxReplyChunkLength);
    for (const chunk of chunks) {
      await this.sendTextMessage({ chatId, userId, text: chunk });
    }
  }

  async sendTextMessage({ chatId, userId, text }: { chatId?: string; userId?: string; text: string }) {
    const args = ["im", "+messages-send", "--as", "bot", "--markdown", text];
    if (chatId) {
      args.push("--chat-id", chatId);
    } else if (userId) {
      args.push("--user-id", userId);
    } else {
      throw new Error("chatId or userId is required to send a message");
    }
    const output = await runLarkCli(args);
    const payload = parseJsonOrNull(output);
    return {
      raw: output,
      messageId: payload?.data?.message_id || null,
      chatId: payload?.data?.chat_id || chatId || null,
    };
  }

  async sendInteractiveCardMessage({ chatId, userId, card }: { chatId?: string; userId?: string; card: JsonObject }) {
    const target = normalizeTarget({ chatId, userId });
    const payload = await this.callApi({
      method: "POST",
      path: "/open-apis/im/v1/messages",
      params: { receive_id_type: target.receiveIdType },
      data: {
        receive_id: target.receiveId,
        msg_type: "interactive",
        content: JSON.stringify(card),
      },
      as: "bot",
    });
    return {
      messageId: payload?.data?.message_id || null,
      chatId: payload?.data?.chat_id || target.chatId,
      raw: payload,
    };
  }

  async patchInteractiveCardMessage({ messageId, card }: { messageId: string; card: JsonObject }): Promise<void> {
    await this.callApi({
      method: "PATCH",
      path: `/open-apis/im/v1/messages/${messageId}`,
      data: { content: JSON.stringify(card) },
      as: "bot",
    });
  }

  async sendPatchStreamingStart({ chatId, userId, text }: { chatId?: string; userId?: string; text: string }) {
    return this.sendInteractiveCardMessage({ chatId, userId, card: buildStreamingCard(text || "处理中...") });
  }

  async updatePatchStreaming({ messageId, text }: { messageId: string; text: string }): Promise<void> {
    await this.patchInteractiveCardMessage({ messageId, card: buildStreamingCard(text || "处理中...") });
  }

  async completePatchStreaming({ messageId, text }: { messageId: string; text: string }): Promise<void> {
    await this.patchInteractiveCardMessage({ messageId, card: buildCompletedCard(text) });
  }

  async createCardKitCard({ card }: { card: JsonObject }): Promise<string> {
    let payload: JsonObject;
    try {
      payload = await this.callApi({
        method: "POST",
        path: "/open-apis/cardkit/v1/cards",
        data: { type: "card_json", data: JSON.stringify(card) },
        as: "bot",
      });
    } catch (error: any) {
      const fallbackCard = stripStatusCorner(card);
      this.logger.warn("cardkit.create.retry.without_status_corner", { message: error.message });
      payload = await this.callApi({
        method: "POST",
        path: "/open-apis/cardkit/v1/cards",
        data: { type: "card_json", data: JSON.stringify(fallbackCard) },
        as: "bot",
      });
    }
    const cardId = payload?.data?.card_id || payload?.card_id || "";
    if (!cardId) {
      throw new Error("Failed to create CardKit card_id.");
    }
    return cardId;
  }

  async sendCardByCardId({
    chatId,
    userId,
    cardId,
  }: {
    chatId?: string;
    userId?: string;
    cardId: string;
  }) {
    const target = normalizeTarget({ chatId, userId });
    const payload = await this.callApi({
      method: "POST",
      path: "/open-apis/im/v1/messages",
      params: { receive_id_type: target.receiveIdType },
      data: {
        receive_id: target.receiveId,
        msg_type: "interactive",
        content: JSON.stringify({ type: "card", data: { card_id: cardId } }),
      },
      as: "bot",
    });
    return {
      messageId: payload?.data?.message_id || null,
      chatId: payload?.data?.chat_id || target.chatId,
    };
  }

  async setCardKitStreamingMode({
    cardId,
    enabled,
    sequence,
  }: {
    cardId: string;
    enabled: boolean;
    sequence: number;
  }): Promise<void> {
    await this.callApi({
      method: "PATCH",
      path: `/open-apis/cardkit/v1/cards/${cardId}/settings`,
      data: {
        settings: JSON.stringify({ streaming_mode: enabled }),
        sequence,
      },
      as: "bot",
    });
  }

  async updateCardKitCard({
    cardId,
    card,
    sequence,
  }: {
    cardId: string;
    card: JsonObject;
    sequence: number;
  }): Promise<void> {
    try {
      await this.callApi({
        method: "PUT",
        path: `/open-apis/cardkit/v1/cards/${cardId}`,
        data: {
          card: {
            type: "card_json",
            data: JSON.stringify(card),
          },
          sequence,
        },
        as: "bot",
      });
    } catch (error: any) {
      const fallbackCard = stripStatusCorner(card);
      this.logger.warn("cardkit.update.retry.without_status_corner", {
        message: error.message,
        cardId,
      });
      await this.callApi({
        method: "PUT",
        path: `/open-apis/cardkit/v1/cards/${cardId}`,
        data: {
          card: {
            type: "card_json",
            data: JSON.stringify(fallbackCard),
          },
          sequence,
        },
        as: "bot",
      });
    }
  }

  buildCardKitStreamingShell(text = "处理中..."): JsonObject {
    return buildStreamingCard(text);
  }

  buildCardKitCompletedCard(text: string): JsonObject {
    return buildCompletedCard(text);
  }

  async recallMessage(messageId: string | null): Promise<void> {
    if (!messageId) {
      return;
    }
    await runLarkCli(["api", "DELETE", `/open-apis/im/v1/messages/${messageId}`, "--as", "bot"], {
      forceCmd: true,
    });
  }

  chunkText(text: string, maxLength: number): string[] {
    if (!text || text.length <= maxLength) {
      return [text || ""];
    }
    const chunks: string[] = [];
    let offset = 0;
    while (offset < text.length) {
      chunks.push(text.slice(offset, offset + maxLength));
      offset += maxLength;
    }
    return chunks;
  }

  startEventStream({ filter, onEvent, onError, onExit }: LarkEventStreamOptions) {
    const spec = createSpawnSpec(["event", "+subscribe", "--as", "bot", "--force", "--filter", filter]);
    const child = spawn(spec.command, spec.args, {
      cwd: process.cwd(),
      env: process.env,
      windowsHide: true,
    });

    const rl = readline.createInterface({ input: child.stdout });
    rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return;
      }
      const payload = parseJsonOrNull(trimmed);
      if (!payload) {
        this.logger.warn("unable to parse listener json line", { line: trimmed });
        return;
      }
      onEvent(payload);
    });

    child.stderr.on("data", (chunk) => {
      this.logger.info("listener.stderr", { data: chunk.toString() });
    });
    child.on("error", (error) => onError(error));
    child.on("close", (code, signal) => {
      rl.close();
      onExit(code, signal);
    });
    return child;
  }
}
