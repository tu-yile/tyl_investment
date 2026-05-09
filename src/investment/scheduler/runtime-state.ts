import fs from "node:fs/promises";
import path from "node:path";
import { resolveInvestmentRuntimePaths } from "../runtime/paths.js";

export type SchedulerRuntimeStatus = "starting" | "running" | "stopping" | "stopped" | "failed";
export type SchedulerRunStatus = "running" | "completed" | "failed";

export interface SchedulerLockFile {
  pid: number;
  startedAt: string;
  owner: string;
  configPath: string;
}

export interface SchedulerRunRecord {
  runId: string;
  taskId: string;
  agent: string;
  status: SchedulerRunStatus;
  startedAt: string;
  finishedAt: string | null;
  outputPath: string | null;
  error: string | null;
}

export interface SchedulerStatusFile {
  status: SchedulerRuntimeStatus;
  owner: string;
  pid: number;
  configPath: string;
  startedAt: string;
  lastHeartbeatAt: string | null;
  lastTickAt: string | null;
  lastRun: SchedulerRunRecord | null;
  lastError: string | null;
}

export interface SchedulerRuntimePaths {
  runtimeRoot: string;
  lockPath: string;
  statusPath: string;
}

export function resolveSchedulerRuntimePaths(repoRoot: string): SchedulerRuntimePaths {
  const runtimeRoot = path.join(resolveInvestmentRuntimePaths(repoRoot).outputRoot, "scheduler");
  return {
    runtimeRoot,
    lockPath: path.join(runtimeRoot, "scheduler.lock.json"),
    statusPath: path.join(runtimeRoot, "scheduler.status.json"),
  };
}

export function isPidAlive(pid: number): boolean {
  if (!Number.isInteger(pid) || pid <= 0) {
    return false;
  }
  try {
    process.kill(pid, 0);
    return true;
  } catch (_error) {
    return false;
  }
}

export async function readSchedulerLock(repoRoot: string): Promise<SchedulerLockFile | null> {
  return readJsonFile<SchedulerLockFile>(resolveSchedulerRuntimePaths(repoRoot).lockPath);
}

export async function readSchedulerStatus(repoRoot: string): Promise<SchedulerStatusFile | null> {
  return readJsonFile<SchedulerStatusFile>(resolveSchedulerRuntimePaths(repoRoot).statusPath);
}

export async function acquireSchedulerLock(
  repoRoot: string,
  owner: string,
  configPath: string,
): Promise<SchedulerLockFile> {
  const paths = resolveSchedulerRuntimePaths(repoRoot);
  await fs.mkdir(paths.runtimeRoot, { recursive: true });

  const existingLock = await readSchedulerLock(repoRoot);
  if (existingLock && isPidAlive(existingLock.pid)) {
    throw new Error(
      `Scheduler already running: pid=${existingLock.pid}, owner=${existingLock.owner}, config=${existingLock.configPath}`,
    );
  }
  if (existingLock) {
    await fs.rm(paths.lockPath, { force: true });
  }

  const lock: SchedulerLockFile = {
    pid: process.pid,
    startedAt: new Date().toISOString(),
    owner,
    configPath,
  };
  await writeJsonFile(paths.lockPath, lock);
  return lock;
}

export async function releaseSchedulerLock(repoRoot: string): Promise<void> {
  const paths = resolveSchedulerRuntimePaths(repoRoot);
  const lock = await readSchedulerLock(repoRoot);
  if (!lock || lock.pid === process.pid) {
    await fs.rm(paths.lockPath, { force: true });
  }
}

export async function writeSchedulerStatus(repoRoot: string, status: SchedulerStatusFile): Promise<void> {
  const paths = resolveSchedulerRuntimePaths(repoRoot);
  await fs.mkdir(paths.runtimeRoot, { recursive: true });
  await writeJsonFile(paths.statusPath, status);
}

export function createSchedulerStatus(
  lock: SchedulerLockFile,
  status: SchedulerRuntimeStatus,
  now = new Date(),
): SchedulerStatusFile {
  const timestamp = now.toISOString();
  return {
    status,
    owner: lock.owner,
    pid: lock.pid,
    configPath: lock.configPath,
    startedAt: lock.startedAt,
    lastHeartbeatAt: timestamp,
    lastTickAt: null,
    lastRun: null,
    lastError: null,
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
