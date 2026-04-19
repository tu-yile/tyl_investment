import path from "node:path";

export type InvestmentEnvironment = "prod" | "test";

export interface InvestmentRuntimePaths {
  env: InvestmentEnvironment;
  repoRoot: string;
  investmentRoot: string;
  envRoot: string;
  testRuntimeRoot: string;
  agentsRoot: string;
  configRoot: string;
  knowledgeRoot: string;
  dataRoot: string;
  outputRoot: string;
  dbAssetsRoot: string;
  investmentDbPath: string;
  langGraphCheckpointDbPath: string;
  schemaPath: string;
  seedLocalPath: string;
}

export function resolveInvestmentEnvironment(value = process.env.INVESTMENT_ENV): InvestmentEnvironment {
  if (!value || value.trim().length === 0) {
    return "prod";
  }
  if (value === "prod" || value === "test") {
    return value;
  }
  throw new Error(`Invalid INVESTMENT_ENV: ${value}. Expected "prod" or "test".`);
}

export function resolveRepoRootFromInvestmentRoot(investmentRoot: string): string {
  return path.dirname(investmentRoot);
}

export function resolveInvestmentRuntimePathsForEnv(
  repoRoot: string,
  env: InvestmentEnvironment,
): InvestmentRuntimePaths {
  const investmentRoot = path.join(repoRoot, "investment");
  const testRuntimeRoot = path.join(investmentRoot, "runtime", "test");
  const envRoot = env === "prod" ? investmentRoot : testRuntimeRoot;
  const dataRoot = path.join(envRoot, "data");

  return {
    env,
    repoRoot,
    investmentRoot,
    envRoot,
    testRuntimeRoot,
    agentsRoot: path.join(envRoot, "agents"),
    configRoot: path.join(envRoot, "config"),
    knowledgeRoot: path.join(envRoot, "knowledge"),
    dataRoot,
    outputRoot: path.join(envRoot, "output"),
    dbAssetsRoot: path.join(repoRoot, "db", "investment"),
    investmentDbPath: process.env.INVESTMENT_DB_PATH ?? path.join(dataRoot, "investment.sqlite3"),
    langGraphCheckpointDbPath:
      process.env.INVESTMENT_LANGGRAPH_CHECKPOINT_DB_PATH ??
      path.join(dataRoot, "langgraph-checkpoints.sqlite3"),
    schemaPath: path.join(repoRoot, "db", "investment", "schema.sql"),
    seedLocalPath: path.join(repoRoot, "db", "investment", "seed.local.sql"),
  };
}

export function resolveInvestmentRuntimePaths(repoRoot: string): InvestmentRuntimePaths {
  return resolveInvestmentRuntimePathsForEnv(repoRoot, resolveInvestmentEnvironment());
}

export function resolveInvestmentRuntimePathsFromRoot(investmentRoot: string): InvestmentRuntimePaths {
  return resolveInvestmentRuntimePaths(resolveRepoRootFromInvestmentRoot(investmentRoot));
}

export function resolveInvestmentOutputPath(investmentRoot: string, ...segments: string[]): string {
  return path.join(resolveInvestmentRuntimePathsFromRoot(investmentRoot).outputRoot, ...segments);
}

export function resolveAgentArtifactOutputPath(
  investmentRoot: string,
  workflowId: string,
  runDate: string,
  threadId: string,
  agentId: string,
  filename: string,
): string {
  return resolveInvestmentOutputPath(
    investmentRoot,
    "runs",
    workflowId,
    runDate,
    threadId,
    "agents",
    agentId,
    filename,
  );
}

export function resolveInvestmentAgentsPath(investmentRoot: string, ...segments: string[]): string {
  return path.join(resolveInvestmentRuntimePathsFromRoot(investmentRoot).agentsRoot, ...segments);
}

export function resolveInvestmentConfigPath(investmentRoot: string, ...segments: string[]): string {
  return path.join(resolveInvestmentRuntimePathsFromRoot(investmentRoot).configRoot, ...segments);
}

export function resolveInvestmentKnowledgePath(investmentRoot: string, ...segments: string[]): string {
  return path.join(resolveInvestmentRuntimePathsFromRoot(investmentRoot).knowledgeRoot, ...segments);
}
