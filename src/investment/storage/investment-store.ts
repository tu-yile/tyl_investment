import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolveInvestmentRuntimePaths } from "../runtime/paths.js";
import type { ArtifactScopeType, ArtifactType } from "../agents/types.js";

function nowIso(): string {
  return new Date().toISOString();
}

function stringifyJson(value: unknown): string | null {
  if (value === undefined) {
    return null;
  }
  return JSON.stringify(value);
}

function parseJson<T>(value: string | null): T | null {
  if (!value) {
    return null;
  }
  return JSON.parse(value) as T;
}

function toWorkflowRunRow(row: Record<string, unknown>): WorkflowRunRow {
  return {
    workflowRunId: String(row.workflow_run_id),
    workflowId: String(row.workflow_id),
    portfolioId: row.portfolio_id === null ? null : String(row.portfolio_id),
    runDate: String(row.run_date),
    triggerType: String(row.trigger_type),
    status: String(row.status),
    startedAt: String(row.started_at),
    finishedAt: row.finished_at === null ? null : String(row.finished_at),
    errorMessage: row.error_message === null ? null : String(row.error_message),
    summaryJson: parseJson(row.summary_json as string | null),
  };
}

export interface InvestmentStoreOptions {
  dbPath: string;
  schemaPath?: string;
}

export interface PortfolioUpsert {
  portfolioId: string;
  name: string;
  strategyStyle: string;
  marketScope: string;
  holdingPeriod: string;
  status?: string;
}

export interface PortfolioRow {
  portfolioId: string;
  name: string;
  strategyStyle: string;
  marketScope: string;
  holdingPeriod: string;
  status: string;
  createdAt: string;
  updatedAt: string;
}

export interface PositionUpsert {
  portfolioId: string;
  ticker: string;
  name: string;
  industryId?: string | null;
  industryName?: string | null;
  status?: string;
  currentWeight: number;
  costBasis?: number | null;
  openedAt?: string | null;
  closedAt?: string | null;
  thesisId?: string | null;
  convictionBucket?: string | null;
  notesMd?: string | null;
}

export interface PositionRow {
  positionId: number;
  portfolioId: string;
  ticker: string;
  status: string;
  currentWeight: number;
  costBasis: number | null;
  openedAt: string | null;
  closedAt: string | null;
  thesisId: string | null;
  convictionBucket: string | null;
  notesMd: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRunCreate {
  workflowRunId?: string;
  workflowId: string;
  portfolioId?: string | null;
  runDate: string;
  triggerType: string;
  status?: string;
  summaryJson?: unknown;
}

export interface WorkflowRunRow {
  workflowRunId: string;
  workflowId: string;
  portfolioId: string | null;
  runDate: string;
  triggerType: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  errorMessage: string | null;
  summaryJson: unknown;
}

export interface AgentRunCreate {
  agentRunId?: string;
  workflowRunId: string;
  agentId: string;
  scopeType?: string | null;
  scopeKey?: string | null;
  status?: string;
  inputSummaryJson?: unknown;
}

export interface AgentArtifactCreate {
  artifactId?: string;
  agentRunId: string;
  workflowRunId: string;
  agentId: string;
  artifactType: ArtifactType;
  scopeType?: ArtifactScopeType | null;
  scopeKey?: string | null;
  reportPath: string;
  reportSha256?: string | null;
  signalsJson?: unknown;
  summaryJson?: unknown;
}

export interface AgentArtifactRow {
  artifactId: string;
  agentRunId: string;
  workflowRunId: string;
  agentId: string;
  artifactType: ArtifactType;
  scopeType: ArtifactScopeType | null;
  scopeKey: string | null;
  reportPath: string;
  reportSha256: string | null;
  signalsJson: unknown;
  summaryJson: unknown;
  createdAt: string;
}

export interface RuntimePositionRow {
  positionId: number;
  portfolioId: string;
  ticker: string;
  name: string;
  industryId: string | null;
  industryName: string | null;
  currentWeight: number;
  costBasis: number | null;
  openedAt: string | null;
  closedAt: string | null;
  thesisId: string | null;
  convictionBucket: string | null;
  notesMd: string | null;
}

export class InvestmentStore {
  db: DatabaseSync;

