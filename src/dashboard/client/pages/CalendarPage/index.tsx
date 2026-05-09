import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useSchedules } from "../../hooks";
import { formatChinaTimestamp } from "../../lib/format";
import type { ScheduledAgentTask, SchedulerRunRecord } from "../../types";

type CalendarEventType = "collection" | "research" | "portfolio" | "risk";

interface CalendarEvent {
  id: string;
  dateKey: string;
  type: CalendarEventType;
  task: ScheduledAgentTask;
}

interface CalendarDay {
  date: Date;
  dateKey: string;
  inMonth: boolean;
  isToday: boolean;
}

const DAY_LABELS = ["一", "二", "三", "四", "五", "六", "日"];
const WEEKDAY_NAMES = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"];
const TYPE_LABELS: Record<CalendarEventType, string> = {
  collection: "信息收集",
  research: "研究分析",
  portfolio: "组合管理",
  risk: "风险复盘",
};
const TYPE_OPTIONS: Array<CalendarEventType | "all"> = ["all", "collection", "research", "portfolio", "risk"];
const TODAY = new Date();

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getIsoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function formatMonthLabel(date: Date): string {
  return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月`;
}

function formatReadableDate(date: Date): string {
  return `${date.getMonth() + 1} 月 ${date.getDate()} 日 周${DAY_LABELS[(date.getDay() + 6) % 7]}`;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(date.getDate() + days);
  return next;
}

function buildCalendarDays(monthDate: Date): CalendarDay[] {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const startOffset = (monthStart.getDay() + 6) % 7;
  const endOffset = 6 - ((monthEnd.getDay() + 6) % 7);
  const gridStart = addDays(monthStart, -startOffset);
  const totalDays = monthEnd.getDate() + startOffset + endOffset;
  const normalizedToday = toDateKey(TODAY);

  return Array.from({ length: totalDays }, (_, index) => {
    const date = addDays(gridStart, index);
    return {
      date,
      dateKey: toDateKey(date),
      inMonth: date.getMonth() === monthDate.getMonth(),
      isToday: toDateKey(date) === normalizedToday,
    };
  });
}

function classifyTask(task: ScheduledAgentTask): CalendarEventType {
  if (task.agent === "information-collector") {
    return "collection";
  }
  if (task.agent === "portfolio-manager" || task.agent === "chief-investment-officer") {
    return "portfolio";
  }
  if (task.agent === "risk-officer" || task.agent === "bear-case-analyst") {
    return "risk";
  }
  return "research";
}

function isTaskScheduledForDate(task: ScheduledAgentTask, date: Date): boolean {
  if (!task.weekdays) {
    return true;
  }
  return task.weekdays.includes(getIsoWeekday(date));
}

function buildMonthEvents(monthDate: Date, tasks: ScheduledAgentTask[]): CalendarEvent[] {
  const monthStart = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const monthEnd = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const events: CalendarEvent[] = [];

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const dateKey = toDateKey(date);
    for (const task of tasks) {
      if (!isTaskScheduledForDate(task, date)) {
        continue;
      }
      events.push({
        id: `${dateKey}-${task.id}`,
        dateKey,
        type: classifyTask(task),
        task,
      });
    }
  }

  return events.sort((left, right) => left.dateKey.localeCompare(right.dateKey) || left.task.time.localeCompare(right.task.time));
}

function formatWeekdays(task: ScheduledAgentTask): string {
  if (!task.weekdays) {
    return "每天";
  }
  return task.weekdays.map((day) => WEEKDAY_NAMES[day - 1]).join("、");
}

function findLatestRun(taskId: string, runs: SchedulerRunRecord[]): SchedulerRunRecord | null {
  return runs.find((run) => run.taskId === taskId) ?? null;
}

function runnerLabel(status: string): string {
  switch (status) {
    case "running":
      return "运行中";
    case "starting":
      return "启动中";
    case "stopping":
      return "停止中";
    default:
      return "已停止";
  }
}

function runStatusLabel(status: SchedulerRunRecord["status"]): string {
  switch (status) {
    case "completed":
      return "完成";
    case "failed":
      return "失败";
    default:
      return "运行中";
  }
}

export function CalendarPage() {
  const [visibleMonth, setVisibleMonth] = useState(() => new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
  const [selectedDateKey, setSelectedDateKey] = useState(() => toDateKey(TODAY));
  const [typeFilter, setTypeFilter] = useState<CalendarEventType | "all">("all");
  const {
    data,
    loading,
    savingTaskId,
    runningTaskId,
    controlling,
    error,
    message,
    setTaskEnabled,
    runTask,
    controlRunner,
  } = useSchedules();

  const tasks = data?.tasks ?? [];
  const runs = data?.recentRuns ?? [];
  const days = useMemo(() => buildCalendarDays(visibleMonth), [visibleMonth]);
  const monthEvents = useMemo(() => buildMonthEvents(visibleMonth, tasks), [visibleMonth, tasks]);
  const filteredEvents = useMemo(
    () => (typeFilter === "all" ? monthEvents : monthEvents.filter((event) => event.type === typeFilter)),
    [monthEvents, typeFilter],
  );
  const selectedDay = days.find((day) => day.dateKey === selectedDateKey);
  const selectedEvents = filteredEvents.filter((event) => event.dateKey === selectedDateKey);
  const activeTasks = tasks.filter((task) => task.enabled !== false).length;
  const disabledTasks = tasks.length - activeTasks;
  const runner = data?.runner;
  const externalRunnerActive = runner?.status === "running" && !runner.managed;

  const goToMonth = (offset: number) => {
    setVisibleMonth((current) => {
      const next = new Date(current.getFullYear(), current.getMonth() + offset, 1);
      setSelectedDateKey(toDateKey(new Date(next.getFullYear(), next.getMonth(), 1)));
      return next;
    });
  };

  const goToToday = () => {
    setVisibleMonth(new Date(TODAY.getFullYear(), TODAY.getMonth(), 1));
    setSelectedDateKey(toDateKey(TODAY));
  };

  return (
    <div className="calendar-page">
      <header className="calendar-topbar">
        <div>
          <div className="calendar-kicker">Investment OS</div>
          <h1>研究日历</h1>
        </div>
        <div className="calendar-topbar-actions">
          <Link className="calendar-text-link" to="/">
            控制台
          </Link>
          <button type="button" onClick={goToToday}>
            今天
          </button>
        </div>
      </header>

      <main className="calendar-main">
        <section className="calendar-runner-bar">
          <div>
            <div className="calendar-kicker">Scheduler</div>
            <h2>{runner ? runnerLabel(runner.status) : loading ? "加载中" : "未知状态"}</h2>
            <p>
              {runner?.pid ? `pid ${runner.pid} · ${runner.owner ?? "unknown"}` : "未发现常驻调度进程"}
              {runner?.lastHeartbeatAt ? ` · heartbeat ${formatChinaTimestamp(runner.lastHeartbeatAt)}` : ""}
            </p>
          </div>
          <div className="calendar-runner-actions">
            <button type="button" disabled={Boolean(controlling) || runner?.status === "running"} onClick={() => void controlRunner("start")}>
              启动
            </button>
            <button type="button" disabled={Boolean(controlling) || !runner?.managed} onClick={() => void controlRunner("stop")}>
              停止
            </button>
            <button type="button" disabled={Boolean(controlling) || !runner?.managed} onClick={() => void controlRunner("restart")}>
              重启
            </button>
          </div>
          {externalRunnerActive ? <div className="calendar-runner-note">检测到外部 CLI runner，页面仅显示状态。</div> : null}
          {error ? <div className="error-state">{error}</div> : null}
          {message ? <div className="success-state">{message}</div> : null}
        </section>

        <section className="calendar-summary-strip" aria-label="月度概览">
          <article className="calendar-summary-card">
            <span>配置任务</span>
            <strong>{tasks.length}</strong>
          </article>
          <article className="calendar-summary-card">
            <span>已启用</span>
            <strong>{activeTasks}</strong>
          </article>
          <article className="calendar-summary-card">
            <span>已停用</span>
            <strong>{disabledTasks}</strong>
          </article>
          <article className="calendar-summary-card">
            <span>选中日</span>
            <strong>{selectedEvents.length}</strong>
          </article>
        </section>

        <section className="calendar-workspace">
          <section className="calendar-board-panel" aria-label="月历">
            <div className="calendar-board-header">
              <div>
                <div className="calendar-kicker">Calendar</div>
                <h2>{formatMonthLabel(visibleMonth)}</h2>
              </div>
              <div className="calendar-controls">
                <button type="button" aria-label="上个月" onClick={() => goToMonth(-1)}>
                  ←
                </button>
                <button type="button" aria-label="下个月" onClick={() => goToMonth(1)}>
                  →
                </button>
                <select
                  aria-label="任务类型"
                  value={typeFilter}
                  onChange={(event) => setTypeFilter(event.target.value as CalendarEventType | "all")}
                >
                  {TYPE_OPTIONS.map((type) => (
                    <option value={type} key={type}>
                      {type === "all" ? "全部类型" : TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="calendar-grid">
              {DAY_LABELS.map((label) => (
                <div className="calendar-weekday" key={label}>
                  {label}
                </div>
              ))}

              {days.map((day) => {
                const events = filteredEvents.filter((event) => event.dateKey === day.dateKey);
                const isSelected = selectedDateKey === day.dateKey;
                return (
                  <button
                    type="button"
                    className={[
                      "calendar-day",
                      day.inMonth ? "" : "outside-month",
                      day.isToday ? "today" : "",
                      isSelected ? "selected" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={day.dateKey}
                    onClick={() => setSelectedDateKey(day.dateKey)}
                  >
                    <span className="calendar-day-number">{day.date.getDate()}</span>
                    <span className="calendar-day-events">
                      {events.slice(0, 4).map((event) => (
                        <span className={`calendar-dot dot-${event.type} ${event.task.enabled === false ? "dot-disabled" : ""}`} key={event.id} />
                      ))}
                      {events.length > 4 ? <span className="calendar-more">+{events.length - 4}</span> : null}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="calendar-agenda-panel" aria-label="日程">
            <div className="calendar-agenda-header">
              <div>
                <div className="calendar-kicker">Agenda</div>
                <h2>{selectedDay ? formatReadableDate(selectedDay.date) : selectedDateKey}</h2>
              </div>
              <span>{selectedEvents.length} 项</span>
            </div>

            <div className="calendar-agenda-list">
              {loading ? <div className="calendar-empty">正在加载定时任务。</div> : null}
              {!loading && selectedEvents.length === 0 ? <div className="calendar-empty">当天没有匹配任务。</div> : null}
              {selectedEvents.map((event) => {
                const latestRun = findLatestRun(event.task.id, runs);
                const enabled = event.task.enabled !== false;
                return (
                  <article className={`calendar-event-card event-${event.type} ${enabled ? "" : "event-disabled"}`} key={event.id}>
                    <div className="calendar-event-time">{event.task.time}</div>
                    <div>
                      <div className="calendar-event-head">
                        <h3>{event.task.id}</h3>
                        <span className={`calendar-event-status ${enabled ? "status-active" : "status-draft"}`}>
                          {enabled ? "enabled" : "disabled"}
                        </span>
                      </div>
                      <p>{event.task.task}</p>
                      <div className="calendar-event-meta">
                        <span>{TYPE_LABELS[event.type]}</span>
                        <span>{event.task.agent}</span>
                        <span>{formatWeekdays(event.task)}</span>
                        {event.task.subject ? <span>{event.task.subject}</span> : null}
                      </div>
                      {event.task.output ? <div className="calendar-output-path">{event.task.output}</div> : null}
                      {latestRun ? (
                        <div className={`calendar-run-state run-${latestRun.status}`}>
                          最近运行: {runStatusLabel(latestRun.status)}
                          {latestRun.finishedAt ? ` · ${formatChinaTimestamp(latestRun.finishedAt)}` : ""}
                          {latestRun.outputPath ? ` · ${latestRun.outputPath}` : ""}
                          {latestRun.error ? ` · ${latestRun.error}` : ""}
                        </div>
                      ) : null}
                      <div className="calendar-event-actions">
                        <button
                          type="button"
                          disabled={savingTaskId === event.task.id}
                          onClick={() => void setTaskEnabled(event.task.id, !enabled)}
                        >
                          {enabled ? "停用" : "启用"}
                        </button>
                        <button
                          type="button"
                          disabled={runningTaskId === event.task.id}
                          onClick={() => void runTask(event.task.id)}
                        >
                          立即运行
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </aside>
        </section>
      </main>
    </div>
  );
}
