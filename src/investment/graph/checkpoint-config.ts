import { resolveInvestmentRuntimePaths } from "../runtime/paths.js";

export function resolveLangGraphCheckpointPath(repoRoot: string): string {
  return resolveInvestmentRuntimePaths(repoRoot).langGraphCheckpointDbPath;
}
