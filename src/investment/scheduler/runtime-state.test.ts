import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  acquireSchedulerLock,
  createSchedulerStatus,
  readSchedulerLock,
  readSchedulerStatus,
  releaseSchedulerLock,
  resolveSchedulerRuntimePaths,
  writeSchedulerStatus,
} from "./runtime-state.js";

async function makeRepoRoot(): Promise<string> {
  return fs.mkdtemp(path.join(os.tmpdir(), "scheduler-runtime-"));
}

test("scheduler lock blocks a second live owner and releases current pid", async () => {
  const repoRoot = await makeRepoRoot();
  const configPath = path.join(repoRoot, "investment/config/schedules.json");

  const lock = await acquireSchedulerLock(repoRoot, "test", configPath);

  assert.equal(lock.pid, process.pid);
  await assert.rejects(() => acquireSchedulerLock(repoRoot, "second", configPath), /Scheduler already running/);
  assert.equal((await readSchedulerLock(repoRoot))?.owner, "test");

  await releaseSchedulerLock(repoRoot);
  assert.equal(await readSchedulerLock(repoRoot), null);
});

test("scheduler lock replaces stale pid locks", async () => {
  const repoRoot = await makeRepoRoot();
  const paths = resolveSchedulerRuntimePaths(repoRoot);
  const configPath = path.join(repoRoot, "investment/config/schedules.json");
  await fs.mkdir(paths.runtimeRoot, { recursive: true });
  await fs.writeFile(
    paths.lockPath,
    JSON.stringify({ pid: 99999999, startedAt: "2026-05-07T00:00:00.000Z", owner: "stale", configPath }),
    "utf8",
  );

  const lock = await acquireSchedulerLock(repoRoot, "fresh", configPath);

  assert.equal(lock.owner, "fresh");
  assert.equal((await readSchedulerLock(repoRoot))?.pid, process.pid);
});

test("scheduler status persists heartbeat, tick, and run state", async () => {
  const repoRoot = await makeRepoRoot();
  const lock = await acquireSchedulerLock(repoRoot, "test", "/repo/investment/config/schedules.json");
  const status = createSchedulerStatus(lock, "running", new Date("2026-05-07T08:45:00.000Z"));
  status.lastTickAt = "2026-05-07T08:45:30.000Z";
  status.lastRun = {
    runId: "daily-1",
    taskId: "daily",
    agent: "information-collector",
    status: "completed",
    startedAt: "2026-05-07T08:45:00.000Z",
    finishedAt: "2026-05-07T08:46:00.000Z",
    outputPath: "/repo/investment/output/scheduled/2026-05-07/daily.md",
    error: null,
  };

  await writeSchedulerStatus(repoRoot, status);
  const saved = await readSchedulerStatus(repoRoot);

  assert.equal(saved?.lastHeartbeatAt, "2026-05-07T08:45:00.000Z");
  assert.equal(saved?.lastTickAt, "2026-05-07T08:45:30.000Z");
  assert.equal(saved?.lastRun?.status, "completed");
});
