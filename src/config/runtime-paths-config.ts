import path from "node:path";

const cwd = process.cwd();
const dataDir = process.env.GATEWAY_DATA_DIR
  ? path.resolve(process.env.GATEWAY_DATA_DIR)
  : path.join(cwd, ".gateway");

export const runtimePathsConfig = {
  cwd,
  dataDir,
  dbPath: path.join(dataDir, "gateway.sqlite"),
  logPath: path.join(dataDir, "gateway.log"),
};

export type RuntimePathsConfig = typeof runtimePathsConfig;
