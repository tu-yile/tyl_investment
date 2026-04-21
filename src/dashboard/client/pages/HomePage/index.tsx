import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useConsoleSummary, useInvestmentPositions } from "../../hooks";
import { formatBytes, formatChinaTimestamp } from "../../lib/format";
import type {
  ConsoleSummaryResponse,
  CreateInvestmentPositionPayload,
  InvestmentPosition,
  UpdateInvestmentPositionPayload,
} from "../../types";

type EditorMode = "edit" | "create";

interface PositionFormState {
  ticker: string;
  name: string;
  weight: string;
  costBasis: string;
  holdingDays: string;
  sector: string;
  industryId: string;
  thesisId: string;
  notes: string;
}

const EMPTY_FORM_STATE: PositionFormState = {
  ticker: "",
  name: "",
  weight: "",
  costBasis: "",
  holdingDays: "0",
  sector: "",
  industryId: "",
  thesisId: "",
  notes: "",
};

function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2)}%`;
}

function buildFormState(position: InvestmentPosition): PositionFormState {
  return {
    ticker: position.ticker,
    name: position.name,
    weight: String(position.weight),
    costBasis: String(position.costBasis),
    holdingDays: String(position.holdingDays),
    sector: position.sector,
    industryId: position.industryId,
    thesisId: position.thesisId,
    notes: position.notes,
  };
}

function validateBaseForm(state: PositionFormState): Omit<CreateInvestmentPositionPayload, "ticker"> | null {
  const weight = Number(state.weight);
  const costBasis = Number(state.costBasis);
  const holdingDays = Number(state.holdingDays);

  if (
    !state.name.trim() ||
    !state.sector.trim() ||
    !state.industryId.trim() ||
    !state.thesisId.trim() ||
    !Number.isFinite(weight) ||
    weight < 0 ||
    !Number.isFinite(costBasis) ||
    costBasis < 0 ||
    !Number.isInteger(holdingDays) ||
    holdingDays < 0
  ) {
    return null;
  }

  return {
    name: state.name.trim(),
    weight,
    costBasis,
    holdingDays,
    sector: state.sector.trim(),
    industryId: state.industryId.trim(),
    thesisId: state.thesisId.trim(),
    notes: state.notes.trim(),
  };
}

function toUpdatePayload(state: PositionFormState): UpdateInvestmentPositionPayload | null {
  return validateBaseForm(state);
}

function toCreatePayload(state: PositionFormState): CreateInvestmentPositionPayload | null {
  const base = validateBaseForm(state);
  const ticker = state.ticker.trim();
  if (!base || !/^\d{6}$/.test(ticker)) {
    return null;
  }
  return { ticker, ...base };
}

function SummaryMetrics({
  summary,
  positionCount,
  archivedCount,
}: {
  summary: ConsoleSummaryResponse;
  positionCount: number;
  archivedCount: number;
}) {
  const readyDbCount = summary.databases.filter((item) => item.exists).length;
  const totalTableCount = summary.databases.reduce((count, item) => count + item.tableCount, 0);
  const metrics = [
    {
      label: "日志文件",
      value: summary.log.exists ? "在线" : "缺失",
      note: summary.log.exists ? formatBytes(summary.log.sizeBytes) : summary.log.path,
    },
    {
      label: "数据库",
      value: `${readyDbCount}/${summary.databases.length}`,
      note: `${totalTableCount} 张表`,
    },
    {
      label: "当前持仓",
      value: String(positionCount),
      note: `${archivedCount} 只已归档`,
    },
    {
      label: "首页模式",
      value: "浏览优先",
      note: "编辑器按需展开",
    },
  ];

  return (
    <div className="metrics-grid">
      {metrics.map((metric) => (
        <article className="metric-card" key={metric.label}>
          <div className="metric-label">{metric.label}</div>
          <div className="metric-value">{metric.value}</div>
          <div className="metric-note">{metric.note}</div>
        </article>
      ))}
    </div>
  );
}

function PortfolioMetrics({
  positions,
  archivedPositions,
}: {
  positions: InvestmentPosition[];
  archivedPositions: InvestmentPosition[];
}) {
  const totalWeight = positions.reduce((sum, item) => sum + item.weight, 0);
  const averageHoldingDays = positions.length
    ? Math.round(positions.reduce((sum, item) => sum + item.holdingDays, 0) / positions.length)
    : 0;
  const topPosition = positions[0] ?? null;
  const sectors = new Set(positions.map((item) => item.sector)).size;
  const lastArchived = archivedPositions[0] ?? null;
  const metrics = [
    {
      label: "总权益仓位",
      value: formatPercent(totalWeight),
      note: `剩余现金 ${formatPercent(Math.max(0, 100 - totalWeight))}`,
    },
    {
      label: "持仓数量",
      value: String(positions.length),
      note: `${sectors} 个行业暴露`,
    },
    {
      label: "最大单仓",
      value: topPosition ? `${topPosition.name} ${formatPercent(topPosition.weight)}` : "-",
      note: topPosition ? topPosition.ticker : "暂无持仓",
    },
    {
      label: "平均持有天数",
      value: `${averageHoldingDays} 天`,
      note: "用于判断组合节奏",
    },
    {
      label: "最近归档",
      value: lastArchived ? lastArchived.name : "-",
      note: lastArchived?.archivedAt ? formatChinaTimestamp(lastArchived.archivedAt) : "暂无归档记录",
    },
  ];

  return (
    <div className="position-metrics-grid position-metrics-grid-wide">
      {metrics.map((metric) => (
        <article className="sqlite-fact-card" key={metric.label}>
          <div className="sqlite-fact-label">{metric.label}</div>
          <div className="sqlite-fact-value">{metric.value}</div>
          <div className="sqlite-fact-note">{metric.note}</div>
        </article>
      ))}
    </div>
  );
}

function DatabaseCards({ summary }: { summary: ConsoleSummaryResponse }) {
  return (
    <div className="database-card-grid">
      {summary.databases.map((database) => (
        <article className="database-card" key={database.id}>
          <div className="database-card-head">
            <div className="card-badge">{database.exists ? "ready" : "missing"}</div>
            <div className="database-card-meta">{database.tableCount} tables</div>
          </div>
          <h3>{database.name}</h3>
          <p>{database.description}</p>
          <p className="mono-text">{database.path}</p>
          <p className="muted-text">size: {formatBytes(database.sizeBytes)}</p>
        </article>
      ))}
    </div>
  );
}

export function HomePage() {
  const { summary, loading: summaryLoading, error: summaryError } = useConsoleSummary();
  const {
    positions,
    archivedPositions,
    loading: positionsLoading,
    error: positionsError,
    savingTicker,
    saveMessage,
    reload,
    savePosition,
    createPosition,
    clearSaveMessage,
  } = useInvestmentPositions();

  const [selectedTicker, setSelectedTicker] = useState("");
  const [editorMode, setEditorMode] = useState<EditorMode>("edit");
  const [editorOpen, setEditorOpen] = useState(false);
  const [formState, setFormState] = useState<PositionFormState>(EMPTY_FORM_STATE);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedTicker((current) => {
      if (positions.some((item) => item.ticker === current)) {
        return current;
      }
      return positions[0]?.ticker ?? "";
    });
  }, [positions]);

  const selectedPosition = useMemo(
    () => positions.find((item) => item.ticker === selectedTicker) ?? null,
    [positions, selectedTicker],
  );

  useEffect(() => {
    if (!editorOpen) {
      return;
    }

    if (editorMode === "create") {
      setFormState(EMPTY_FORM_STATE);
      setFormError(null);
      return;
    }

    if (!selectedPosition) {
      setFormState(EMPTY_FORM_STATE);
      return;
    }

    setFormState(buildFormState(selectedPosition));
    setFormError(null);
  }, [editorMode, editorOpen, selectedPosition]);

  function openCreateEditor(): void {
    clearSaveMessage();
    setEditorMode("create");
    setEditorOpen(true);
    setFormError(null);
  }

  function openEditEditor(): void {
    if (!selectedPosition) {
      return;
    }
    clearSaveMessage();
    setEditorMode("edit");
    setEditorOpen(true);
    setFormState(buildFormState(selectedPosition));
    setFormError(null);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (editorMode === "create") {
      const payload = toCreatePayload(formState);
      if (!payload) {
        setFormError("新增持仓时请填写 6 位股票代码，并检查名称、仓位、成本价和持有天数。");
        return;
      }

      setFormError(null);
      const created = await createPosition(payload);
      if (created) {
        setSelectedTicker(created.ticker);
        setEditorMode("edit");
        setEditorOpen(false);
      }
      return;
    }

    if (!selectedPosition) {
      return;
    }

    const payload = toUpdatePayload(formState);
    if (!payload) {
      setFormError("请检查名称、权重、成本价和持有天数，数值需为非负数。");
      return;
    }

    setFormError(null);
    await savePosition(selectedPosition.ticker, payload);
    setEditorOpen(false);
  }

  const editorTitle =
    editorMode === "create"
      ? "新增持仓"
      : selectedPosition
        ? `编辑 ${selectedPosition.name} (${selectedPosition.ticker})`
        : "持仓编辑";

  const editorSubtitle =
    editorMode === "create"
      ? "在需要时创建新的当前持仓。"
      : "仅在你主动展开时显示。仓位改成 0 后会自动归档。";

  const saveButtonLabel =
    editorMode === "create"
      ? savingTicker !== ""
        ? "新增中…"
        : "新增持仓"
      : savingTicker === selectedTicker
        ? "保存中…"
        : "保存更改";

  return (
    <div className="page-stack">
      <section className="page-header">
        <div>
          <div className="page-header-eyebrow">Control Center</div>
          <h2 className="page-header-title">控制台首页</h2>
          <p className="page-header-description">
            首页以快速浏览账户当前状态为主。持仓编辑被收纳到按需展开的操作区，避免长期占据主视图。
          </p>
        </div>
        <div className="page-header-aside">
          <button
            type="button"
            className="secondary-button"
            onClick={() => void reload()}
            disabled={positionsLoading || savingTicker !== ""}
          >
            {positionsLoading ? "刷新中…" : "刷新持仓"}
          </button>
        </div>
      </section>

      {summaryLoading ? <div className="empty-state">正在加载控制台概览…</div> : null}
      {summaryError ? <div className="error-state">控制台概览加载失败：{summaryError}</div> : null}
      {positionsError ? <div className="error-state">持仓数据加载失败：{positionsError}</div> : null}
      {saveMessage ? <div className="success-state">{saveMessage}</div> : null}

      {summary ? (
        <>
          <section className="home-grid">
            <section className="panel side-summary-panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">快速状态</h3>
                  <p className="panel-subtitle">控制台与持仓管理当前摘要。</p>
                </div>
              </div>
              <div className="panel-body">
                <div className="info-list">
                  <div className="info-row">
                    <span className="info-label">日志文件</span>
                    <span className="info-value">{summary.log.exists ? "在线" : "缺失"}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">日志大小</span>
                    <span className="info-value">{formatBytes(summary.log.sizeBytes)}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">数据库</span>
                    <span className="info-value">{summary.databases.length}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">当前持仓</span>
                    <span className="info-value">{positions.length} 只</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">已归档</span>
                    <span className="info-value">{archivedPositions.length} 只</span>
                  </div>
                </div>
              </div>
            </section>
            <section className="panel">
              <SummaryMetrics summary={summary} positionCount={positions.length} archivedCount={archivedPositions.length} />
            </section>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">持仓总览</h3>
                <p className="panel-subtitle">先看组合状态与所选标的摘要，只有在需要操作时才展开编辑器。</p>
              </div>
              <div className="status-text">{positionsLoading ? "加载中" : `${positions.length} 只当前持仓`}</div>
            </div>
            <div className="panel-body position-management-body">
              <PortfolioMetrics positions={positions} archivedPositions={archivedPositions} />

              <div className="position-overview-grid">
                <section className="position-roster">
                  <div className="position-roster-head">
                    <div>
                      <div className="sqlite-fact-label">Current Positions</div>
                      <div className="position-roster-title">当前持仓列表</div>
                    </div>
                    <div className="position-roster-actions">
                      <div className="card-badge">{positions.length}</div>
                      <button type="button" className="secondary-button compact-button" onClick={openCreateEditor} disabled={savingTicker !== ""}>
                        新增
                      </button>
                    </div>
                  </div>

                  {positions.length === 0 ? <div className="empty-state">当前没有可管理的持仓文件。</div> : null}

                  <div className="position-roster-list">
                    {positions.map((position) => (
                      <button
                        key={position.ticker}
                        type="button"
                        className={position.ticker === selectedTicker ? "position-list-card active" : "position-list-card"}
                        onClick={() => {
                          clearSaveMessage();
                          setSelectedTicker(position.ticker);
                        }}
                      >
                        <div className="position-list-card-head">
                          <div>
                            <div className="position-list-name">{position.name}</div>
                            <div className="position-list-ticker">{position.ticker}</div>
                          </div>
                          <div className="position-list-weight">{formatPercent(position.weight)}</div>
                        </div>
                        <div className="position-list-meta">
                          <span>{position.sector}</span>
                          <span>{position.holdingDays} 天</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>

                <aside className="position-sidebar-stack">
                  <section className="position-spotlight">
                    <div className="position-spotlight-head">
                      <div>
                        <div className="sqlite-fact-label">Selected Position</div>
                        <h3 className="position-spotlight-title">
                          {selectedPosition ? `${selectedPosition.name} (${selectedPosition.ticker})` : "未选择持仓"}
                        </h3>
                        <p className="panel-subtitle">
                          {selectedPosition ? "右侧只保留关键信息和操作入口。" : "从左侧选择一只持仓来查看摘要。"}
                        </p>
                      </div>
                      <div className="position-spotlight-actions">
                        <button
                          type="button"
                          className="secondary-button compact-button"
                          onClick={openEditEditor}
                          disabled={!selectedPosition || savingTicker !== ""}
                        >
                          编辑所选
                        </button>
                        <button type="button" className="secondary-button compact-button" onClick={openCreateEditor} disabled={savingTicker !== ""}>
                          新增持仓
                        </button>
                      </div>
                    </div>

                    {!selectedPosition ? (
                      <div className="empty-state">暂无选中持仓。</div>
                    ) : (
                      <>
                        <div className="position-spotlight-grid">
                          <article className="sqlite-fact-card">
                            <div className="sqlite-fact-label">当前仓位</div>
                            <div className="sqlite-fact-value">{formatPercent(selectedPosition.weight)}</div>
                            <div className="sqlite-fact-note">{selectedPosition.sector}</div>
                          </article>
                          <article className="sqlite-fact-card">
                            <div className="sqlite-fact-label">成本价</div>
                            <div className="sqlite-fact-value">{selectedPosition.costBasis}</div>
                            <div className="sqlite-fact-note">{selectedPosition.holdingDays} 天</div>
                          </article>
                        </div>
                        <div className="info-list compact">
                          <div className="info-row info-row-block">
                            <span className="info-label">Thesis ID</span>
                            <span className="info-value mono-text">{selectedPosition.thesisId}</span>
                          </div>
                          <div className="info-row info-row-block">
                            <span className="info-label">Industry ID</span>
                            <span className="info-value mono-text">{selectedPosition.industryId}</span>
                          </div>
                          <div className="info-row info-row-block">
                            <span className="info-label">最近更新</span>
                            <span className="info-value">{formatChinaTimestamp(selectedPosition.updatedAt)}</span>
                          </div>
                          <div className="info-row info-row-block">
                            <span className="info-label">备注</span>
                            <span className="info-value position-note-preview">{selectedPosition.notes || "暂无备注"}</span>
                          </div>
                        </div>
                      </>
                    )}
                  </section>

                  <section className="archive-section archive-section-surface">
                    <div className="archive-section-head">
                      <div>
                        <div className="sqlite-fact-label">Archived</div>
                        <div className="archive-section-title">最近归档</div>
                      </div>
                      <div className="card-badge">{archivedPositions.length}</div>
                    </div>
                    {archivedPositions.length === 0 ? <div className="empty-state">暂无归档记录。</div> : null}
                    <div className="archive-list">
                      {archivedPositions.slice(0, 5).map((position) => (
                        <article className="archive-card" key={position.positionId}>
                          <div className="position-list-card-head">
                            <div>
                              <div className="position-list-name">{position.name}</div>
                              <div className="position-list-ticker">{position.ticker}</div>
                            </div>
                            <div className="card-badge">archived</div>
                          </div>
                          <div className="position-list-meta">
                            <span>{position.sector}</span>
                            <span>{position.archivedAt ? formatChinaTimestamp(position.archivedAt) : "-"}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                </aside>
              </div>
            </div>
          </section>

          {editorOpen ? (
            <section className="panel">
              <div className="panel-header">
                <div>
                  <h3 className="panel-title">{editorTitle}</h3>
                  <p className="panel-subtitle">{editorSubtitle}</p>
                </div>
                <div className="page-header-aside">
                  <button
                    type="button"
                    className="secondary-button compact-button"
                    onClick={() => setEditorOpen(false)}
                    disabled={savingTicker !== ""}
                  >
                    收起编辑器
                  </button>
                </div>
              </div>
              <div className="panel-body">
                <div className="position-editor-summary position-editor-summary-compact">
                  <article className="sqlite-path-card">
                    <div className="sqlite-fact-label">{editorMode === "create" ? "数据写入" : "记录定位"}</div>
                    <div className="sqlite-path-value mono-text">
                      {editorMode === "create"
                        ? "investment.sqlite3 / positions"
                        : `${selectedPosition?.portfolioId ?? "-"} / #${selectedPosition?.positionId ?? "-"}`}
                    </div>
                  </article>
                  <article className="sqlite-path-card">
                    <div className="sqlite-fact-label">{editorMode === "create" ? "创建说明" : "数据来源"}</div>
                    <div className="sqlite-fact-value">
                      {editorMode === "create" ? "新增后自动进入当前持仓" : selectedPosition?.portfolioName ?? "主组合"}
                    </div>
                    <div className="sqlite-fact-note">
                      {editorMode === "create"
                        ? "会直接写入 SQLite 主数据表。"
                        : `数据源：${selectedPosition?.dataSource ?? "sqlite"}，仓位为 0 自动归档`}
                    </div>
                  </article>
                </div>

                <form className="position-form" onSubmit={(event) => void handleSubmit(event)}>
                  <div className="position-form-grid">
                    <label className="field-group">
                      <span className="field-label">股票代码</span>
                      <input
                        value={formState.ticker}
                        readOnly={editorMode === "edit"}
                        placeholder="例如 300750"
                        onChange={(event) => setFormState((current) => ({ ...current, ticker: event.target.value }))}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">股票名称</span>
                      <input
                        value={formState.name}
                        onChange={(event) => setFormState((current) => ({ ...current, name: event.target.value }))}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">仓位权重 (%)</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.weight}
                        onChange={(event) => setFormState((current) => ({ ...current, weight: event.target.value }))}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">成本价</span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={formState.costBasis}
                        onChange={(event) => setFormState((current) => ({ ...current, costBasis: event.target.value }))}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">持有天数</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={formState.holdingDays}
                        onChange={(event) => setFormState((current) => ({ ...current, holdingDays: event.target.value }))}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">所属行业</span>
                      <input
                        value={formState.sector}
                        onChange={(event) => setFormState((current) => ({ ...current, sector: event.target.value }))}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">Industry ID</span>
                      <input
                        value={formState.industryId}
                        onChange={(event) => setFormState((current) => ({ ...current, industryId: event.target.value }))}
                      />
                    </label>
                    <label className="field-group">
                      <span className="field-label">Thesis ID</span>
                      <input
                        value={formState.thesisId}
                        onChange={(event) => setFormState((current) => ({ ...current, thesisId: event.target.value }))}
                      />
                    </label>
                  </div>

                  <label className="field-group">
                    <span className="field-label">备注</span>
                    <textarea
                      rows={5}
                      value={formState.notes}
                      onChange={(event) => setFormState((current) => ({ ...current, notes: event.target.value }))}
                    />
                  </label>

                  {formError ? <div className="error-state">{formError}</div> : null}

                  <div className="position-form-hint">
                    {editorMode === "create"
                      ? "新增适合低频补录。"
                      : "如果只是查看当前状态，可以保持收起；只有需要更新时再展开。"}
                  </div>

                  <div className="position-form-actions">
                    <button type="submit" disabled={savingTicker !== ""}>
                      {saveButtonLabel}
                    </button>
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() => {
                        clearSaveMessage();
                        setFormError(null);
                        setFormState(editorMode === "create" ? EMPTY_FORM_STATE : selectedPosition ? buildFormState(selectedPosition) : EMPTY_FORM_STATE);
                      }}
                      disabled={savingTicker !== ""}
                    >
                      重置
                    </button>
                  </div>
                </form>
              </div>
            </section>
          ) : null}

          <section className="panel">
            <div className="panel-header">
              <div>
                <h3 className="panel-title">数据库</h3>
                <p className="panel-subtitle">当前可用数据库。</p>
              </div>
            </div>
            <div className="panel-body">
              <DatabaseCards summary={summary} />
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
