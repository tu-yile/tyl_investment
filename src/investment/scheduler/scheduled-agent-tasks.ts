import path from "node:path";
import { resolveInvestmentRuntimePaths } from "../runtime/paths.js";

export interface ScheduledAgentTask {
  id: string;
  enabled?: boolean;
  time: string;
  agent: string;
  task: string;
  subject?: string;
  context?: string | string[];
  contextFiles?: string[];
  output?: string;
}

export interface ScheduledAgentTaskConfig {
  pollIntervalMs?: number;
  runMissedOnStart?: boolean;
  tasks: ScheduledAgentTask[];
}

export interface SchedulerRunState {
  lastRunDateByTaskId: Map<string, string>;
}

export interface DueScheduledAgentTask {
  task: ScheduledAgentTask;
  runDate: string;
}

interface DailyTime {
  hour: number;
  minute: number;
}

export function parseDailyTime(value: string): DailyTime {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!match) {
    throw new Error(`Invalid schedule time "${value}". Expected HH:mm in 24-hour local time.`);
  }
  return {
    hour: Number(match[1]),
    minute: Number(match[2]),
  };
}

export function formatLocalDate(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, "0"),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

export function formatLocalClock(date: Date): string {
  return [String(date.getHours()).padStart(2, "0"), String(date.getMinutes()).padStart(2, "0")].join(":");
}

export function formatLocalTimestamp(date: Date): string {
  return [
    formatLocalDate(date),
    "T",
    String(date.getHours()).padStart(2, "0"),
    String(date.getMinutes()).padStart(2, "0"),
    String(date.getSeconds()).padStart(2, "0"),
  ].join("");
}

export function normalizeContextBlocks(task: ScheduledAgentTask): string[] {
  const contextValues = Array.isArray(task.context) ? task.context : task.context ? [task.context] : [];
  return [
    ["### Scheduled Task", "", task.task.trim()].join("\n"),
    ...contextValues.map((value) => value.trim()).filter(Boolean),
  ];
}

export function resolveTaskOutputPath(task: ScheduledAgentTask, repoRoot: string, now: Date): string | undefined {
  if (!task.output) {
    return undefined;
  }

  const replacements: Record<string, string> = {
    agent: task.agent,
    date: formatLocalDate(now),
    outputRoot: resolveInvestmentRuntimePaths(repoRoot).outputRoot,
    taskId: task.id,
    time: task.time.replace(":", ""),
    timestamp: formatLocalTimestamp(now),
  };

  const outputPath = task.output.replace(/\{(agent|date|outputRoot|taskId|time|timestamp)\}/g, (_, key: string) => {
    return replacements[key];
  });
  return path.isAbsolute(outputPath) ? outputPath : path.join(repoRoot, outputPath);
}

export function buildAgentRunOptions(task: ScheduledAgentTask, repoRoot: string, now: Date): string[] {
  const options = [`--agent=${task.agent}`];
  if (task.subject) {
    options.push(`--subject=${task.subject}`);
  }
  for (const contextBlock of normalizeContextBlocks(task)) {
    options.push(`--context=${contextBlock}`);
  }
  for (const contextFile of task.contextFiles ?? []) {
    options.push(`--context-file=${contextFile}`);
  }
  const outputPath = resolveTaskOutputPath(task, repoRoot, now);
  if (outputPath) {
    options.push(`--output=${outputPath}`);
  }
  return options;
}

export function createInitialSchedulerRunState(
  config: ScheduledAgentTaskConfig,
  now = new Date(),
): SchedulerRunState {
  const lastRunDateByTaskId = new Map<string, string>();
  if (config.runMissedOnStart) {
    return { lastRunDateByTaskId };
  }

  const today = formatLocalDate(now);
  for (const task of config.tasks) {
    if (task.enabled === false) {
      continue;
    }
    if (isPastScheduledTime(task, now)) {
      lastRunDateByTaskId.set(task.id, today);
    }
  }
  return { lastRunDateByTaskId };
}

export function findDueScheduledAgentTasks(
  config: ScheduledAgentTaskConfig,
  state: SchedulerRunState,
  now = new Date(),
): DueScheduledAgentTask[] {
  const today = formatLocalDate(now);
  return config.tasks
    .filter((task) => task.enabled !== false)
    .filter((task) => state.lastRunDateByTaskId.get(task.id) !== today)
    .filter((task) => isPastScheduledTime(task, now))
    .map((task) => ({ task, runDate: today }));
}

export function markScheduledAgentTaskRun(state: SchedulerRunState, taskId: string, runDate: string): void {
  state.lastRunDateByTaskId.set(taskId, runDate);
}

export function validateScheduledAgentTaskConfig(config: ScheduledAgentTaskConfig): void {
  if (!Array.isArray(config.tasks)) {
    throw new Error("Schedule config must contain a tasks array.");
  }

  const taskIds = new Set<string>();
  for (const task of config.tasks) {
    if (!task.id || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(task.id)) {
      throw new Error("Each scheduled task needs a stable id using letters, numbers, dot, underscore or dash.");
    }
    if (taskIds.has(task.id)) {
      throw new Error(`Duplicate scheduled task id: ${task.id}`);
    }
    taskIds.add(task.id);
    if (!task.agent || task.agent.trim().length === 0) {
      throw new Error(`Scheduled task "${task.id}" is missing agent.`);
    }
    if (!task.task || task.task.trim().length === 0) {
      throw new Error(`Scheduled task "${task.id}" is missing task.`);
    }
    parseDailyTime(task.time);
  }
}

function isPastScheduledTime(task: ScheduledAgentTask, now: Date): boolean {
  const scheduled = parseDailyTime(task.time);
  const scheduledAt = new Date(now);
  scheduledAt.setHours(scheduled.hour, scheduled.minute, 0, 0);
  return now.getTime() >= scheduledAt.getTime();
}
