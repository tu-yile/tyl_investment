import { useDeferredValue, useEffect, useRef, useState } from "react";
import { useLogStream } from "../../hooks";
import { formatChinaTimestamp, formatDateTimeInputValue, parseDateInputValue, stringifyExtra } from "../../lib/format";
import type { LogEntry } from "../../types";

function matchesLogFilters(entry: LogEntry, message: string, level: string, startTime: string, endTime: string): boolean {
  if (level && entry.level !== level) {
    return false;
  }
  const entryTime = entry.ts ? new Date(entry.ts).getTime() : Number.NaN;
  if (startTime) {
    const startAt = parseDateInputValue(startTime);
    if (startAt !== null && (Number.isNaN(entryTime) || entryTime < startAt)) {
      return false;
    }
  }
  if (endTime) {
    const endAt = parseDateInputValue(endTime);
    if (endAt !== null && (Number.isNaN(entryTime) || entryTime > endAt)) {
      return false;
    }
  }
  if (!message) {
    return true;
  }
  return (entry.message || "").toLowerCase().includes(message.toLowerCase());
}

export function LogsPage() {
  const { entries, connected, connectionLabel, clearEntries } = useLogStream();
  const [messageFilter, setMessageFilter] = useState("");
  const [level, setLevel] = useState("");
  const [startTimeFilter, setStartTimeFilter] = useState(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return formatDateTimeInputValue(now);
  });
  const [endTimeFilter, setEndTimeFilter] = useState(() => {
    const now = new Date();
    now.setHours(23, 59, 0, 0);
    return formatDateTimeInputValue(now);
  });
  const [autoScroll, setAutoScroll] = useState(true);
  const deferredMessageFilter = useDeferredValue(messageFilter);
  const logListRef = useRef<HTMLDivElement | null>(null);

  const filteredEntries = entries.filter((entry) =>
    matchesLogFilters(entry, deferredMessageFilter, level, startTimeFilter, endTimeFilter),
  );

  useEffect(() => {
    if (!autoScroll || !logListRef.current) {
      return;
    }
    logListRef.current.scrollTop = logListRef.current.scrollHeight;
  }, [autoScroll, filteredEntries.length]);

  return (
    <div className="page-stack">
      <section className="workspace-grid logs-workspace">
        <aside className="panel workspace-sidebar">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">控制</h3>
              <p className="panel-subtitle">筛选与显示。</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="control-stack">
              <input
                value={messageFilter}
                onChange={(event) => setMessageFilter(event.target.value)}
                placeholder="按 message 筛选"
              />
              <input
                type="datetime-local"
                value={startTimeFilter}
                onChange={(event) => setStartTimeFilter(event.target.value)}
              />
              <input
                type="datetime-local"
                value={endTimeFilter}
                onChange={(event) => setEndTimeFilter(event.target.value)}
              />
              <select value={level} onChange={(event) => setLevel(event.target.value)}>
                <option value="">全部级别</option>
                <option value="info">info</option>
                <option value="warn">warn</option>
                <option value="error">error</option>
              </select>
              <button type="button" onClick={() => setAutoScroll((current) => !current)}>
                {autoScroll ? "暂停自动滚动" : "恢复自动滚动"}
              </button>
              <button type="button" className="secondary-button" onClick={clearEntries}>
                清空页面
              </button>
            </div>

            <div className="info-list compact">
              <div className="info-row">
                <span className="info-label">连接</span>
                <span className="info-value">{connectionLabel}</span>
              </div>
              <div className="info-row">
                <span className="info-label">总条数</span>
                <span className="info-value">{entries.length}</span>
              </div>
              <div className="info-row">
                <span className="info-label">匹配条数</span>
                <span className="info-value">{filteredEntries.length}</span>
              </div>
            </div>
          </div>
        </aside>

        <section className="panel workspace-main">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">实时日志流</h2>
              <p className="panel-subtitle">最近日志与实时更新。</p>
            </div>
            <div className={connected ? "status-text" : "status-text disconnected"}>状态: {connectionLabel}</div>
          </div>
          <div className="panel-body">
            <div className="loglist large" ref={logListRef}>
              {filteredEntries.length === 0 ? <div className="empty-log">当前没有匹配的日志。</div> : null}
              {filteredEntries.map((entry, index) => (
                <article className="log-entry" key={`${entry.ts || "log"}-${index}`}>
                  <div className="log-entry-head">
                    <span className={`level level-${entry.level || "info"}`}>{entry.level || "info"}</span>
                    <span className="timestamp">{formatChinaTimestamp(entry.ts)}</span>
                  </div>
                  <div className="log-message">{entry.message || "(no message)"}</div>
                  {stringifyExtra(entry.extra) ? <pre>{stringifyExtra(entry.extra)}</pre> : null}
                </article>
              ))}
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
