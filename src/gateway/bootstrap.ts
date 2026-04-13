import { getGlobalCodexTaskRunner } from "#src/codex-app-server/index.js";
import type { CodexTaskRunner } from "#src/codex-app-server/types.js";
import { codexGatewayConfig, type CodexGatewayConfig } from "#src/config/codex-gateway-config.js";
import { runtimePathsConfig } from "#src/config/runtime-paths-config.js";
import { Logger } from "#src/core/logging/logger.js";
import { GatewayStore } from "#src/core/storage/gateway-store.js";
import { CodexGateway } from "./services/codex-gateway.js";
import type { GatewayTransport } from "./types/gateway-transport.js";

export interface GatewaySubsystem {
  start(): Promise<void>;
  stop(): void;
}

export function createGatewaySubsystem({
  transport,
  gatewayConfig = codexGatewayConfig,
  logger = new Logger(runtimePathsConfig.logPath),
  store = new GatewayStore(runtimePathsConfig.dbPath),
  codex = getGlobalCodexTaskRunner(),
}: {
  transport: GatewayTransport;
  gatewayConfig?: CodexGatewayConfig;
  logger?: Logger;
  store?: GatewayStore;
  codex?: CodexTaskRunner;
}): GatewaySubsystem {
  return new CodexGateway({
    config: gatewayConfig,
    logger,
    store,
    transport,
    codex,
  });
}
