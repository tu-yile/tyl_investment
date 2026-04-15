import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";
import { cleanupTestRuntime, initializeTestRuntime } from "./test-runtime.js";
import { resolveInvestmentRuntimePathsForEnv } from "./paths.js";

async function withEnv<T>(env: string | undefined, work: () => Promise<T>): Promise<T> {
  const previous = process.env.INVESTMENT_ENV;
  if (env === undefined) {
    delete process.env.INVESTMENT_ENV;
  } else {
    process.env.INVESTMENT_ENV = env;
  }
  try {
    return await work();
  } finally {
    if (previous === undefined) {
      delete process.env.INVESTMENT_ENV;
    } else {
      process.env.INVESTMENT_ENV = previous;
    }
  }
}

async function createRepoFixture(): Promise<string> {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), "investment-env-admin-"));
  const prodPaths = resolveInvestmentRuntimePathsForEnv(repoRoot, "prod");
  await fs.mkdir(prodPaths.agentsRoot, { recursive: true });
  await fs.mkdir(prodPaths.configRoot, { recursive: true });
  await fs.mkdir(prodPaths.knowledgeRoot, { recursive: true });
  await fs.mkdir(prodPaths.dataRoot, { recursive: true });
  await fs.writeFile(path.join(prodPaths.agentsRoot, "information-collector.md"), "# agent\n", "utf8");
  await fs.writeFile(path.join(prodPaths.configRoot, "strategy.md"), "# config\n", "utf8");
  await fs.writeFile(path.join(prodPaths.knowledgeRoot, "sample.md"), "# knowledge\n", "utf8");
  const dbPath = path.join(prodPaths.dataRoot, "investment.sqlite3");
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      CREATE TABLE industries (knowledge_md_path TEXT);
      CREATE TABLE industry_knowledge_versions (source_md_path TEXT);
      CREATE TABLE theses (source_md_path TEXT);
      CREATE TABLE operation_sheets (markdown_path TEXT);
      INSERT INTO industries (knowledge_md_path) VALUES ('investment/knowledge/sample.md');
      INSERT INTO industry_knowledge_versions (source_md_path) VALUES ('investment/knowledge/sample.md');
      INSERT INTO theses (source_md_path) VALUES ('investment/knowledge/sample.md');
      INSERT INTO operation_sheets (markdown_path) VALUES ('investment/output/daily/sample.md');
    `);
  } finally {
    db.close();
  }
  return repoRoot;
}

test("initializeTestRuntime copies prod data into the test tree without output", async () => {
  const repoRoot = await createRepoFixture();
  const testRuntimePath = await initializeTestRuntime(repoRoot);
  const testPaths = resolveInvestmentRuntimePathsForEnv(repoRoot, "test");

  assert.equal(testRuntimePath, testPaths.testRuntimeRoot);
  await assert.doesNotReject(fs.access(path.join(testPaths.agentsRoot, "information-collector.md")));
  await assert.doesNotReject(fs.access(path.join(testPaths.configRoot, "strategy.md")));
  await assert.doesNotReject(fs.access(path.join(testPaths.knowledgeRoot, "sample.md")));
  await assert.doesNotReject(fs.access(path.join(testPaths.dataRoot, "investment.sqlite3")));
  await assert.doesNotReject(fs.access(testPaths.outputRoot));

  const db = new DatabaseSync(path.join(testPaths.dataRoot, "investment.sqlite3"), { readOnly: true });
  try {
    const industryPath = db.prepare("SELECT knowledge_md_path AS path FROM industries").get() as { path: string };
    const outputPath = db.prepare("SELECT markdown_path AS path FROM operation_sheets").get() as { path: string };
    assert.equal(industryPath.path, "investment/runtime/test/knowledge/sample.md");
    assert.equal(outputPath.path, "investment/runtime/test/output/daily/sample.md");
  } finally {
    db.close();
  }

  await fs.rm(repoRoot, { recursive: true, force: true });
});

test("initializeTestRuntime refuses to overwrite an existing test tree without reset", async () => {
  const repoRoot = await createRepoFixture();
  await initializeTestRuntime(repoRoot);
  await assert.rejects(() => initializeTestRuntime(repoRoot), /Test runtime already exists/);
  await fs.rm(repoRoot, { recursive: true, force: true });
});

test("cleanupTestRuntime requires test env unless force flag is provided", async () => {
  const repoRoot = await createRepoFixture();
  await initializeTestRuntime(repoRoot);

  await withEnv("prod", async () => {
    await assert.rejects(() => cleanupTestRuntime(repoRoot), /requires INVESTMENT_ENV=test/);
    await assert.doesNotReject(() => cleanupTestRuntime(repoRoot, true));
  });

  await fs.rm(repoRoot, { recursive: true, force: true });
});
