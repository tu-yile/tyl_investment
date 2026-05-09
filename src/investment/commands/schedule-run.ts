import fs from "node:fs/promises";
import path from "node:path";
import { parseOption } from "../cli-options.js";
import { resolveInvestmentRuntimePaths } from "../runtime/paths.js";
import { runAgentCommand } from "./agent-run.js";
import {
  buildAgentRunOptions,
  createInitialSchedulerRunState,
  findDueScheduledAgentTasks,
  markScheduledAgentTaskRun,
  validateScheduledAgentTaskConfig,
  type ScheduledAgentTaskConfig,
  type SchedulerRunState,
} from "../scheduler/scheduled-agent-tasks.js";
import {
  acquireSchedulerLock,
  createSchedulerStatus,
  releaseSchedulerLock,
  writeSchedulerStatus,
  type SchedulerRunRecord,
  type SchedulerStatusFile,
} from "../scheduler/runtime-state.js";

const DEFAULT_CONFIG_FILE = "schedules.json";
const DEFAULT_POLL_INTERVAL_MS = 30_000;

export async function loadScheduledAgentTaskConfig(configPath: string): Promise<ScheduledAgentTaskConfig> {
  const raw = await fs.readFile(configPath, "utf8");
  const parsed = JSON.parse(raw) as ScheduledAgentTaskConfig;
  validateScheduledAgentTaskConfig(parsed);
  return parsed;
}

export async function runScheduleCommand(options: string[], repoRoot: string): Promise<void> {
  const configPathOption = parseOption(options, "config");
  const defaultConfigPath = path.join(resolveInvestmentRuntimePaths(repoRoot).configRoot, DEFAULT_CONFIG_FILE);
  const configPath = configPathOption
    ? path.isAbsolute(configPathOption)
      ? configPathOption
      : path.join(repoRoot, configPathOption)
    : defaultConfigPath;
  let config = await loadScheduledAgentTaskConfig(configPath);
  const state = createInitialSchedulerRunState(config);
  let pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const owner = parseOption(options, "owner") ?? process.env.SCHEDULER_RUNNER_OWNER ?? "cli";
  const lock = await acquireSchedulerLock(repoRoot, owner, configPath);
  const status = createSchedulerStatus(lock, "running");
  await writeSchedulerStatus(repoRoot, status);

  console.log(`schedule config: ${configPath}`);
  console.log(`scheduled tasks: ${config.tasks.filter((task) => task.enabled !== false).length}`);
  console.log(`poll interval: ${pollIntervalMs}ms`);

  let running = true;
  let wakeSleep: (() => void) | null = null;
  const stop = (): void => {
    running = false;
    wakeSleep?.();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    while (running) {
      const now = new Date();
      try {
        config = await loadScheduledAgentTaskConfig(configPath);
        pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        status.lastError = null;
      } catch (error: unknown) {
        status.lastError = error instanceof Error ? error.message : String(error);
      }
      status.status = "running";
      status.lastHeartbeatAt = now.toISOString();
      status.lastTickAt = now.toISOString();
      await writeSchedulerStatus(repoRoot, status);
      if (!status.lastError) {
        await runDueScheduledTasks(config, state, repoRoot, now, status);
      }
      if (running) {
        await sleep(pollIntervalMs, (wake) => {
          wakeSleep = wake;
        });
        wakeSleep = null;
      }
    }
  } finally {
    const now = new Date().toISOString();
    status.status = "stopped";
    status.lastHeartbeatAt = now;
    await writeSchedulerStatus(repoRoot, status);
    await releaseSchedulerLock(repoRoot);
  }

  console.log("schedule runner stopped.");
}

export async function runDueScheduledTasks(
  config: ScheduledAgentTaskConfig,
  state: SchedulerRunState,
  repoRoot: string,
  now: Date,
  status?: SchedulerStatusFile,
): Promise<void> {
  const dueTasks = findDueScheduledAgentTasks(config, state, now);
  for (const { task, runDate } of dueTasks) {
    const outputPath = task.output ? buildAgentRunOptions(task, repoRoot, now).find((option) => option.startsWith("--output="))?.slice(9) ?? null : null;
    const runRecord: SchedulerRunRecord = {
      runId: `${task.id}-${now.getTime()}`,
      taskId: task.id,
      agent: task.agent,
      status: "running",
      startedAt: now.toISOString(),
      finishedAt: null,
      outputPath,
      error: null,
    };
    if (status) {
      status.lastRun = runRecord;
      status.lastError = null;
      await writeSchedulerStatus(repoRoot, status);
    }
    console.log(`[schedule] running ${task.id} -> ${task.agent}`);
    try {
      await runAgentCommand(buildAgentRunOptions(task, repoRoot, now), repoRoot);
      markScheduledAgentTaskRun(state, task.id, runDate);
      runRecord.status = "completed";
      runRecord.finishedAt = new Date().toISOString();
      if (status) {
        status.lastRun = runRecord;
        status.lastError = null;
        status.lastHeartbeatAt = runRecord.finishedAt;
        await writeSchedulerStatus(repoRoot, status);
      }
      console.log(`[schedule] completed ${task.id}`);
    } catch (error) {
      runRecord.status = "failed";
      runRecord.finishedAt = new Date().toISOString();
      runRecord.error = error instanceof Error ? error.message : String(error);
      if (status) {
        status.lastRun = runRecord;
        status.lastError = runRecord.error;
        status.lastHeartbeatAt = runRecord.finishedAt;
        await writeSchedulerStatus(repoRoot, status);
      }
      console.error(`[schedule] failed ${task.id}:`, error);
    }
  }
}

function sleep(ms: number, registerWake?: (wake: () => void) => void): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    registerWake?.(() => {
      clearTimeout(timer);
      resolve();
    });
  });
}
