import { useEffect, useState } from "react";
import { fetchSqliteRows, fetchSqliteTables } from "../../api";
import { useConsoleSummary } from "../../hooks";
import { formatBytes } from "../../lib/format";
import type { SqliteRowsResponse, SqliteTableSummary } from "../../types";

export function SqlitePage() {
  const { summary, loading, error } = useConsoleSummary();
  const [selectedDatabaseId, setSelectedDatabaseId] = useState("");
  const [tables, setTables] = useState<SqliteTableSummary[]>([]);
  const [selectedTable, setSelectedTable] = useState("");
  const [limit, setLimit] = useState(50);
  const [preview, setPreview] = useState<SqliteRowsResponse["preview"] | null>(null);
  const [tablesLoading, setTablesLoading] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [tableError, setTableError] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  useEffect(() => {
    if (!summary || selectedDatabaseId) {
      return;
    }
    const defaultDatabase = summary.databases[0];
    if (defaultDatabase) {
      setSelectedDatabaseId(defaultDatabase.id);
    }
  }, [summary, selectedDatabaseId]);

  useEffect(() => {
    if (!selectedDatabaseId) {
      return;
    }

    let active = true;
    setTablesLoading(true);
    setTableError(null);
    setPreview(null);
    setPreviewError(null);

    fetchSqliteTables(selectedDatabaseId)
      .then((payload) => {
        if (!active) {
          return;
        }
        setTables(payload.tables);
        setSelectedTable((current) => (payload.tables.some((table) => table.name === current) ? current : payload.tables[0]?.name || ""));
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setTables([]);
        setSelectedTable("");
        setTableError(loadError instanceof Error ? loadError.message : "表列表加载失败");
      })
      .finally(() => {
        if (active) {
          setTablesLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDatabaseId]);

  useEffect(() => {
    if (!selectedDatabaseId || !selectedTable) {
      setPreview(null);
      return;
    }

    let active = true;
    setPreviewLoading(true);
    setPreviewError(null);

    fetchSqliteRows(selectedDatabaseId, selectedTable, limit)
      .then((payload) => {
        if (!active) {
          return;
        }
        setPreview(payload.preview);
      })
      .catch((loadError) => {
        if (!active) {
          return;
        }
        setPreview(null);
        setPreviewError(loadError instanceof Error ? loadError.message : "表预览加载失败");
      })
      .finally(() => {
        if (active) {
          setPreviewLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [selectedDatabaseId, selectedTable, limit]);

  const selectedTableSummary = tables.find((table) => table.name === selectedTable) || null;
  const selectedDatabaseSummary = summary?.databases.find((database) => database.id === selectedDatabaseId) || null;

  return (
    <div className="page-stack">
      <section className="workspace-grid sqlite-workspace">
        <aside className="panel workspace-sidebar">
          <div className="panel-header">
            <div>
              <h3 className="panel-title">导航</h3>
              <p className="panel-subtitle">数据库与表。</p>
            </div>
          </div>
          <div className="panel-body">
            <div className="control-stack">
              <select value={selectedDatabaseId} onChange={(event) => setSelectedDatabaseId(event.target.value)}>
                {summary?.databases.map((database) => (
                  <option key={database.id} value={database.id}>
                    {database.name}
                  </option>
                ))}
              </select>
              <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
                <option value={20}>20 行</option>
                <option value={50}>50 行</option>
                <option value={100}>100 行</option>
              </select>
            </div>

            {loading ? <div className="empty-state">正在加载数据库概览…</div> : null}
            {error ? <div className="error-state">数据库概览加载失败：{error}</div> : null}
            {tableError ? <div className="error-state">表列表加载失败：{tableError}</div> : null}

            <div className="sidebar-list">
              {tablesLoading ? <div className="empty-state">正在读取表列表…</div> : null}
              {!tablesLoading && tables.length === 0 ? <div className="empty-state">当前数据库没有可显示的表。</div> : null}
              {tables.map((table) => (
                <button
                  key={table.name}
                  type="button"
                  className={table.name === selectedTable ? "sidebar-item active" : "sidebar-item"}
                  onClick={() => setSelectedTable(table.name)}
                >
                  <span className="sidebar-item-main">{table.name}</span>
                  <span className="sidebar-item-meta">{table.rowCount === null ? "-" : table.rowCount}</span>
                </button>
              ))}
            </div>
          </div>
        </aside>

        <div className="workspace-main-stack">
          <section className="panel sqlite-overview-panel">
            <div className="panel-body sqlite-overview-body">
              <div className="sqlite-facts">
                <div className="sqlite-facts-grid">
                  <article className="sqlite-fact-card">
                    <div className="sqlite-fact-label">数据库</div>
                    <div className="sqlite-fact-value">{selectedDatabaseSummary?.name || "-"}</div>
                    <div className="sqlite-fact-note">
                      {selectedDatabaseSummary?.description || "选择一个数据库后查看详情。"}
                    </div>
                  </article>
                  <article className="sqlite-fact-card">
                    <div className="sqlite-fact-label">文件大小</div>
                    <div className="sqlite-fact-value">
                      {selectedDatabaseSummary ? formatBytes(selectedDatabaseSummary.sizeBytes) : "-"}
                    </div>
                    <div className="sqlite-fact-note">
                      {selectedDatabaseSummary ? `${selectedDatabaseSummary.tableCount} 张表` : "等待数据库选择"}
                    </div>
                  </article>
                  <article className="sqlite-fact-card">
                    <div className="sqlite-fact-label">当前表</div>
                    <div className="sqlite-fact-value">{selectedTableSummary?.name || "-"}</div>
                    <div className="sqlite-fact-note">
                      {selectedTableSummary ? `预览前 ${limit} 行` : "选择一张表后展示 schema"}
                    </div>
                  </article>
                  <article className="sqlite-fact-card">
                    <div className="sqlite-fact-label">行数</div>
                    <div className="sqlite-fact-value">
                      {selectedTableSummary?.rowCount === null || !selectedTableSummary ? "-" : selectedTableSummary.rowCount}
                    </div>
                    <div className="sqlite-fact-note">统计值来自当前表</div>
                  </article>
                </div>

                <article className="sqlite-path-card">
                  <div className="sqlite-fact-label">数据库路径</div>
                  <div className="sqlite-path-value mono-text">
                    {selectedDatabaseSummary?.path || "选择一个数据库后会在这里显示路径。"}
                  </div>
                </article>
              </div>

              <div className="sqlite-schema-card">
                <div className="sqlite-schema-head">
                  <div>
                    <div className="sql-preview-title">建表 SQL</div>
                  </div>
                  {selectedTableSummary ? <div className="card-badge">schema</div> : null}
                </div>
                <div className="sql-preview sqlite-schema-preview no-margin">
                  <pre>{selectedTableSummary?.sql || "选择表后会在这里显示建表 SQL。"}</pre>
                </div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <div>
                <h2 className="panel-title">数据预览</h2>
                <p className="panel-subtitle">当前表的样例数据。</p>
              </div>
              <div className="status-text">
                {selectedTableSummary ? `${selectedTableSummary.name} · 前 ${limit} 行` : `前 ${limit} 行`}
              </div>
            </div>
            <div className="panel-body">
              {previewLoading ? <div className="empty-state">正在加载表预览…</div> : null}
              {previewError ? <div className="error-state">表预览加载失败：{previewError}</div> : null}

              <div className="table-shell preview-shell no-margin">
                <table>
                  <thead>
                    <tr>
                      {(preview?.columns || []).map((column) => (
                        <th key={column}>{column}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {preview && preview.rows.length === 0 ? (
                      <tr>
                        <td colSpan={Math.max(preview.columns.length, 1)} className="muted-cell">
                          这张表当前没有数据行。
                        </td>
                      </tr>
                    ) : null}
                    {preview?.rows.map((row, rowIndex) => (
                      <tr key={`${preview.table}-${rowIndex}`}>
                        {preview.columns.map((column) => (
                          <td key={column}>
                            {row[column] === null || row[column] === undefined
                              ? ""
                              : typeof row[column] === "object"
                                ? JSON.stringify(row[column])
                                : String(row[column])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {!preview && !previewLoading && !previewError ? <div className="empty-state">选择一张表来查看样例数据。</div> : null}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}
