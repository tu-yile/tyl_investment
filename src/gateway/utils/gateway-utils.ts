import type { IncomingGatewayEvent } from "../types/gateway-transport.js";
import type { TimingData } from "../types/gateway-models.js";

export function safeParseJson(text: string): Record<string, any> | null {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}

export function truncate(text: string, maxLength = 5000): string {
  if (!text) {
    return "";
  }
  if (text.length <= maxLength) {
    return text;
  }
  return `${text.slice(0, maxLength)}\n\n[内容过长，已截断]`;
}

export function durationMs(start: number | null, end: number | null): number | null {
  if (!Number.isFinite(start) || !Number.isFinite(end)) {
    return null;
  }
  return Math.max(0, end - start);
}

export function formatDuration(ms: number | null): string {
  if (!Number.isFinite(ms)) {
    return "-";
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

export function createTiming(event: IncomingGatewayEvent): TimingData {
  return {
    receivedAt: event.receivedAt ?? Date.now(),
    dequeuedAt: event.dequeuedAt ?? null,
    runStartedAt: null,
    firstProgressAt: null,
    modelCompletedAt: null,
    replySentAt: null,
  };
}
