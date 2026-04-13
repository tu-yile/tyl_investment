import { gatewayAccessConfig } from "./gateway-access-config.js";
import { gatewaySessionConfig } from "./gateway-session-config.js";

export const gatewayCommandConfig = {
  allowedRoots: gatewayAccessConfig.allowedRoots,
  defaultMode: gatewaySessionConfig.defaultMode,
};

export type GatewayCommandConfig = typeof gatewayCommandConfig;