  schemaPath: string;

  constructor(options: InvestmentStoreOptions) {
    fs.mkdirSync(path.dirname(options.dbPath), { recursive: true });
    this.schemaPath = options.schemaPath ?? resolveInvestmentRuntimePaths(process.cwd()).schemaPath;
    this.db = new DatabaseSync(options.dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec("PRAGMA foreign_keys = ON;");
    this.initializeSchema();
  }

  close(): void {
    this.db.close();
  }

  // 所有批量落库都尽量走事务，避免一次 workflow 只写进去半套状态。
  transaction<T>(work: () => T): T {
    this.db.exec("BEGIN");
    try {
      const result = work();
      this.db.exec("COMMIT");
      return result;
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
  }

  initializeSchema(): void {
    const schemaSql = fs.readFileSync(this.schemaPath, "utf8");
    this.db.exec(schemaSql);
    this.addColumnIfMissing("positions", "name", "TEXT NOT NULL DEFAULT ''");
    this.addColumnIfMissing("positions", "industry_id", "TEXT");
    this.addColumnIfMissing("positions", "industry_name", "TEXT");
    this.backfillPositionMetadataFromLegacyTables();
    this.rebuildPositionsTableIfNeeded();
    this.pruneLegacySchema();
    this.db.exec(schemaSql);
  }

  private pruneLegacySchema(): void {
    this.db.exec("PRAGMA foreign_keys = OFF;");
    try {
      this.dropTableIfExists("instruments");
      this.dropTableIfExists("industries");
      this.dropTableIfExists("position_update_cards");
      this.dropTableIfExists("candidate_assessments");
      this.dropTableIfExists("candidate_pool_entries");
      this.dropTableIfExists("risk_gate_results");
      this.dropTableIfExists("observation_items");
      this.dropTableIfExists("theses");
      this.dropTableIfExists("position_daily_snapshots");
      this.dropTableIfExists("portfolio_snapshots");
      this.dropTableIfExists("thesis_versions");
      this.dropTableIfExists("industry_knowledge_versions");
      this.dropTableIfExists("market_context_snapshots");
      this.dropTableIfExists("operation_sheets");
      this.dropTableIfExists("operation_sheet_items");
      this.dropTableIfExists("approvals");
      this.dropTableIfExists("execution_results");
      this.dropTableIfHasColumn("approvals", "operation_sheet_id");
      this.dropTableIfHasColumn("execution_results", "operation_sheet_item_id");
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  private dropTableIfExists(tableName: string): void {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { name?: string } | undefined;
    if (row?.name) {
      this.db.exec(`DROP TABLE IF EXISTS ${tableName}`);
    }
  }

  private dropTableIfHasColumn(tableName: string, columnName: string): void {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { name?: string } | undefined;
    if (!row?.name) {
      return;
    }
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>;
    const hasColumn = columns.some((column) => String(column.name) === columnName);
    if (hasColumn) {
      this.db.exec(`DROP TABLE IF EXISTS ${tableName}`);
    }
  }

  private dropColumnIfExists(tableName: string, columnName: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>;
    const hasColumn = columns.some((column) => String(column.name) === columnName);
    if (hasColumn) {
      this.db.exec(`ALTER TABLE ${tableName} DROP COLUMN ${columnName}`);
    }
  }

  private addColumnIfMissing(tableName: string, columnName: string, columnDefinition: string): void {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { name?: string } | undefined;
    if (!row?.name) {
      return;
    }
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>;
    const hasColumn = columns.some((column) => String(column.name) === columnName);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
    }
  }

  private backfillPositionMetadataFromLegacyTables(): void {
    const hasPositions = this.tableExists("positions");
    const hasInstruments = this.tableExists("instruments");
    const hasIndustries = this.tableExists("industries");
    if (!hasPositions || !hasInstruments) {
      return;
    }

    if (hasIndustries) {
      this.db.exec(`
        UPDATE positions
        SET
          name = COALESCE(NULLIF(name, ''), (SELECT i.name FROM instruments i WHERE i.ticker = positions.ticker), ticker),
          industry_id = COALESCE(industry_id, (SELECT i.industry_id FROM instruments i WHERE i.ticker = positions.ticker)),
          industry_name = COALESCE(
            NULLIF(industry_name, ''),
            (
              SELECT ind.name
              FROM instruments i
              LEFT JOIN industries ind ON ind.industry_id = i.industry_id
              WHERE i.ticker = positions.ticker
            )
          )
      `);
      return;
    }

    this.db.exec(`
      UPDATE positions
      SET
        name = COALESCE(NULLIF(name, ''), (SELECT i.name FROM instruments i WHERE i.ticker = positions.ticker), ticker),
        industry_id = COALESCE(industry_id, (SELECT i.industry_id FROM instruments i WHERE i.ticker = positions.ticker))
    `);
  }

  private rebuildPositionsTableIfNeeded(): void {
    if (!this.tableExists("positions")) {
      return;
    }
    const foreignKeys = this.db.prepare("PRAGMA foreign_key_list(positions)").all() as Array<Record<string, unknown>>;
    const referencesLegacyInstruments = foreignKeys.some((foreignKey) => String(foreignKey.table) === "instruments");
    if (!referencesLegacyInstruments) {
      return;
    }

    this.db.exec("PRAGMA foreign_keys = OFF;");
    try {
      this.db.exec("ALTER TABLE positions RENAME TO positions_legacy");
      this.db.exec(`
        CREATE TABLE positions (
          position_id INTEGER PRIMARY KEY AUTOINCREMENT,
          portfolio_id TEXT NOT NULL,
          ticker TEXT NOT NULL,
          name TEXT NOT NULL DEFAULT '',
          industry_id TEXT,
          industry_name TEXT,
          status TEXT NOT NULL DEFAULT 'open',
          current_weight REAL NOT NULL,
          cost_basis REAL,
          opened_at TEXT,
          closed_at TEXT,
          thesis_id TEXT,
          conviction_bucket TEXT,
          notes_md TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id)
        )
      `);
      this.db.exec(`
        INSERT INTO positions (
          position_id,
          portfolio_id,
          ticker,
          name,
          industry_id,
          industry_name,
          status,
          current_weight,
          cost_basis,
          opened_at,
          closed_at,
          thesis_id,
          conviction_bucket,
          notes_md,
          created_at,
          updated_at
        )
        SELECT
          position_id,
          portfolio_id,
          ticker,
          COALESCE(NULLIF(name, ''), ticker),
          industry_id,
          industry_name,
          status,
          current_weight,
          cost_basis,
          opened_at,
          closed_at,
          thesis_id,
          conviction_bucket,
          notes_md,
          created_at,
          updated_at
        FROM positions_legacy
      `);
      this.db.exec("DROP TABLE positions_legacy");
    } finally {
      this.db.exec("PRAGMA foreign_keys = ON;");
    }
  }

  private tableExists(tableName: string): boolean {
    const row = this.db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?")
      .get(tableName) as { name?: string } | undefined;
    return Boolean(row?.name);
  }

  upsertPortfolio(record: PortfolioUpsert): void {
    const timestamp = nowIso();
    this.db
      .prepare(`
        INSERT INTO portfolios (
          portfolio_id, name, strategy_style, market_scope, holding_period, status, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(portfolio_id) DO UPDATE SET
          name = excluded.name,
          strategy_style = excluded.strategy_style,
          market_scope = excluded.market_scope,
          holding_period = excluded.holding_period,
          status = excluded.status,
          updated_at = excluded.updated_at
      `)
      .run(
        record.portfolioId,
        record.name,
        record.strategyStyle,
        record.marketScope,
        record.holdingPeriod,
        record.status ?? "active",
        timestamp,
        timestamp,
      );
  }

  getPortfolio(portfolioId: string): PortfolioRow | null {
    const row = this.db
      .prepare(`
        SELECT
          portfolio_id, name, strategy_style, market_scope, holding_period, status, created_at, updated_at
        FROM portfolios
        WHERE portfolio_id = ?
      `)
      .get(portfolioId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      portfolioId: String(row.portfolio_id),
      name: String(row.name),
      strategyStyle: String(row.strategy_style),
      marketScope: String(row.market_scope),
      holdingPeriod: String(row.holding_period),
      status: String(row.status),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  // positions 表按“当前有效持仓”建模，所以这里默认更新同组合同股票的 open 记录。
  upsertPosition(record: PositionUpsert): number {
    const timestamp = nowIso();
    const existing = this.db
      .prepare(`
        SELECT position_id
        FROM positions
        WHERE portfolio_id = ? AND ticker = ? AND status = 'open'
        ORDER BY position_id DESC
        LIMIT 1
      `)
      .get(record.portfolioId, record.ticker) as { position_id: number } | undefined;

    if (existing) {
      this.db
        .prepare(`
          UPDATE positions
          SET name = ?, industry_id = ?, industry_name = ?, status = ?, current_weight = ?, cost_basis = ?, opened_at = ?, closed_at = ?,
              thesis_id = ?, conviction_bucket = ?, notes_md = ?, updated_at = ?
          WHERE position_id = ?
        `)
        .run(
          record.name,
          record.industryId ?? null,
          record.industryName ?? null,
          record.status ?? "open",
          record.currentWeight,
          record.costBasis ?? null,
          record.openedAt ?? null,
          record.closedAt ?? null,
          record.thesisId ?? null,
          record.convictionBucket ?? null,
          record.notesMd ?? null,
          timestamp,
          existing.position_id,
        );
      return existing.position_id;
    }

    const result = this.db
      .prepare(`
        INSERT INTO positions (
          portfolio_id, ticker, name, industry_id, industry_name, status, current_weight, cost_basis, opened_at, closed_at,
          thesis_id, conviction_bucket, notes_md, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.portfolioId,
        record.ticker,
        record.name,
        record.industryId ?? null,
        record.industryName ?? null,
        record.status ?? "open",
        record.currentWeight,
        record.costBasis ?? null,
        record.openedAt ?? null,
        record.closedAt ?? null,
        record.thesisId ?? null,
        record.convictionBucket ?? null,
        record.notesMd ?? null,
        timestamp,
        timestamp,
      );
    return Number(result.lastInsertRowid);
  }

  closePosition(positionId: number, closedAt = nowIso()): void {
    this.db
      .prepare(`
        UPDATE positions
        SET status = 'closed', current_weight = 0, closed_at = ?, updated_at = ?
        WHERE position_id = ?
      `)
      .run(closedAt, nowIso(), positionId);
  }

  listOpenPositions(portfolioId: string): PositionRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          position_id, portfolio_id, ticker, status, current_weight, cost_basis,
          opened_at, closed_at, thesis_id, conviction_bucket, notes_md, created_at, updated_at
        FROM positions
        WHERE portfolio_id = ? AND status = 'open'
        ORDER BY current_weight DESC, position_id ASC
      `)
      .all(portfolioId) as Array<Record<string, unknown>>;
    return rows.map((row) => this.mapPositionRow(row));
  }

  listRuntimePositions(portfolioId: string): RuntimePositionRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          p.position_id,
          p.portfolio_id,
          p.ticker,
          p.name,
          COALESCE(p.current_weight, 0) AS current_weight,
          p.cost_basis,
          p.opened_at,
          p.closed_at,
          p.thesis_id,
          p.conviction_bucket,
          p.notes_md,
          COALESCE(p.closed_at, NULL) AS _closed_at,
          p.industry_id AS industry_id,
          p.industry_name AS industry_name
        FROM positions p
        WHERE p.portfolio_id = ? AND p.status = 'open'
        ORDER BY p.current_weight DESC, p.position_id ASC
      `)
      .all(portfolioId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      positionId: Number(row.position_id),
      portfolioId: String(row.portfolio_id),
      ticker: String(row.ticker),
      name: String(row.name),
      industryId: row.industry_id === null ? null : String(row.industry_id),
      industryName: row.industry_name === null ? null : String(row.industry_name),
      currentWeight: Number(row.current_weight),
      costBasis: row.cost_basis === null ? null : Number(row.cost_basis),
      openedAt: row.opened_at === null ? null : String(row.opened_at),
      closedAt: row.closed_at === null ? null : String(row.closed_at),
      thesisId: row.thesis_id === null ? null : String(row.thesis_id),
      convictionBucket: row.conviction_bucket === null ? null : String(row.conviction_bucket),
      notesMd: row.notes_md === null ? null : String(row.notes_md),
    }));
  }

  createWorkflowRun(record: WorkflowRunCreate): string {
    const workflowRunId = record.workflowRunId ?? randomUUID();
    this.db
      .prepare(`
        INSERT INTO workflow_runs (
          workflow_run_id, workflow_id, portfolio_id, run_date, trigger_type,
          status, started_at, summary_json
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        workflowRunId,
        record.workflowId,
        record.portfolioId ?? null,
        record.runDate,
        record.triggerType,
        record.status ?? "running",
        nowIso(),
        stringifyJson(record.summaryJson),
      );
    return workflowRunId;
  }

  updateWorkflowRunStatus(
    workflowRunId: string,
    status: string,
    summaryJson?: unknown,
  ): void {
    // 非终态更新不要写 finished_at，
    // 这样 awaiting_approval 等中间状态仍能明确表示“这个 run 还活着”。
    this.db
      .prepare(`
        UPDATE workflow_runs
        SET status = ?, summary_json = ?, error_message = NULL, finished_at = NULL
        WHERE workflow_run_id = ?
      `)
      .run(
        status,
        stringifyJson(summaryJson),
        workflowRunId,
      );
  }

  finishWorkflowRun(args: {
    workflowRunId: string;
    status: string;
    errorMessage?: string | null;
    summaryJson?: unknown;
  }): void {
    this.db
      .prepare(`
        UPDATE workflow_runs
        SET status = ?, finished_at = ?, error_message = ?, summary_json = ?
        WHERE workflow_run_id = ?
      `)
      .run(
        args.status,
        nowIso(),
        args.errorMessage ?? null,
        stringifyJson(args.summaryJson),
        args.workflowRunId,
      );
  }

  getWorkflowRun(workflowRunId: string): WorkflowRunRow | null {
    const row = this.db
      .prepare(`
        SELECT
          workflow_run_id, workflow_id, portfolio_id, run_date, trigger_type, status,
          started_at, finished_at, error_message, summary_json
        FROM workflow_runs
        WHERE workflow_run_id = ?
      `)
      .get(workflowRunId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return toWorkflowRunRow(row);
  }

  findWorkflowRunByThread(args: {
    workflowId: string;
    threadId: string;
    runDate?: string;
  }): WorkflowRunRow | null {
    // 这轮暂不改 schema，把 threadId 继续放在 summary_json 里。
    // 查询时先按 workflow/runDate 收敛候选，再解析 JSON 匹配 threadId。
    const clauses = ["workflow_id = ?"];
    const params: string[] = [args.workflowId];
    if (args.runDate) {
      clauses.push("run_date = ?");
      params.push(args.runDate);
    }

    const rows = this.db
      .prepare(`
        SELECT
          workflow_run_id, workflow_id, portfolio_id, run_date, trigger_type, status,
          started_at, finished_at, error_message, summary_json
        FROM workflow_runs
        WHERE ${clauses.join(" AND ")}
        ORDER BY started_at DESC
        LIMIT 50
      `)
      .all(...params) as Record<string, unknown>[];

    for (const row of rows) {
      const parsed = toWorkflowRunRow(row);
      const summary = (parsed.summaryJson ?? {}) as { threadId?: unknown };
      if (summary.threadId === args.threadId) {
        return parsed;
      }
    }
    return null;
  }

  createAgentRun(record: AgentRunCreate): string {
    const agentRunId = record.agentRunId ?? randomUUID();
    this.db
      .prepare(`
        INSERT INTO agent_runs (
          agent_run_id, workflow_run_id, agent_id, scope_type, scope_key,
          status, input_summary_json, started_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        agentRunId,
        record.workflowRunId,
        record.agentId,
        record.scopeType ?? null,
        record.scopeKey ?? null,
        record.status ?? "running",
        stringifyJson(record.inputSummaryJson),
        nowIso(),
      );
    return agentRunId;
  }

  finishAgentRun(args: {
    agentRunId: string;
    status: string;
    outputSummaryJson?: unknown;
    errorMessage?: string | null;
  }): void {
    this.db
      .prepare(`
        UPDATE agent_runs
        SET status = ?, output_summary_json = ?, error_message = ?, finished_at = ?
        WHERE agent_run_id = ?
      `)
      .run(
        args.status,
        stringifyJson(args.outputSummaryJson),
        args.errorMessage ?? null,
        nowIso(),
        args.agentRunId,
      );
  }

  createAgentArtifact(record: AgentArtifactCreate): AgentArtifactRow {
    const artifactId = record.artifactId ?? randomUUID();
    const createdAt = nowIso();
    this.db
      .prepare(`
        INSERT INTO agent_artifacts (
          artifact_id, agent_run_id, workflow_run_id, agent_id, artifact_type,
          scope_type, scope_key, report_path, report_sha256, signals_json, summary_json, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        artifactId,
        record.agentRunId,
        record.workflowRunId,
        record.agentId,
        record.artifactType,
        record.scopeType ?? null,
        record.scopeKey ?? null,
        record.reportPath,
        record.reportSha256 ?? null,
        stringifyJson(record.signalsJson),
        stringifyJson(record.summaryJson),
        createdAt,
      );
    return {
      artifactId,
      agentRunId: record.agentRunId,
      workflowRunId: record.workflowRunId,
      agentId: record.agentId,
      artifactType: record.artifactType,
      scopeType: record.scopeType ?? null,
      scopeKey: record.scopeKey ?? null,
      reportPath: record.reportPath,
      reportSha256: record.reportSha256 ?? null,
      signalsJson: record.signalsJson,
      summaryJson: record.summaryJson,
      createdAt,
    };
  }

  listAgentArtifactsByWorkflowRun(workflowRunId: string): AgentArtifactRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          artifact_id, agent_run_id, workflow_run_id, agent_id, artifact_type,
          scope_type, scope_key, report_path, report_sha256, signals_json, summary_json, created_at
        FROM agent_artifacts
        WHERE workflow_run_id = ?
        ORDER BY created_at ASC, artifact_id ASC
      `)
      .all(workflowRunId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      artifactId: String(row.artifact_id),
      agentRunId: String(row.agent_run_id),
      workflowRunId: String(row.workflow_run_id),
      agentId: String(row.agent_id),
      artifactType: String(row.artifact_type) as ArtifactType,
      scopeType: row.scope_type === null ? null : (String(row.scope_type) as ArtifactScopeType),
      scopeKey: row.scope_key === null ? null : String(row.scope_key),
      reportPath: String(row.report_path),
      reportSha256: row.report_sha256 === null ? null : String(row.report_sha256),
      signalsJson: parseJson(row.signals_json as string | null),
      summaryJson: parseJson(row.summary_json as string | null),
      createdAt: String(row.created_at),
    }));
  }

  private mapPositionRow(row: Record<string, unknown>): PositionRow {
    return {
      positionId: Number(row.position_id),
      portfolioId: String(row.portfolio_id),
      ticker: String(row.ticker),
      status: String(row.status),
      currentWeight: Number(row.current_weight),
      costBasis: row.cost_basis === null ? null : Number(row.cost_basis),
      openedAt: row.opened_at === null ? null : String(row.opened_at),
      closedAt: row.closed_at === null ? null : String(row.closed_at),
      thesisId: row.thesis_id === null ? null : String(row.thesis_id),
      convictionBucket: row.conviction_bucket === null ? null : String(row.conviction_bucket),
      notesMd: row.notes_md === null ? null : String(row.notes_md),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }
}
