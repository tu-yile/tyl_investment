import { gatewayAccessConfig } from "../config/gateway-access-config.js";
import { codexGatewayConfig } from "../config/codex-gateway-config.js";
import { larkClientConfig } from "../config/lark-client-config.js";
import { runtimePathsConfig } from "../config/runtime-paths-config.js";
import { Logger } from "../core/logging/logger.js";
import { GatewayStore } from "../core/storage/gateway-store.js";
import { createGatewaySubsystem, type GatewaySubsystem } from "../gateway/bootstrap.js";
import { LarkClient } from "./services/lark-client.js";
import { LarkGatewayTransport } from "./services/lark-gateway-transport.js";

export function createLarkGatewaySubsystem(): GatewaySubsystem {
  const logger = new Logger(runtimePathsConfig.logPath);
  const store = new GatewayStore(runtimePathsConfig.dbPath);
  const client = new LarkClient({
    logger,
    maxReplyChunkLength: larkClientConfig.maxReplyChunkLength,
  });
  const transport = new LarkGatewayTransport({
    client,
    logger,
    allowedSenderIds: gatewayAccessConfig.allowedOpenIds,
  });

  return createGatewaySubsystem({
    gatewayConfig: codexGatewayConfig,
    logger,
    store,
    transport,
  });
}

export async function startLarkGatewaySubsystem(): Promise<void> {
  const gateway = createLarkGatewaySubsystem();

  const shutdown = (): void => {
    gateway.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await gateway.start();
}
