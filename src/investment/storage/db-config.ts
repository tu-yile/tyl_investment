import { resolveInvestmentRuntimePaths } from "../runtime/paths.js";

export function resolveInvestmentDbPath(repoRoot: string): string {
  return resolveInvestmentRuntimePaths(repoRoot).investmentDbPath;
}
