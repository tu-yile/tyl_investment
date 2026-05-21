import path from "node:path";

const cwd = process.cwd();
const configuredDataDir = process.env.RUNTIME_DATA_DIR || process.env.GATEWAY_DATA_DIR;
const dataDir = configuredDataDir ? path.resolve(configuredDataDir) : path.join(cwd, ".runtime");

export const runtimePathsConfig = {
  cwd,
  dataDir,
  dbPath: path.join(dataDir, "runtime.sqlite"),
  logPath: path.join(dataDir, "runtime.log"),
};

export type RuntimePathsConfig = typeof runtimePathsConfig;
