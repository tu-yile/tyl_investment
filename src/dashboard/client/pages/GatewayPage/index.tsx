import { useEffect, useState } from "react";
import { controlGateway, fetchGatewayStatus, fetchGatewayThreads } from "../../api";
import { formatChinaTimestamp } from "../../lib/format";
import type { GatewayStatusResponse, GatewayThreadSummary } from "../../types";

function statusText(status: GatewayStatusResponse["status"]): string {
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

function statusClassName(status: GatewayStatusResponse["status"]): string {
  return status === "running" ? "status-pill" : "status-pill disconnected";
}

export function GatewayPage() {
  const [gateway, setGateway] = useState<GatewayStatusResponse | null>(null);
  const [threads, setThreads] = useState<GatewayThreadSummary[]>([]);
  const [selectedThreadId, setSelectedThreadId] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingAction, setPendingAction] = useState<"" | "start" | "stop" | "restart">("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function loadStatus(silent = false): Promise<void> {
      if (!silent) {
        setLoading(true);
      }
      try {
        const payload = await fetchGatewayStatus();
        if (!active) {
          return;
        }
        setGateway(payload);
        setError(null);
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "网关状态加载失败");
      } finally {
        if (active && !silent) {
          setLoading(false);
        }
      }
    }

    async function loadThreads(): Promise<void> {
      try {
        const payload = await fetchGatewayThreads();
        if (!active) {
          return;
        }
        setThreads(payload.threads);
        setSelectedThreadId((current) => (payload.threads.some((item) => item.threadId === current) ? current : payload.threads[0]?.threadId || ""));
      } catch (loadError) {
        if (!active) {
          return;
        }
        setError(loadError instanceof Error ? loadError.message : "线程聚合加载失败");
      }
    }

    void loadStatus();
    void loadThreads();
    const timer = window.setInterval(() => {
      void loadStatus(true);
      void loadThreads();
    }, 3000);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, []);

  async function runAction(action: "start" | "stop" | "restart"): Promise<void> {
    setPendingAction(action);
    setError(null);
    try {
      const payload = await controlGateway(action);
      setGateway(payload.gateway);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "网关操作失败");
    } finally {
      setPendingAction("");
    }
  }

  const selectedThread = threads.find((item) => item.threadId === selectedThreadId) || null;

  return (
    <div className="page-stack">
      <section className="workspace-grid logs-workspace">
        <aside className="panel workspace-sidebar">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">控制</h3>
              <p className="panel-subtitle">飞书网关进程管理。</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="control-stack">
              <button
                type="button"
                onClick={() => void runAction("start")}
                disabled={pendingAction !== "" || gateway?.status === "running" || gateway?.status === "starting"}
              >
                {pendingAction === "start" ? "启动中…" : "启动网关"}
              </button>
              <button
                type="button"
                onClick={() => void runAction("restart")}
                disabled={pendingAction !== "" || gateway?.status === "starting" || gateway?.status === "stopping"}
              >
                {pendingAction === "restart" ? "重启中…" : "重启网关"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={() => void runAction("stop")}
                disabled={pendingAction !== "" || gateway?.status === "stopped" || gateway?.status === "stopping"}
              >
                {pendingAction === "stop" ? "停止中…" : "停止网关"}
              </button>
            </div>

            <div className="info-list compact">
              <div className="info-row">
                <span className="info-label">状态</span>
                <span className="info-value">{gateway ? statusText(gateway.status) : "-"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">PID</span>
                <span className="info-value">{gateway?.pid ?? "-"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">托管方式</span>
                <span className="info-value">{gateway?.managed ? "控制台托管" : "未托管"}</span>
              </div>
              <div className="info-row">
                <span className="info-label">线程数</span>
                <span className="info-value">{threads.length}</span>
              </div>
            </div>

            <div className="sidebar-list">
              {threads.length === 0 ? <div className="empty-state">当前没有带 threadId 的运行记录。</div> : null}
              {threads.map((thread) => (
                <button
                  key={thread.threadId}
                  type="button"
                  className={thread.threadId === selectedThreadId ? "sidebar-item active" : "sidebar-item"}
                  onClick={() => setSelectedThreadId(thread.threadId)}
                >
                  <span className="sidebar-item-main">{thread.threadId}</span>
                  <span className="sidebar-item-meta">{thread.runCount}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <section className="panel workspace-main">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">飞书网关</h2>
              <p className="panel-subtitle">启动、停止和运行态查看。</p>
            </div>
            <div className={statusClassName(gateway?.status || "stopped")}>{gateway ? statusText(gateway.status) : "加载中"}</div>
          </div>
          <div className="panel-body">
            {loading ? <div className="empty-state">正在加载网关状态…</div> : null}
            {error ? <div className="error-state">网关操作失败：{error}</div> : null}

            {gateway ? (
              <div className="workspace-main-stack">
                <section className="panel">
                  <div className="panel-body">
                    <div className="workspace-summary-grid">
                      <article className="sqlite-fact-card">
                        <div className="sqlite-fact-label">启动时间</div>
                        <div className="sqlite-fact-value">{gateway.startedAt ? formatChinaTimestamp(gateway.startedAt) : "-"}</div>
                        <div className="sqlite-fact-note">中国区时间</div>
                      </article>
                      <article className="sqlite-fact-card">
                        <div className="sqlite-fact-label">停止时间</div>
                        <div className="sqlite-fact-value">{gateway.stoppedAt ? formatChinaTimestamp(gateway.stoppedAt) : "-"}</div>
                        <div className="sqlite-fact-note">最近一次退出时间</div>
                      </article>
                    </div>

                    <div className="info-list compact">
                      <div className="info-row info-row-block">
                        <span className="info-label">启动命令</span>
                        <span className="info-value mono-text">{gateway.command}</span>
                      </div>
                      <div className="info-row info-row-block">
                        <span className="info-label">日志路径</span>
                        <span className="info-value mono-text">{gateway.logPath}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">退出码</span>
                        <span className="info-value">{gateway.lastExitCode ?? "-"}</span>
                      </div>
                      <div className="info-row">
                        <span className="info-label">退出信号</span>
                        <span className="info-value">{gateway.lastExitSignal ?? "-"}</span>
                      </div>
                    </div>
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">线程聚合</h3>
                      <p className="panel-subtitle">按 threadId 查看消息运行流。</p>
                    </div>
                    <div className="status-text">{selectedThread ? `${selectedThread.runCount} 条` : "未选择线程"}</div>
                  </div>
                  <div className="panel-body">
                    {!selectedThread ? <div className="empty-state">选择左侧 threadId 后查看聚合内容。</div> : null}
                    {selectedThread ? (
                      <>
                        <div className="info-list compact">
                          <div className="info-row info-row-block">
                            <span className="info-label">Thread ID</span>
                            <span className="info-value mono-text">{selectedThread.threadId}</span>
                          </div>
                          <div className="info-row info-row-block">
                            <span className="info-label">会话</span>
                            <span className="info-value mono-text">{selectedThread.conversationId}</span>
                          </div>
                          <div className="info-row info-row-block">
                            <span className="info-label">工作目录</span>
                            <span className="info-value mono-text">{selectedThread.workspace || "-"}</span>
                          </div>
                          <div className="info-row">
                            <span className="info-label">模式</span>
                            <span className="info-value">{selectedThread.mode || "-"}</span>
                          </div>
                        </div>

                        <div className="loglist">
                          {selectedThread.runs.map((run) => (
                            <article className="log-entry" key={run.runId}>
                              <div className="log-entry-head">
                                <span className={`level level-${run.status === "completed" ? "info" : run.status === "failed" ? "error" : "warn"}`}>
                                  {run.status}
                                </span>
                                <span className="timestamp">{formatChinaTimestamp(run.startedAt)}</span>
                              </div>
                              <div className="log-message">{run.prompt}</div>
                              {run.summary ? <pre>{run.summary}</pre> : null}
                              {run.error ? <pre>{run.error}</pre> : null}
                            </article>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-header">
                    <div>
                      <h3 className="panel-title">最近错误</h3>
                      <p className="panel-subtitle">子进程启动或运行错误。</p>
                    </div>
                  </div>
                  <div className="panel-body">
                    <div className="sql-preview no-margin">
                      <pre>{gateway.lastError || "当前没有记录到错误。"}</pre>
                    </div>
                  </div>
                </section>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </div>
  );
}
