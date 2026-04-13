import { normalizeLowerCase, parseOptionalBoolean, parseOptionalInteger } from "./env-utils.js";

const legacyStreamingEnabled = parseOptionalBoolean(process.env.STREAMING_ENABLED) ?? false;
const envStreamingMode = normalizeLowerCase(process.env.STREAMING_MODE);

export const gatewayStreamingConfig = {
  streamingMode: envStreamingMode || (legacyStreamingEnabled ? "snapshot" : "cardkit"),
  streamUpdateIntervalMs: parseOptionalInteger(process.env.STREAM_UPDATE_INTERVAL_MS) ?? 700,
};

export type GatewayStreamingConfig = typeof gatewayStreamingConfig;
