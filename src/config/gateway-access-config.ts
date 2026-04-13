import path from "node:path";
import { splitCsv } from "./env-utils.js";
import { runtimePathsConfig } from "./runtime-paths-config.js";

const allowedRoots = splitCsv(process.env.WORKSPACE_ROOTS).map((item) => path.resolve(item));

export const gatewayAccessConfig = {
  allowedOpenIds: splitCsv(process.env.ALLOWED_OPEN_IDS),
  allowedRoots: allowedRoots.length > 0 ? allowedRoots : [runtimePathsConfig.cwd],
  autoBindWorkspace: process.env.AUTO_BIND_WORKSPACE !== "0",
};

export type GatewayAccessConfig = typeof gatewayAccessConfig;
