import type { NormalizedTarget, SendTarget } from "../types/lark-types.js";

/**
 * 统一解析发送目标，支持 chat_id / open_id 两类。
 */
export function normalizeTarget({ chatId, userId }: SendTarget): NormalizedTarget {
  if (chatId) {
    return {
      receiveIdType: "chat_id",
      receiveId: chatId,
      chatId,
    };
  }
  if (userId) {
    return {
      receiveIdType: "open_id",
      receiveId: userId,
      chatId: null,
    };
  }
  throw new Error("chatId or userId is required");
}
