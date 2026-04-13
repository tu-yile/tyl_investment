import type { Logger } from "../../core/logging/logger.js";
import type {
  GatewayEventStreamOptions,
  GatewayTransport,
} from "../../gateway/types/gateway-transport.js";
import type { LarkClient } from "./lark-client.js";
import { safeParseJson } from "../../gateway/utils/gateway-utils.js";
import { createLarkStreamingMessenger } from "./lark-stream-messenger.js";

const DEFAULT_EVENT_FILTER = "^im\\.message\\.receive_v1$";
const SUPPORTED_STREAMING_MODES = ["off", "snapshot", "patch", "cardkit"] as const;

export class LarkGatewayTransport implements GatewayTransport {
  platformName = "lark";

  client: LarkClient;
  logger: Logger;
  eventFilter: string;
  allowedSenderIds: Set<string>;

  constructor({
    client,
    logger,
    eventFilter = DEFAULT_EVENT_FILTER,
    allowedSenderIds = [],
  }: {
    client: LarkClient;
    logger: Logger;
    eventFilter?: string;
    allowedSenderIds?: string[];
  }) {
    this.client = client;
    this.logger = logger;
    this.eventFilter = eventFilter;
    this.allowedSenderIds = new Set(allowedSenderIds);
  }

  async initialize(): Promise<void> {
    if (this.allowedSenderIds.size > 0) {
      return;
    }
    const selfOpenId = await this.client.getCurrentUserOpenId();
    if (selfOpenId) {
      this.allowedSenderIds.add(selfOpenId);
    }
  }

  getSupportedStreamingModes(): readonly string[] {
    return SUPPORTED_STREAMING_MODES;
  }

  resolveStreamingMode(mode: string): string {
    if (!SUPPORTED_STREAMING_MODES.includes(mode as (typeof SUPPORTED_STREAMING_MODES)[number])) {
      return "snapshot";
    }
    if ((mode === "patch" || mode === "cardkit") && !this.client.isOpenApiEnabled()) {
      return "snapshot";
    }
    return mode;
  }

  startEventStream({ onEvent, onError, onExit }: GatewayEventStreamOptions) {
    return this.client.startEventStream({
      filter: this.eventFilter,
      onEvent: (payload) => {
        const normalized = this.normalizeIncomingEvent(payload);
        if (!normalized) {
          return;
        }
        onEvent(normalized);
      },
      onError,
      onExit,
    });
  }

  async sendText({ conversationId, text }: { conversationId: string; text: string }): Promise<void> {
    await this.client.sendText({ chatId: conversationId, text });
  }

  createStreamingMessenger({
    streamingMode,
    conversationId,
    streamUpdateIntervalMs,
    logger,
  }: {
    streamingMode: string;
    conversationId: string;
    streamUpdateIntervalMs: number;
    logger: Logger;
  }) {
    return createLarkStreamingMessenger({
      streamingMode,
      conversationId,
      streamUpdateIntervalMs,
      lark: this.client,
      logger,
    });
  }

  normalizeIncomingEvent(payload: Record<string, any>) {
    if (payload?.header?.event_type !== "im.message.receive_v1") {
      return null;
    }
    const rawContent = payload?.event?.message?.content || "";
    const content = safeParseJson(rawContent) || {};

    const conversationId = payload?.event?.message?.chat_id || "";
    const senderType = payload?.event?.sender?.sender_type || "";
    const senderId = payload?.event?.sender?.sender_id?.open_id || "";
    if (!conversationId || !senderId) {
      return null;
    }
    if (senderType !== "user") {
      return null;
    }
    if (this.allowedSenderIds.size > 0 && !this.allowedSenderIds.has(senderId)) {
      this.client
        .sendText({
          chatId: conversationId,
          text: "当前账号不在白名单中，无法使用该网关。",
        })
        .catch((error: Error) => {
          this.logger.warn("transport.lark.rejected_sender.notify_failed", {
            conversationId,
            senderId,
            message: error.message,
          });
        });
      return null;
    }

    return {
      eventId: payload?.header?.event_id,
      messageId: payload?.event?.message?.message_id,
      conversationId,
      senderId,
      text: (content.text || "").trim(),
    };
  }
}
