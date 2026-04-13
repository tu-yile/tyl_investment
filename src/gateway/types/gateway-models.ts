/**
 * 网关内部通用模型定义。
 */

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
  snapshot?: string;
  eventCount?: number;
  elapsedMs?: number;
}
