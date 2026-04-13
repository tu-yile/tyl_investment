export const consoleConfig = {
  port: Number.parseInt(process.env.GATEWAY_LOG_VIEWER_PORT || "3210", 10),
};

export type ConsoleConfig = typeof consoleConfig;
