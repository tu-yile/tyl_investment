import type { Logger } from "../../core/logging/logger.js";

export interface IncomingGatewayEvent {
  eventId: string;
  messageId: string;
  conversationId: string;
  senderId: string;
  text: string;
  receivedAt?: number;
  dequeuedAt?: number;
}

export interface GatewayEventStreamOptions {
  onEvent: (event: IncomingGatewayEvent) => void;
  onError: (error: Error) => void;
  onExit: (code: number | null, signal: NodeJS.Signals | null) => void;
}

export interface GatewayEventStreamHandle {
  kill(): void;
  killed?: boolean;
}

export interface StreamMessenger {
  send(text: string, force?: boolean): Promise<void>;
  flushAndClose(finalText?: string): Promise<void>;
  updateFinalText(finalText?: string): Promise<void>;
}

export interface GatewayTransport {
  platformName: string;
  initialize?(): Promise<void>;
  startEventStream(options: GatewayEventStreamOptions): GatewayEventStreamHandle;
  sendText(input: { conversationId: string; text: string }): Promise<void>;
  getSupportedStreamingModes(): readonly string[];
  resolveStreamingMode(mode: string): string;
  createStreamingMessenger(input: {
    streamingMode: string;
    conversationId: string;
    streamUpdateIntervalMs: number;
    logger: Logger;
  }): StreamMessenger;
}
