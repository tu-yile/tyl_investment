import { config } from "../config/app-config.js";
import { Logger } from "../core/logging/logger.js";
import { GatewayStore } from "../core/storage/gateway-store.js";
import { LarkClient } from "../lark/services/lark-client.js";
import { CodexRuntime } from "../codex/runtime/codex-runtime.js";
import { FeishuCodexGateway } from "../gateway/services/feishu-codex-gateway.js";

async function main(): Promise<void> {
  const logger = new Logger(config.logPath);
  const store = new GatewayStore(config.dbPath);
  const lark = new LarkClient({
    logger,
    maxReplyChunkLength: config.maxReplyChunkLength,
  });
  const codex = new CodexRuntime({
    logger,
    config,
  });
  const gateway = new FeishuCodexGateway({
    config,
    logger,
    store,
    lark,
    codex,
  });

  const shutdown = (): void => {
    gateway.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  await gateway.start();
  logger.info("startup.ready", { cwd: config.cwd, dbPath: config.dbPath });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
