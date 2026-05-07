import assert from "node:assert/strict";
import test from "node:test";
import {
  buildAgentRunOptions,
  createInitialSchedulerRunState,
  findDueScheduledAgentTasks,
  markScheduledAgentTaskRun,
  parseDailyTime,
  resolveTaskOutputPath,
  validateScheduledAgentTaskConfig,
  type ScheduledAgentTaskConfig,
} from "./scheduled-agent-tasks.js";

test("parseDailyTime accepts 24-hour HH:mm values", () => {
  assert.deepEqual(parseDailyTime("08:45"), { hour: 8, minute: 45 });
  assert.deepEqual(parseDailyTime("23:59"), { hour: 23, minute: 59 });
  assert.throws(() => parseDailyTime("24:00"), /Invalid schedule time/);
  assert.throws(() => parseDailyTime("8:45"), /Invalid schedule time/);
});

test("findDueScheduledAgentTasks returns enabled tasks whose fixed time has passed today", () => {
  const config: ScheduledAgentTaskConfig = {
    runMissedOnStart: true,
    tasks: [
      {
        id: "morning",
        time: "08:45",
        agent: "information-collector",
        task: "collect facts",
      },
      {
        id: "later",
        time: "15:30",
        agent: "portfolio-manager",
        task: "review portfolio",
      },
      {
        id: "disabled",
        enabled: false,
        time: "08:00",
        agent: "risk-officer",
        task: "risk check",
      },
    ],
  };
  const state = createInitialSchedulerRunState(config, new Date(2026, 4, 7, 9, 0, 0));

  const due = findDueScheduledAgentTasks(config, state, new Date(2026, 4, 7, 9, 0, 0));

  assert.deepEqual(
    due.map((item) => item.task.id),
    ["morning"],
  );
});

test("createInitialSchedulerRunState can skip missed tasks on process start", () => {
  const config: ScheduledAgentTaskConfig = {
    runMissedOnStart: false,
    tasks: [
      {
        id: "morning",
        time: "08:45",
        agent: "information-collector",
        task: "collect facts",
      },
    ],
  };
  const state = createInitialSchedulerRunState(config, new Date(2026, 4, 7, 9, 0, 0));

  assert.equal(findDueScheduledAgentTasks(config, state, new Date(2026, 4, 7, 9, 0, 0)).length, 0);
  assert.equal(findDueScheduledAgentTasks(config, state, new Date(2026, 4, 8, 9, 0, 0)).length, 1);
});

test("markScheduledAgentTaskRun prevents duplicate runs on the same day", () => {
  const config: ScheduledAgentTaskConfig = {
    runMissedOnStart: true,
    tasks: [
      {
        id: "morning",
        time: "08:45",
        agent: "information-collector",
        task: "collect facts",
      },
    ],
  };
  const now = new Date(2026, 4, 7, 9, 0, 0);
  const state = createInitialSchedulerRunState(config, now);
  const [due] = findDueScheduledAgentTasks(config, state, now);

  markScheduledAgentTaskRun(state, due.task.id, due.runDate);

  assert.equal(findDueScheduledAgentTasks(config, state, now).length, 0);
});

test("buildAgentRunOptions maps scheduled task fields to agent:run options", () => {
  const task = {
    id: "company-check",
    time: "10:15",
    agent: "company-analyst",
    subject: "300750",
    task: "检查宁德时代 thesis 是否变化。",
    context: ["关注销量和毛利率。"],
    contextFiles: ["tmp/context.md"],
    output: "investment/output/scheduled/{date}/{taskId}-{agent}-{time}.md",
  };

  assert.deepEqual(buildAgentRunOptions(task, "/repo", new Date(2026, 4, 7, 10, 16, 0)), [
    "--agent=company-analyst",
    "--subject=300750",
    "--context=### Scheduled Task\n\n检查宁德时代 thesis 是否变化。",
    "--context=关注销量和毛利率。",
    "--context-file=tmp/context.md",
    "--output=/repo/investment/output/scheduled/2026-05-07/company-check-company-analyst-1015.md",
  ]);
});

test("resolveTaskOutputPath expands stable placeholders", () => {
  const outputPath = resolveTaskOutputPath(
    {
      id: "daily",
      time: "08:45",
      agent: "information-collector",
      task: "collect facts",
      output: "{outputRoot}/scheduled/{date}/{taskId}-{timestamp}.md",
    },
    "/repo",
    new Date(2026, 4, 7, 8, 45, 30),
  );

  assert.equal(outputPath, "/repo/investment/output/scheduled/2026-05-07/daily-2026-05-07T084530.md");
});

test("validateScheduledAgentTaskConfig rejects duplicate ids and malformed tasks", () => {
  assert.throws(
    () =>
      validateScheduledAgentTaskConfig({
        tasks: [
          { id: "a", time: "08:00", agent: "information-collector", task: "one" },
          { id: "a", time: "09:00", agent: "risk-officer", task: "two" },
        ],
      }),
    /Duplicate scheduled task id: a/,
  );
  assert.throws(
    () =>
      validateScheduledAgentTaskConfig({
        tasks: [{ id: "bad", time: "8:00", agent: "information-collector", task: "one" }],
      }),
    /Invalid schedule time/,
  );
});
