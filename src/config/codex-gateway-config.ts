import { gatewayAccessConfig } from "./gateway-access-config.js";
import { gatewaySessionConfig } from "./gateway-session-config.js";
import { gatewayStreamingConfig } from "./gateway-streaming-config.js";
import { runtimePathsConfig } from "./runtime-paths-config.js";

export const codexGatewayConfig = {
  cwd: runtimePathsConfig.cwd,
  allowedRoots: gatewayAccessConfig.allowedRoots,
  autoBindWorkspace: gatewayAccessConfig.autoBindWorkspace,
  defaultMode: gatewaySessionConfig.defaultMode,
  streamingMode: gatewayStreamingConfig.streamingMode,
  streamUpdateIntervalMs: gatewayStreamingConfig.streamUpdateIntervalMs,
};

export type CodexGatewayConfig = typeof codexGatewayConfig;
