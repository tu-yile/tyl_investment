/**
 * 网关内部通用模型定义。
 * 这类类型会被主网关、命令处理器和流式消息发送器共同使用。
 */

export interface IncomingEvent {
  eventId: string;
  messageId: string;
  chatId: string;
  chatType: string;
  senderType: string;
  senderOpenId: string;
  text: string;
  receivedAt?: number;
  dequeuedAt?: number;
}

export interface TimingData {
  receivedAt: number;
  dequeuedAt: number | null;
  runStartedAt: number | null;
  firstProgressAt: number | null;
  modelCompletedAt: number | null;
  replySentAt: number | null;
}

export interface ProgressPayload {
  activity?: string;
  partialText?: string;
  eventCount?: number;
  elapsedMs?: number;
}

