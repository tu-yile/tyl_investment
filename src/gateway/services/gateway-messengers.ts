import type { LarkClient } from "../../lark/services/lark-client.js";
import type { Logger } from "../../core/logging/logger.js";
import type { StreamingMode } from "../types/commands.js";

/**
 * 对输出文本做统一截断，避免卡片/消息超长导致发送失败。
 */
function truncate(text: string, maxLength = 5000): string {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n\n[内容过长，已截断]`;
}

export interface StreamMessenger {
  send(text: string, force?: boolean): Promise<void>;
  flushAndClose(finalText?: string): Promise<void>;
  updateFinalText(finalText?: string): Promise<void>;
}

/**
 * 纯文本快照模式：按节流频率发送普通消息。
 */
class SnapshotMessenger implements StreamMessenger {
  lark: LarkClient;
  chatId: string;
  intervalMs: number;
  maxLength: number;
  lastText: string;
  lastSentAt: number;
  pendingText: string;
  timer: NodeJS.Timeout | null;
  queue: Promise<void>;

  constructor({
    lark,
    chatId,
    intervalMs = 1800,
    maxLength = 6500,
  }: {
    lark: LarkClient;
    chatId: string;
    intervalMs?: number;
    maxLength?: number;
  }) {
    this.lark = lark;
    this.chatId = chatId;
    this.intervalMs = intervalMs;
    this.maxLength = maxLength;
    this.lastText = "";
    this.lastSentAt = 0;
    this.pendingText = "";
    this.timer = null;
    this.queue = Promise.resolve();
  }

  normalize(text: string): string {
    return truncate(text || "", this.maxLength);
  }

  send(text: string, force = false): Promise<void> {
    const normalized = this.normalize(text);
    if (!normalized) {
      return Promise.resolve();
    }
    if (!force && normalized === this.lastText) {
      return Promise.resolve();
    }
    const now = Date.now();
    const shouldThrottle = !force && now - this.lastSentAt < this.intervalMs;
    if (shouldThrottle) {
      this.pendingText = normalized;
      if (!this.timer) {
        const delay = Math.max(120, this.intervalMs - (now - this.lastSentAt));
        this.timer = setTimeout(() => {
          this.timer = null;
          const toSend = this.pendingText;
          this.pendingText = "";
          if (toSend) {
            this.sendNow(toSend);
          }
        }, delay);
      }
      return this.queue;
    }
    return this.sendNow(normalized);
  }

  sendNow(text: string): Promise<void> {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        await this.lark.sendText({ chatId: this.chatId, text });
        this.lastText = text;
        this.lastSentAt = Date.now();
      });
    return this.queue;
  }

  async flushAndClose(finalText = ""): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = this.pendingText;
    this.pendingText = "";
    if (pending) {
      await this.sendNow(pending);
    }
    if (finalText) {
      await this.send(finalText, true);
    } else {
      await this.queue;
    }
  }

  async updateFinalText(_finalText = ""): Promise<void> {}
}

/**
 * Patch 卡片模式：持续更新同一条 interactive 消息。
 */
class PatchCardMessenger implements StreamMessenger {
  lark: LarkClient;
  logger: Logger;
  chatId: string;
  intervalMs: number;
  maxLength: number;
  lastText: string;
  lastSentAt: number;
  pendingText: string;
  timer: NodeJS.Timeout | null;
  queue: Promise<void>;
  messageId: string | null;

  constructor({
    lark,
    logger,
    chatId,
    intervalMs = 1600,
    maxLength = 6500,
  }: {
    lark: LarkClient;
    logger: Logger;
    chatId: string;
    intervalMs?: number;
    maxLength?: number;
  }) {
    this.lark = lark;
    this.logger = logger;
    this.chatId = chatId;
    this.intervalMs = intervalMs;
    this.maxLength = maxLength;
    this.lastText = "";
    this.lastSentAt = 0;
    this.pendingText = "";
    this.timer = null;
    this.queue = Promise.resolve();
    this.messageId = null;
  }

  normalize(text: string): string {
    return truncate(text || "", this.maxLength);
  }

  send(text: string, force = false): Promise<void> {
    const normalized = this.normalize(text);
    if (!normalized) {
      return Promise.resolve();
    }
    if (!force && normalized === this.lastText) {
      return Promise.resolve();
    }
    const now = Date.now();
    const shouldThrottle = !force && now - this.lastSentAt < this.intervalMs;
    if (shouldThrottle) {
      this.pendingText = normalized;
      if (!this.timer) {
        const delay = Math.max(120, this.intervalMs - (now - this.lastSentAt));
        this.timer = setTimeout(() => {
          this.timer = null;
          const toSend = this.pendingText;
          this.pendingText = "";
          if (toSend) {
            this.sendNow(toSend);
          }
        }, delay);
      }
      return this.queue;
    }
    return this.sendNow(normalized);
  }

  sendNow(text: string): Promise<void> {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        if (!this.messageId) {
          const response = await this.lark.sendPatchStreamingStart({
            chatId: this.chatId,
            text,
          });
          this.messageId = response.messageId || null;
          if (!this.messageId) {
            throw new Error("无法创建可更新的卡片消息。");
          }
        } else {
          await this.lark.updatePatchStreaming({
            messageId: this.messageId,
            text,
          });
        }
        this.lastText = text;
        this.lastSentAt = Date.now();
      });
    return this.queue;
  }

  async flushAndClose(finalText = ""): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = this.pendingText;
    this.pendingText = "";
    if (pending) {
      await this.sendNow(pending);
    }
    await this.queue;
    if (!finalText) {
      return;
    }
    if (!this.messageId) {
      await this.sendNow(finalText);
      return;
    }
    await this.lark.completePatchStreaming({
      messageId: this.messageId,
      text: finalText,
    });
    this.lastText = this.normalize(finalText);
    this.lastSentAt = Date.now();
  }

  async updateFinalText(finalText = ""): Promise<void> {
    if (!this.messageId || !finalText) {
      return;
    }
    await this.lark.completePatchStreaming({
      messageId: this.messageId,
      text: finalText,
    });
    this.lastText = this.normalize(finalText);
    this.lastSentAt = Date.now();
  }
}

/**
 * CardKit 模式：创建一张可流式更新的卡片并持续 PUT 更新。
 */
class CardKitMessenger implements StreamMessenger {
  lark: LarkClient;
  logger: Logger;
  chatId: string;
  intervalMs: number;
  maxLength: number;
  lastText: string;
  lastSentAt: number;
  pendingText: string;
  timer: NodeJS.Timeout | null;
  queue: Promise<void>;
  cardId: string | null;
  messageId: string | null;
  sequence: number;

  constructor({
    lark,
    logger,
    chatId,
    intervalMs = 1200,
    maxLength = 6500,
  }: {
    lark: LarkClient;
    logger: Logger;
    chatId: string;
    intervalMs?: number;
    maxLength?: number;
  }) {
    this.lark = lark;
    this.logger = logger;
    this.chatId = chatId;
    this.intervalMs = intervalMs;
    this.maxLength = maxLength;
    this.lastText = "";
    this.lastSentAt = 0;
    this.pendingText = "";
    this.timer = null;
    this.queue = Promise.resolve();
    this.cardId = null;
    this.messageId = null;
    this.sequence = 1;
  }

  normalize(text: string): string {
    return truncate(text || "", this.maxLength);
  }

  send(text: string, force = false): Promise<void> {
    const normalized = this.normalize(text);
    if (!normalized) {
      return Promise.resolve();
    }
    if (!force && normalized === this.lastText) {
      return Promise.resolve();
    }
    const now = Date.now();
    const shouldThrottle = !force && now - this.lastSentAt < this.intervalMs;
    if (shouldThrottle) {
      this.pendingText = normalized;
      if (!this.timer) {
        const delay = Math.max(120, this.intervalMs - (now - this.lastSentAt));
        this.timer = setTimeout(() => {
          this.timer = null;
          const toSend = this.pendingText;
          this.pendingText = "";
          if (toSend) {
            this.sendNow(toSend);
          }
        }, delay);
      }
      return this.queue;
    }
    return this.sendNow(normalized);
  }

  async ensureInitialized(initialText: string): Promise<void> {
    if (this.cardId) {
      return;
    }
    const shellCard = this.lark.buildCardKitStreamingShell(initialText || "处理中...");
    this.cardId = await this.lark.createCardKitCard({ card: shellCard });
    await this.lark.setCardKitStreamingMode({
      cardId: this.cardId,
      enabled: true,
      sequence: this.sequence++,
    });
    const sent = await this.lark.sendCardByCardId({
      chatId: this.chatId,
      cardId: this.cardId,
    });
    this.messageId = sent.messageId || null;
  }

  sendNow(text: string): Promise<void> {
    this.queue = this.queue
      .catch(() => {})
      .then(async () => {
        await this.ensureInitialized(text);
        await this.lark.updateCardKitCard({
          cardId: this.cardId as string,
          card: this.lark.buildCardKitStreamingShell(text),
          sequence: this.sequence++,
        });
        this.lastText = text;
        this.lastSentAt = Date.now();
      });
    return this.queue;
  }

  async flushAndClose(finalText = ""): Promise<void> {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    const pending = this.pendingText;
    this.pendingText = "";
    if (pending) {
      await this.sendNow(pending);
    }
    await this.queue;
    if (!this.cardId) {
      if (finalText) {
        await this.sendNow(finalText);
      }
      return;
    }

    await this.lark.setCardKitStreamingMode({
      cardId: this.cardId,
      enabled: false,
      sequence: this.sequence++,
    });

    if (finalText) {
      await this.lark.updateCardKitCard({
        cardId: this.cardId,
        card: this.lark.buildCardKitCompletedCard(finalText),
        sequence: this.sequence++,
      });
    }
    this.lastSentAt = Date.now();
  }

  async updateFinalText(finalText = ""): Promise<void> {
    if (!this.cardId || !finalText) {
      return;
    }
    await this.lark.updateCardKitCard({
      cardId: this.cardId,
      card: this.lark.buildCardKitCompletedCard(finalText),
      sequence: this.sequence++,
    });
    this.lastSentAt = Date.now();
  }
}

/**
 * 统一的流式发送器工厂，网关只需要关心策略名，不关心具体实现。
 */
export function createStreamingMessenger({
  streamingMode,
  chatId,
  streamUpdateIntervalMs,
  lark,
  logger,
}: {
  streamingMode: StreamingMode;
  chatId: string;
  streamUpdateIntervalMs: number;
  lark: LarkClient;
  logger: Logger;
}): StreamMessenger {
  const baseIntervalMs = Math.max(300, streamUpdateIntervalMs);
  if (streamingMode === "patch") {
    return new PatchCardMessenger({
      lark,
      logger,
      chatId,
      intervalMs: baseIntervalMs,
    });
  }
  if (streamingMode === "cardkit") {
    return new CardKitMessenger({
      lark,
      logger,
      chatId,
      intervalMs: Math.max(250, Math.floor(baseIntervalMs * 0.8)),
    });
  }
  return new SnapshotMessenger({
    lark,
    chatId,
    intervalMs: Math.max(350, Math.floor(baseIntervalMs * 1.2)),
    maxLength: 6500,
  });
}
