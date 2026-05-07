import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { resolveInvestmentRuntimePaths } from "./paths.js";

async function withoutDbOverride<T>(work: () => Promise<T> | T): Promise<T> {
  const previousDbPath = process.env.INVESTMENT_DB_PATH;
  delete process.env.INVESTMENT_DB_PATH;
  try {
    return await work();
  } finally {
    if (previousDbPath === undefined) {
      delete process.env.INVESTMENT_DB_PATH;
    } else {
      process.env.INVESTMENT_DB_PATH = previousDbPath;
    }
  }
}

test("runtime paths resolve to the investment root", async () => {
  await withoutDbOverride(async () => {
    const repoRoot = "/repo";
    const paths = resolveInvestmentRuntimePaths(repoRoot);
    assert.equal(paths.investmentRoot, path.join(repoRoot, "investment"));
    assert.equal(paths.agentsRoot, path.join(repoRoot, "investment", "agents"));
    assert.equal(paths.configRoot, path.join(repoRoot, "investment", "config"));
    assert.equal(paths.knowledgeRoot, path.join(repoRoot, "investment", "knowledge"));
    assert.equal(paths.dataRoot, path.join(repoRoot, "investment", "data"));
    assert.equal(paths.outputRoot, path.join(repoRoot, "investment", "output"));
    assert.equal(paths.schemaPath, path.join(repoRoot, "db", "investment", "schema.sql"));
  });
});

test("explicit db path overrides the default database path", async () => {
  await withoutDbOverride(async () => {
    process.env.INVESTMENT_DB_PATH = "/tmp/custom.sqlite3";
    const paths = resolveInvestmentRuntimePaths("/repo");
    assert.equal(paths.investmentDbPath, "/tmp/custom.sqlite3");
  });
});
