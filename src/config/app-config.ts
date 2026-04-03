import path from "node:path";
import type { StreamingMode } from "../gateway/types/commands.js";

function splitCsv(value?: string): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseOptionalBoolean(raw?: string): boolean | undefined {
  if (raw === undefined) {
    return undefined;
  }
  return raw === "1" || raw.toLowerCase() === "true";
}

function parseOptionalInteger(raw?: string): number | undefined {
  if (raw === undefined) {
    return undefined;
  }
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }
  return value;
}

function normalizeStreamingMode(raw?: string): StreamingMode | "" {
  if (!raw) {
    return "";
  }
  const mode = raw.trim().toLowerCase();
  if (["off", "snapshot", "patch", "cardkit"].includes(mode)) {
    return mode as StreamingMode;
  }
  return "";
}

const cwd = process.cwd();
const dataDir = process.env.GATEWAY_DATA_DIR
  ? path.resolve(process.env.GATEWAY_DATA_DIR)
  : path.join(cwd, ".gateway");

const allowedRoots = splitCsv(process.env.WORKSPACE_ROOTS).map((item) => path.resolve(item));
const legacyStreamingEnabled = parseOptionalBoolean(process.env.STREAMING_ENABLED) ?? false;
const envStreamingMode = normalizeStreamingMode(process.env.STREAMING_MODE);
const streamingMode = envStreamingMode || (legacyStreamingEnabled ? "snapshot" : "cardkit");
const streamUpdateIntervalMs = parseOptionalInteger(process.env.STREAM_UPDATE_INTERVAL_MS) ?? 700;

export const config = {
  cwd,
  dataDir,
  dbPath: path.join(dataDir, "gateway.sqlite"),
  logPath: path.join(dataDir, "gateway.log"),
  eventFilter: "^im\\.message\\.receive_v1$",
  allowedOpenIds: splitCsv(process.env.ALLOWED_OPEN_IDS),
  allowedRoots: allowedRoots.length > 0 ? allowedRoots : [cwd],
  codexModel: process.env.CODEX_MODEL || "",
  codexApiKey: process.env.CODEX_API_KEY || process.env.OPENAI_API_KEY || "",
  codexBaseUrl: process.env.CODEX_BASE_URL || process.env.OPENAI_BASE_URL || "",
  codexPath: process.env.CODEX_PATH || "",
  networkAccessEnabled: true,
  webSearchMode: "live",
  approvalPolicy: "on-request",
  sandboxMode: "workspace-write",
  skipGitRepoCheck: false,
  streamingMode,
  streamUpdateIntervalMs,
  defaultMode: process.env.DEFAULT_MODE || "build",
  maxReplyChunkLength: 1400,
  autoBindWorkspace: process.env.AUTO_BIND_WORKSPACE !== "0",
};

export type AppConfig = typeof config;
