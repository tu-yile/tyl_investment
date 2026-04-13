export const gatewaySessionConfig = {
  defaultMode: process.env.DEFAULT_MODE || "build",
};

export type GatewaySessionConfig = typeof gatewaySessionConfig;
