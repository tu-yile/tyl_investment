import path from "node:path";

export interface InvestmentRuntimePaths {
  repoRoot: string;
  investmentRoot: string;
  agentsRoot: string;
  configRoot: string;
  knowledgeRoot: string;
  dataRoot: string;
  outputRoot: string;
  dbAssetsRoot: string;
  investmentDbPath: string;
  schemaPath: string;
  seedLocalPath: string;
}

export function resolveRepoRoot(repoRoot = process.cwd()): string {
  return repoRoot;
}

export function resolveInvestmentRuntimePaths(repoRoot: string): InvestmentRuntimePaths {
  const investmentRoot = path.join(repoRoot, "investment");
  const dataRoot = path.join(investmentRoot, "data");

  return {
    repoRoot,
    investmentRoot,
    agentsRoot: path.join(investmentRoot, "agents"),
    configRoot: path.join(investmentRoot, "config"),
    knowledgeRoot: path.join(investmentRoot, "knowledge"),
    dataRoot,
    outputRoot: path.join(investmentRoot, "output"),
    dbAssetsRoot: path.join(repoRoot, "db", "investment"),
    investmentDbPath: process.env.INVESTMENT_DB_PATH ?? path.join(dataRoot, "investment.sqlite3"),
    schemaPath: path.join(repoRoot, "db", "investment", "schema.sql"),
    seedLocalPath: path.join(repoRoot, "db", "investment", "seed.local.sql"),
  };
}

export function resolveCurrentInvestmentRuntimePaths(): InvestmentRuntimePaths {
  return resolveInvestmentRuntimePaths(resolveRepoRoot());
}

export function resolveInvestmentOutputPath(...segments: string[]): string {
  return path.join(resolveCurrentInvestmentRuntimePaths().outputRoot, ...segments);
}

export function resolveInvestmentAgentsPath(...segments: string[]): string {
  return path.join(resolveCurrentInvestmentRuntimePaths().agentsRoot, ...segments);
}

export function resolveInvestmentConfigPath(...segments: string[]): string {
  return path.join(resolveCurrentInvestmentRuntimePaths().configRoot, ...segments);
}

export function resolveInvestmentKnowledgePath(...segments: string[]): string {
  return path.join(resolveCurrentInvestmentRuntimePaths().knowledgeRoot, ...segments);
}
