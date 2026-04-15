import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import {
  resolveInvestmentEnvironment,
  resolveInvestmentRuntimePaths,
  resolveInvestmentRuntimePathsForEnv,
} from "./paths.js";

async function withEnv<T>(env: string | undefined, work: () => Promise<T> | T): Promise<T> {
  const previousEnv = process.env.INVESTMENT_ENV;
  const previousDbPath = process.env.INVESTMENT_DB_PATH;
  const previousCheckpointPath = process.env.INVESTMENT_LANGGRAPH_CHECKPOINT_DB_PATH;
  if (env === undefined) {
    delete process.env.INVESTMENT_ENV;
  } else {
    process.env.INVESTMENT_ENV = env;
  }
  delete process.env.INVESTMENT_DB_PATH;
  delete process.env.INVESTMENT_LANGGRAPH_CHECKPOINT_DB_PATH;
  try {
    return await work();
  } finally {
    if (previousEnv === undefined) {
      delete process.env.INVESTMENT_ENV;
    } else {
      process.env.INVESTMENT_ENV = previousEnv;
    }
    if (previousDbPath === undefined) {
      delete process.env.INVESTMENT_DB_PATH;
    } else {
      process.env.INVESTMENT_DB_PATH = previousDbPath;
    }
    if (previousCheckpointPath === undefined) {
      delete process.env.INVESTMENT_LANGGRAPH_CHECKPOINT_DB_PATH;
    } else {
      process.env.INVESTMENT_LANGGRAPH_CHECKPOINT_DB_PATH = previousCheckpointPath;
    }
  }
}

test("runtime paths default to prod", async () => {
  await withEnv(undefined, async () => {
    const repoRoot = "/repo";
    const paths = resolveInvestmentRuntimePaths(repoRoot);
    assert.equal(resolveInvestmentEnvironment(), "prod");
    assert.equal(paths.envRoot, path.join(repoRoot, "investment"));
    assert.equal(paths.dataRoot, path.join(repoRoot, "investment", "data"));
    assert.equal(paths.outputRoot, path.join(repoRoot, "investment", "output"));
    assert.equal(paths.schemaPath, path.join(repoRoot, "db", "investment", "schema.sql"));
  });
});

test("runtime paths resolve test environment tree", async () => {
  await withEnv("test", async () => {
    const repoRoot = "/repo";
    const paths = resolveInvestmentRuntimePaths(repoRoot);
    assert.equal(resolveInvestmentEnvironment(), "test");
    assert.equal(paths.envRoot, path.join(repoRoot, "investment", "runtime", "test"));
    assert.equal(paths.agentsRoot, path.join(repoRoot, "investment", "runtime", "test", "agents"));
    assert.equal(paths.configRoot, path.join(repoRoot, "investment", "runtime", "test", "config"));
    assert.equal(paths.knowledgeRoot, path.join(repoRoot, "investment", "runtime", "test", "knowledge"));
    assert.equal(paths.dataRoot, path.join(repoRoot, "investment", "runtime", "test", "data"));
    assert.equal(paths.outputRoot, path.join(repoRoot, "investment", "runtime", "test", "output"));
  });
});

test("invalid environment is rejected", () => {
  assert.throws(() => resolveInvestmentEnvironment("staging"), /Invalid INVESTMENT_ENV/);
});

test("explicit db path overrides environment defaults", async () => {
  await withEnv("test", async () => {
    process.env.INVESTMENT_DB_PATH = "/tmp/custom.sqlite3";
    process.env.INVESTMENT_LANGGRAPH_CHECKPOINT_DB_PATH = "/tmp/custom-checkpoints.sqlite3";
    const paths = resolveInvestmentRuntimePaths("/repo");
    assert.equal(paths.investmentDbPath, "/tmp/custom.sqlite3");
    assert.equal(paths.langGraphCheckpointDbPath, "/tmp/custom-checkpoints.sqlite3");
  });
});

test("paths can be resolved for a specific environment without global env state", async () => {
  await withEnv(undefined, async () => {
    const repoRoot = "/repo";
    const prodPaths = resolveInvestmentRuntimePathsForEnv(repoRoot, "prod");
    const testPaths = resolveInvestmentRuntimePathsForEnv(repoRoot, "test");
    assert.equal(prodPaths.envRoot, path.join(repoRoot, "investment"));
    assert.equal(testPaths.envRoot, path.join(repoRoot, "investment", "runtime", "test"));
  });
});
