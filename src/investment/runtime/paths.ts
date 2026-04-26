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

export function resolveRepoRoot(repoRoot = process.cwd()): string {
  return repoRoot;
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

export function resolveCurrentInvestmentRuntimePaths(): InvestmentRuntimePaths {
  return resolveInvestmentRuntimePaths(resolveRepoRoot());
}

export function resolveInvestmentOutputPath(...segments: string[]): string {
  return path.join(resolveCurrentInvestmentRuntimePaths().outputRoot, ...segments);
}

export function resolveAgentArtifactOutputPath(
  workflowId: string,
  runDate: string,
  threadId: string,
  agentId: string,
  filename: string,
): string {
  return resolveInvestmentOutputPath(
    "runs",
    workflowId,
    runDate,
    threadId,
    "agents",
    agentId,
    filename,
  );
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
