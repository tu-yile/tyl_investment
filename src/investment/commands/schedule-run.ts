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
  const config = await loadScheduledAgentTaskConfig(configPath);
  const state = createInitialSchedulerRunState(config);
  const pollIntervalMs = config.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;

  console.log(`schedule config: ${configPath}`);
  console.log(`scheduled tasks: ${config.tasks.filter((task) => task.enabled !== false).length}`);
  console.log(`poll interval: ${pollIntervalMs}ms`);

  let running = true;
  const stop = (): void => {
    running = false;
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  while (running) {
    await runDueScheduledTasks(config, state, repoRoot, new Date());
    if (running) {
      await sleep(pollIntervalMs);
    }
  }

  console.log("schedule runner stopped.");
}

export async function runDueScheduledTasks(
  config: ScheduledAgentTaskConfig,
  state: SchedulerRunState,
  repoRoot: string,
  now: Date,
): Promise<void> {
  const dueTasks = findDueScheduledAgentTasks(config, state, now);
  for (const { task, runDate } of dueTasks) {
    console.log(`[schedule] running ${task.id} -> ${task.agent}`);
    try {
      await runAgentCommand(buildAgentRunOptions(task, repoRoot, now), repoRoot);
      markScheduledAgentTaskRun(state, task.id, runDate);
      console.log(`[schedule] completed ${task.id}`);
    } catch (error) {
      console.error(`[schedule] failed ${task.id}:`, error);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}
