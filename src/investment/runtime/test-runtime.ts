import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  resolveInvestmentEnvironment,
  resolveInvestmentRuntimePaths,
  resolveInvestmentRuntimePathsForEnv,
} from "./paths.js";

async function pathExists(pathname: string): Promise<boolean> {
  try {
    await fs.access(pathname);
    return true;
  } catch {
    return false;
  }
}

async function copyDirIfPresent(sourcePath: string, targetPath: string): Promise<void> {
  if (!(await pathExists(sourcePath))) {
    return;
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.cp(sourcePath, targetPath, { recursive: true });
}

function rewriteCopiedDatabasePaths(dbPath: string): void {
  const db = new DatabaseSync(dbPath);
  try {
    db.exec(`
      UPDATE industries
      SET knowledge_md_path = REPLACE(knowledge_md_path, 'investment/knowledge/', 'investment/runtime/test/knowledge/')
      WHERE knowledge_md_path LIKE 'investment/knowledge/%';
    `);
    db.exec(`
      UPDATE industry_knowledge_versions
      SET source_md_path = REPLACE(source_md_path, 'investment/knowledge/', 'investment/runtime/test/knowledge/')
      WHERE source_md_path LIKE 'investment/knowledge/%';
    `);
    db.exec(`
      UPDATE theses
      SET source_md_path = REPLACE(source_md_path, 'investment/knowledge/', 'investment/runtime/test/knowledge/')
      WHERE source_md_path LIKE 'investment/knowledge/%';
    `);
    db.exec(`
      UPDATE operation_sheets
      SET markdown_path = REPLACE(markdown_path, 'investment/output/', 'investment/runtime/test/output/')
      WHERE markdown_path LIKE 'investment/output/%';
    `);
  } finally {
    db.close();
  }
}

export async function initializeTestRuntime(repoRoot: string, reset = false): Promise<string> {
  const prodPaths = resolveInvestmentRuntimePathsForEnv(repoRoot, "prod");
  const testPaths = resolveInvestmentRuntimePathsForEnv(repoRoot, "test");

  if (await pathExists(testPaths.testRuntimeRoot)) {
    if (!reset) {
      throw new Error(`Test runtime already exists: ${testPaths.testRuntimeRoot}. Re-run with --reset to rebuild.`);
    }
    await fs.rm(testPaths.testRuntimeRoot, { recursive: true, force: true });
  }

  await fs.mkdir(testPaths.testRuntimeRoot, { recursive: true });
  await copyDirIfPresent(prodPaths.agentsRoot, testPaths.agentsRoot);
  await copyDirIfPresent(prodPaths.configRoot, testPaths.configRoot);
  await copyDirIfPresent(prodPaths.knowledgeRoot, testPaths.knowledgeRoot);
  await copyDirIfPresent(prodPaths.dataRoot, testPaths.dataRoot);
  const copiedDbPath = path.join(testPaths.dataRoot, "investment.sqlite3");
  if (await pathExists(copiedDbPath)) {
    rewriteCopiedDatabasePaths(copiedDbPath);
  }
  await fs.mkdir(testPaths.outputRoot, { recursive: true });
  return testPaths.testRuntimeRoot;
}

export async function cleanupTestRuntime(repoRoot: string, forceTestPath = false): Promise<string> {
  const currentEnv = resolveInvestmentEnvironment();
  const paths = resolveInvestmentRuntimePaths(repoRoot);
  if (currentEnv !== "test" && !forceTestPath) {
    throw new Error('cleanup-test-runtime requires INVESTMENT_ENV=test or --force-test-path.');
  }
  await fs.rm(paths.testRuntimeRoot, { recursive: true, force: true });
  return paths.testRuntimeRoot;
}
