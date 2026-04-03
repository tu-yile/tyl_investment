/**
 * 飞书客户端层共享类型。
 * 统一放在这里，避免在多个文件里重复定义。
 */

export type JsonObject = Record<string, any>;

export interface SendTarget {
  chatId?: string | null;
  userId?: string | null;
}

export interface NormalizedTarget {
  receiveIdType: "chat_id" | "open_id";
  receiveId: string;
  chatId: string | null;
}

export interface RunLarkCliOptions {
  cwd?: string;
  forceCmd?: boolean;
}

export interface LarkEventStreamOptions {
  filter: string;
  onEvent: (payload: JsonObject) => void;
  onError: (error: Error) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

