import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { resolveInvestmentRuntimePaths } from "../runtime/paths.js";
import type {
  CandidateAssessment,
  PositionUpdateCard,
  RiskGateResult,
} from "../types.js";

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

export interface InstrumentUpsert {
  ticker: string;
  name: string;
  market?: string;
  assetType?: string;
  industryId?: string | null;
  isActive?: boolean;
}

export interface InstrumentRow {
  ticker: string;
  name: string;
  market: string;
  assetType: string;
  industryId: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IndustryUpsert {
  industryId: string;
  name: string;
  knowledgeMdPath?: string | null;
  isActive?: boolean;
}

export interface IndustryKnowledgeVersionInsert {
  industryId: string;
  versionNo: number;
  currentView?: string | null;
  recentChange?: string | null;
  keySignals?: string[];
  watchpoints?: string[];
  summaryMd?: string | null;
  sourceMdPath?: string | null;
  editor?: string | null;
}

export interface IndustryKnowledgeVersionRow {
  industryKnowledgeVersionId: number;
  industryId: string;
  versionNo: number;
  currentView: string | null;
  recentChange: string | null;
  keySignals: string[];
  watchpoints: string[];
  summaryMd: string | null;
  sourceMdPath: string | null;
  editor: string | null;
  createdAt: string;
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

export interface PositionSnapshotInsert {
  portfolioId: string;
  tradeDate: string;
  ticker: string;
  weight: number;
  costBasis?: number | null;
  holdingDays?: number | null;
  thesisId?: string | null;
  thesisStatus?: string | null;
  sectorName?: string | null;
  industryId?: string | null;
  sourceRunId?: string | null;
}

export interface CandidatePoolEntryUpsert {
  portfolioId: string;
  ticker: string;
  status: string;
  targetEntryWeight?: number | null;
  sourceFlow?: string | null;
  thesisId?: string | null;
  rankingScore?: number | null;
  insertedAt?: string;
  removedAt?: string | null;
  lastReviewedAt?: string | null;
  notesMd?: string | null;
}

export interface CandidatePoolEntryRow {
  candidateId: number;
  portfolioId: string;
  ticker: string;
  status: string;
  targetEntryWeight: number | null;
  sourceFlow: string | null;
  thesisId: string | null;
  rankingScore: number | null;
  insertedAt: string;
  removedAt: string | null;
  lastReviewedAt: string | null;
  notesMd: string | null;
}

export interface ThesisUpsert {
  thesisId: string;
  ticker: string;
  industryId?: string | null;
  status: string;
  catalystStrength?: string | null;
  valuationView?: string | null;
  riskLevel?: string | null;
  confidenceBase?: number | null;
  monitoringFlags?: string[];
  lastUpdated: string;
  sourceMdPath?: string | null;
  currentVersionNo?: number;
}

export interface ThesisRow {
  thesisId: string;
  ticker: string;
  industryId: string | null;
  status: string;
  catalystStrength: string | null;
  valuationView: string | null;
  riskLevel: string | null;
  confidenceBase: number | null;
  monitoringFlags: string[];
  lastUpdated: string;
  sourceMdPath: string | null;
  currentVersionNo: number;
  createdAt: string;
  updatedAt: string;
}

export interface ThesisVersionInsert {
  thesisId: string;
  versionNo: number;
  changeReason?: string | null;
  editor?: string | null;
  coreClaimMd?: string | null;
  keyDriversMd?: string | null;
  invalidationConditionsMd?: string | null;
  verifiedPointsMd?: string | null;
  falsifiedPointsMd?: string | null;
}

export interface ThesisVersionRow {
  thesisVersionId: number;
  thesisId: string;
  versionNo: number;
  changeReason: string | null;
  editor: string | null;
  coreClaimMd: string | null;
  keyDriversMd: string | null;
  invalidationConditionsMd: string | null;
  verifiedPointsMd: string | null;
  falsifiedPointsMd: string | null;
  createdAt: string;
}

export interface MarketContextSnapshotUpsert {
  asOfDate: string;
  marketTone: string;
  policyBias?: string | null;
  liquidityView?: string | null;
  headlineRisk?: string | null;
  priorityWatchpoints?: string[];
  notesMd?: string | null;
}

export interface MarketContextSnapshotRow {
  marketContextId: number;
  asOfDate: string;
  marketTone: string;
  policyBias: string | null;
  liquidityView: string | null;
  headlineRisk: string | null;
  priorityWatchpoints: string[];
  notesMd: string | null;
  createdAt: string;
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

export interface OperationSheetItemInsert {
  itemBucket: string;
  ticker?: string | null;
  action?: string | null;
  weightChange?: number | null;
  confidence?: number | null;
  reason?: string | null;
  cancelCondition?: string | null;
  sortOrder?: number;
}

export interface OperationSheetCreate {
  workflowRunId: string;
  runDate: string;
  portfolioId?: string | null;
  status: string;
  marketAttitude?: string | null;
  riskGateDecision?: string | null;
  bodyMd?: string | null;
  markdownPath?: string | null;
  jsonPath?: string | null;
  reviewer?: string | null;
  reviewedAt?: string | null;
  items: OperationSheetItemInsert[];
}

export interface OperationSheetRow {
  operationSheetId: number;
  workflowRunId: string;
  runDate: string;
  portfolioId: string | null;
  status: string;
  marketAttitude: string | null;
  riskGateDecision: string | null;
  bodyMd: string | null;
  markdownPath: string | null;
  jsonPath: string | null;
  createdAt: string;
  reviewedAt: string | null;
  reviewer: string | null;
}

export interface OperationSheetItemRow {
  operationSheetItemId: number;
  operationSheetId: number;
  itemBucket: string;
  ticker: string | null;
  action: string | null;
  weightChange: number | null;
  confidence: number | null;
  reason: string | null;
  cancelCondition: string | null;
  sortOrder: number;
  createdAt: string;
}

export interface ApprovalCreate {
  operationSheetId: number;
  decision: string;
  reviewer: string;
  notesMd?: string | null;
}

export interface ApprovalRow {
  approvalId: number;
  operationSheetId: number;
  decision: string;
  reviewer: string;
  notesMd: string | null;
  createdAt: string;
}

export interface ExecutionResultCreate {
  operationSheetItemId: number;
  executionDecision: string;
  approvedWeightChange?: number | null;
  executedWeightChange?: number | null;
  executor?: string | null;
  executedAt?: string | null;
  notesMd?: string | null;
}

export interface ObservationItemCreate {
  entityType: string;
  entityId?: string | null;
  category?: string | null;
  contentMd: string;
  status?: string;
  priority?: string | null;
  sourceWorkflowRunId?: string | null;
  dueDate?: string | null;
}

export interface ObservationItemRow {
  observationItemId: number;
  entityType: string;
  entityId: string | null;
  category: string | null;
  contentMd: string;
  status: string;
  priority: string | null;
  sourceWorkflowRunId: string | null;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
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

export interface RuntimeCandidateRow {
  candidateId: number;
  portfolioId: string;
  ticker: string;
  name: string;
  industryId: string | null;
  industryName: string | null;
  status: string;
  targetEntryWeight: number | null;
  sourceFlow: string | null;
  thesisId: string | null;
  rankingScore: number | null;
  insertedAt: string;
  lastReviewedAt: string | null;
  notesMd: string | null;
}

export interface RuntimeThesisRow {
  thesisId: string;
  ticker: string;
  companyName: string;
  industryId: string | null;
  status: string;
  catalystStrength: string | null;
  valuationView: string | null;
  riskLevel: string | null;
  confidenceBase: number | null;
  monitoringFlags: string[];
  lastUpdated: string;
  sourceMdPath: string | null;
  currentVersionNo: number;
}

export interface RuntimeIndustryRow {
  industryId: string;
  name: string;
  currentView: string | null;
  recentChange: string | null;
  keySignals: string[];
  watchpoints: string[];
  knowledgeMdPath: string | null;
}

export interface PortfolioSnapshotUpsert {
  portfolioId: string;
  snapshotDate: string;
  totalEquityWeight?: number | null;
  cashWeight?: number | null;
  sectorExposureJson?: unknown;
  styleExposureJson?: unknown;
  riskBudgetJson?: unknown;
  notesMd?: string | null;
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
    this.ensureSchemaCompatibility();
  }

  private ensureSchemaCompatibility(): void {
    this.ensureColumn("theses", "monitoring_flags_json", "TEXT");
    this.ensureColumn("industry_knowledge_versions", "key_signals_json", "TEXT");
    this.ensureColumn("industry_knowledge_versions", "watchpoints_json", "TEXT");
    this.ensureColumn("operation_sheets", "body_md", "TEXT");
  }

  private ensureColumn(tableName: string, columnName: string, definition: string): void {
    const columns = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<Record<string, unknown>>;
    const hasColumn = columns.some((column) => String(column.name) === columnName);
    if (!hasColumn) {
      this.db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
  }

  upsertInstrument(record: InstrumentUpsert): void {
    const timestamp = nowIso();
    this.db
      .prepare(`
        INSERT INTO instruments (
          ticker, name, market, asset_type, industry_id, is_active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ticker) DO UPDATE SET
          name = excluded.name,
          market = excluded.market,
          asset_type = excluded.asset_type,
          industry_id = excluded.industry_id,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `)
      .run(
        record.ticker,
        record.name,
        record.market ?? "CN-A",
        record.assetType ?? "equity",
        record.industryId ?? null,
        record.isActive === false ? 0 : 1,
        timestamp,
        timestamp,
      );
  }

  getInstrument(ticker: string): InstrumentRow | null {
    const row = this.db
      .prepare(`
        SELECT
          ticker, name, market, asset_type, industry_id, is_active, created_at, updated_at
        FROM instruments
        WHERE ticker = ?
      `)
      .get(ticker) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      ticker: String(row.ticker),
      name: String(row.name),
      market: String(row.market),
      assetType: String(row.asset_type),
      industryId: row.industry_id === null ? null : String(row.industry_id),
      isActive: Number(row.is_active) === 1,
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  upsertIndustry(record: IndustryUpsert): void {
    const timestamp = nowIso();
    this.db
      .prepare(`
        INSERT INTO industries (
          industry_id, name, knowledge_md_path, is_active, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(industry_id) DO UPDATE SET
          name = excluded.name,
          knowledge_md_path = excluded.knowledge_md_path,
          is_active = excluded.is_active,
          updated_at = excluded.updated_at
      `)
      .run(
        record.industryId,
        record.name,
        record.knowledgeMdPath ?? null,
        record.isActive === false ? 0 : 1,
        timestamp,
        timestamp,
      );
  }

  insertIndustryKnowledgeVersion(record: IndustryKnowledgeVersionInsert): number {
    const result = this.db
      .prepare(`
        INSERT INTO industry_knowledge_versions (
          industry_id, version_no, current_view, recent_change, key_signals_json,
          watchpoints_json, summary_md, source_md_path, editor, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.industryId,
        record.versionNo,
        record.currentView ?? null,
        record.recentChange ?? null,
        stringifyJson(record.keySignals ?? []),
        stringifyJson(record.watchpoints ?? []),
        record.summaryMd ?? null,
        record.sourceMdPath ?? null,
        record.editor ?? null,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
  }

  getLatestIndustryKnowledgeVersion(industryId: string): IndustryKnowledgeVersionRow | null {
    const row = this.db
      .prepare(`
        SELECT
          industry_knowledge_version_id, industry_id, version_no, current_view, recent_change,
          key_signals_json, watchpoints_json, summary_md, source_md_path, editor, created_at
        FROM industry_knowledge_versions
        WHERE industry_id = ?
        ORDER BY version_no DESC, industry_knowledge_version_id DESC
        LIMIT 1
      `)
      .get(industryId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      industryKnowledgeVersionId: Number(row.industry_knowledge_version_id),
      industryId: String(row.industry_id),
      versionNo: Number(row.version_no),
      currentView: row.current_view === null ? null : String(row.current_view),
      recentChange: row.recent_change === null ? null : String(row.recent_change),
      keySignals: parseJson<string[]>(row.key_signals_json as string | null) ?? [],
      watchpoints: parseJson<string[]>(row.watchpoints_json as string | null) ?? [],
      summaryMd: row.summary_md === null ? null : String(row.summary_md),
      sourceMdPath: row.source_md_path === null ? null : String(row.source_md_path),
      editor: row.editor === null ? null : String(row.editor),
      createdAt: String(row.created_at),
    };
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
          SET status = ?, current_weight = ?, cost_basis = ?, opened_at = ?, closed_at = ?,
              thesis_id = ?, conviction_bucket = ?, notes_md = ?, updated_at = ?
          WHERE position_id = ?
        `)
        .run(
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
          portfolio_id, ticker, status, current_weight, cost_basis, opened_at, closed_at,
          thesis_id, conviction_bucket, notes_md, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.portfolioId,
        record.ticker,
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
          i.name,
          COALESCE(p.current_weight, 0) AS current_weight,
          p.cost_basis,
          p.opened_at,
          p.closed_at,
          p.thesis_id,
          p.conviction_bucket,
          p.notes_md,
          COALESCE(p.closed_at, NULL) AS _closed_at,
          COALESCE(t.industry_id, i.industry_id) AS industry_id,
          ind.name AS industry_name
        FROM positions p
        JOIN instruments i ON i.ticker = p.ticker
        LEFT JOIN theses t ON t.thesis_id = p.thesis_id
        LEFT JOIN industries ind ON ind.industry_id = COALESCE(t.industry_id, i.industry_id)
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

  replacePositionDailySnapshots(
    portfolioId: string,
    tradeDate: string,
    snapshots: PositionSnapshotInsert[],
  ): void {
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM position_daily_snapshots WHERE portfolio_id = ? AND trade_date = ?")
        .run(portfolioId, tradeDate);

      const stmt = this.db.prepare(`
        INSERT INTO position_daily_snapshots (
          portfolio_id, trade_date, ticker, weight, cost_basis, holding_days, thesis_id,
          thesis_status, sector_name, industry_id, source_run_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const snapshot of snapshots) {
        stmt.run(
          snapshot.portfolioId,
          snapshot.tradeDate,
          snapshot.ticker,
          snapshot.weight,
          snapshot.costBasis ?? null,
          snapshot.holdingDays ?? null,
          snapshot.thesisId ?? null,
          snapshot.thesisStatus ?? null,
          snapshot.sectorName ?? null,
          snapshot.industryId ?? null,
          snapshot.sourceRunId ?? null,
          nowIso(),
        );
      }
    });
  }

  // 候选池只维护每只股票一条“当前活跃记录”，状态变化走 update，而不是反复插入重复 active。
  upsertCandidatePoolEntry(record: CandidatePoolEntryUpsert): number {
    const existing = this.db
      .prepare(`
        SELECT candidate_id
        FROM candidate_pool_entries
        WHERE portfolio_id = ? AND ticker = ? AND removed_at IS NULL
        ORDER BY candidate_id DESC
        LIMIT 1
      `)
      .get(record.portfolioId, record.ticker) as { candidate_id: number } | undefined;

    if (existing) {
      this.db
        .prepare(`
          UPDATE candidate_pool_entries
          SET status = ?, target_entry_weight = ?, source_flow = ?, thesis_id = ?,
              ranking_score = ?, removed_at = ?, last_reviewed_at = ?, notes_md = ?
          WHERE candidate_id = ?
        `)
        .run(
          record.status,
          record.targetEntryWeight ?? null,
          record.sourceFlow ?? null,
          record.thesisId ?? null,
          record.rankingScore ?? null,
          record.removedAt ?? null,
          record.lastReviewedAt ?? null,
          record.notesMd ?? null,
          existing.candidate_id,
        );
      return existing.candidate_id;
    }

    const result = this.db
      .prepare(`
        INSERT INTO candidate_pool_entries (
          portfolio_id, ticker, status, target_entry_weight, source_flow, thesis_id,
          ranking_score, inserted_at, removed_at, last_reviewed_at, notes_md
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.portfolioId,
        record.ticker,
        record.status,
        record.targetEntryWeight ?? null,
        record.sourceFlow ?? null,
        record.thesisId ?? null,
        record.rankingScore ?? null,
        record.insertedAt ?? nowIso(),
        record.removedAt ?? null,
        record.lastReviewedAt ?? null,
        record.notesMd ?? null,
      );
    return Number(result.lastInsertRowid);
  }

  listActiveCandidatePoolEntries(portfolioId: string): CandidatePoolEntryRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          candidate_id, portfolio_id, ticker, status, target_entry_weight, source_flow,
          thesis_id, ranking_score, inserted_at, removed_at, last_reviewed_at, notes_md
        FROM candidate_pool_entries
        WHERE portfolio_id = ? AND removed_at IS NULL AND status != 'removed'
        ORDER BY COALESCE(ranking_score, 0) DESC, candidate_id ASC
      `)
      .all(portfolioId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      candidateId: Number(row.candidate_id),
      portfolioId: String(row.portfolio_id),
      ticker: String(row.ticker),
      status: String(row.status),
      targetEntryWeight: row.target_entry_weight === null ? null : Number(row.target_entry_weight),
      sourceFlow: row.source_flow === null ? null : String(row.source_flow),
      thesisId: row.thesis_id === null ? null : String(row.thesis_id),
      rankingScore: row.ranking_score === null ? null : Number(row.ranking_score),
      insertedAt: String(row.inserted_at),
      removedAt: row.removed_at === null ? null : String(row.removed_at),
      lastReviewedAt: row.last_reviewed_at === null ? null : String(row.last_reviewed_at),
      notesMd: row.notes_md === null ? null : String(row.notes_md),
    }));
  }

  listRuntimeCandidates(portfolioId: string): RuntimeCandidateRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          c.candidate_id,
          c.portfolio_id,
          c.ticker,
          i.name,
          COALESCE(t.industry_id, i.industry_id) AS industry_id,
          ind.name AS industry_name,
          c.status,
          c.target_entry_weight,
          c.source_flow,
          c.thesis_id,
          c.ranking_score,
          c.inserted_at,
          c.last_reviewed_at,
          c.notes_md
        FROM candidate_pool_entries c
        JOIN instruments i ON i.ticker = c.ticker
        LEFT JOIN theses t ON t.thesis_id = c.thesis_id
        LEFT JOIN industries ind ON ind.industry_id = COALESCE(t.industry_id, i.industry_id)
        WHERE c.portfolio_id = ? AND c.removed_at IS NULL AND c.status != 'removed'
        ORDER BY COALESCE(c.ranking_score, 0) DESC, c.candidate_id ASC
      `)
      .all(portfolioId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      candidateId: Number(row.candidate_id),
      portfolioId: String(row.portfolio_id),
      ticker: String(row.ticker),
      name: String(row.name),
      industryId: row.industry_id === null ? null : String(row.industry_id),
      industryName: row.industry_name === null ? null : String(row.industry_name),
      status: String(row.status),
      targetEntryWeight: row.target_entry_weight === null ? null : Number(row.target_entry_weight),
      sourceFlow: row.source_flow === null ? null : String(row.source_flow),
      thesisId: row.thesis_id === null ? null : String(row.thesis_id),
      rankingScore: row.ranking_score === null ? null : Number(row.ranking_score),
      insertedAt: String(row.inserted_at),
      lastReviewedAt: row.last_reviewed_at === null ? null : String(row.last_reviewed_at),
      notesMd: row.notes_md === null ? null : String(row.notes_md),
    }));
  }

  upsertThesis(record: ThesisUpsert): void {
    const timestamp = nowIso();
    this.db
      .prepare(`
        INSERT INTO theses (
          thesis_id, ticker, industry_id, status, catalyst_strength, valuation_view,
          risk_level, confidence_base, monitoring_flags_json, last_updated, source_md_path,
          current_version_no, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(thesis_id) DO UPDATE SET
          ticker = excluded.ticker,
          industry_id = excluded.industry_id,
          status = excluded.status,
          catalyst_strength = excluded.catalyst_strength,
          valuation_view = excluded.valuation_view,
          risk_level = excluded.risk_level,
          confidence_base = excluded.confidence_base,
          monitoring_flags_json = excluded.monitoring_flags_json,
          last_updated = excluded.last_updated,
          source_md_path = excluded.source_md_path,
          current_version_no = excluded.current_version_no,
          updated_at = excluded.updated_at
      `)
      .run(
        record.thesisId,
        record.ticker,
        record.industryId ?? null,
        record.status,
        record.catalystStrength ?? null,
        record.valuationView ?? null,
        record.riskLevel ?? null,
        record.confidenceBase ?? null,
        stringifyJson(record.monitoringFlags ?? []),
        record.lastUpdated,
        record.sourceMdPath ?? null,
        record.currentVersionNo ?? 1,
        timestamp,
        timestamp,
      );
  }

  getThesis(thesisId: string): ThesisRow | null {
    const row = this.db
      .prepare(`
        SELECT
          thesis_id, ticker, industry_id, status, catalyst_strength, valuation_view,
          risk_level, confidence_base, monitoring_flags_json, last_updated, source_md_path, current_version_no,
          created_at, updated_at
        FROM theses
        WHERE thesis_id = ?
      `)
      .get(thesisId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      thesisId: String(row.thesis_id),
      ticker: String(row.ticker),
      industryId: row.industry_id === null ? null : String(row.industry_id),
      status: String(row.status),
      catalystStrength: row.catalyst_strength === null ? null : String(row.catalyst_strength),
      valuationView: row.valuation_view === null ? null : String(row.valuation_view),
      riskLevel: row.risk_level === null ? null : String(row.risk_level),
      confidenceBase: row.confidence_base === null ? null : Number(row.confidence_base),
      monitoringFlags: parseJson<string[]>(row.monitoring_flags_json as string | null) ?? [],
      lastUpdated: String(row.last_updated),
      sourceMdPath: row.source_md_path === null ? null : String(row.source_md_path),
      currentVersionNo: Number(row.current_version_no),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
    };
  }

  listRuntimeTheses(): RuntimeThesisRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          t.thesis_id,
          t.ticker,
          i.name AS company_name,
          t.industry_id,
          t.status,
          t.catalyst_strength,
          t.valuation_view,
          t.risk_level,
          t.confidence_base,
          t.monitoring_flags_json,
          t.last_updated,
          t.source_md_path,
          t.current_version_no
        FROM theses t
        JOIN instruments i ON i.ticker = t.ticker
        ORDER BY t.ticker ASC
      `)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      thesisId: String(row.thesis_id),
      ticker: String(row.ticker),
      companyName: String(row.company_name),
      industryId: row.industry_id === null ? null : String(row.industry_id),
      status: String(row.status),
      catalystStrength: row.catalyst_strength === null ? null : String(row.catalyst_strength),
      valuationView: row.valuation_view === null ? null : String(row.valuation_view),
      riskLevel: row.risk_level === null ? null : String(row.risk_level),
      confidenceBase: row.confidence_base === null ? null : Number(row.confidence_base),
      monitoringFlags: parseJson<string[]>(row.monitoring_flags_json as string | null) ?? [],
      lastUpdated: String(row.last_updated),
      sourceMdPath: row.source_md_path === null ? null : String(row.source_md_path),
      currentVersionNo: Number(row.current_version_no),
    }));
  }

  insertThesisVersion(record: ThesisVersionInsert): number {
    const result = this.db
      .prepare(`
        INSERT INTO thesis_versions (
          thesis_id, version_no, change_reason, editor, core_claim_md, key_drivers_md,
          invalidation_conditions_md, verified_points_md, falsified_points_md, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.thesisId,
        record.versionNo,
        record.changeReason ?? null,
        record.editor ?? null,
        record.coreClaimMd ?? null,
        record.keyDriversMd ?? null,
        record.invalidationConditionsMd ?? null,
        record.verifiedPointsMd ?? null,
        record.falsifiedPointsMd ?? null,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
  }

  getLatestThesisVersion(thesisId: string): ThesisVersionRow | null {
    const row = this.db
      .prepare(`
        SELECT
          thesis_version_id, thesis_id, version_no, change_reason, editor, core_claim_md,
          key_drivers_md, invalidation_conditions_md, verified_points_md, falsified_points_md, created_at
        FROM thesis_versions
        WHERE thesis_id = ?
        ORDER BY version_no DESC, thesis_version_id DESC
        LIMIT 1
      `)
      .get(thesisId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      thesisVersionId: Number(row.thesis_version_id),
      thesisId: String(row.thesis_id),
      versionNo: Number(row.version_no),
      changeReason: row.change_reason === null ? null : String(row.change_reason),
      editor: row.editor === null ? null : String(row.editor),
      coreClaimMd: row.core_claim_md === null ? null : String(row.core_claim_md),
      keyDriversMd: row.key_drivers_md === null ? null : String(row.key_drivers_md),
      invalidationConditionsMd:
        row.invalidation_conditions_md === null ? null : String(row.invalidation_conditions_md),
      verifiedPointsMd: row.verified_points_md === null ? null : String(row.verified_points_md),
      falsifiedPointsMd: row.falsified_points_md === null ? null : String(row.falsified_points_md),
      createdAt: String(row.created_at),
    };
  }

  upsertMarketContextSnapshot(record: MarketContextSnapshotUpsert): number {
    const existing = this.db
      .prepare("SELECT market_context_id FROM market_context_snapshots WHERE as_of_date = ?")
      .get(record.asOfDate) as { market_context_id: number } | undefined;

    if (existing) {
      this.db
        .prepare(`
          UPDATE market_context_snapshots
          SET market_tone = ?, policy_bias = ?, liquidity_view = ?, headline_risk = ?,
              priority_watchpoints_json = ?, notes_md = ?
          WHERE market_context_id = ?
        `)
        .run(
          record.marketTone,
          record.policyBias ?? null,
          record.liquidityView ?? null,
          record.headlineRisk ?? null,
          stringifyJson(record.priorityWatchpoints ?? []),
          record.notesMd ?? null,
          existing.market_context_id,
        );
      return existing.market_context_id;
    }

    const result = this.db
      .prepare(`
        INSERT INTO market_context_snapshots (
          as_of_date, market_tone, policy_bias, liquidity_view, headline_risk,
          priority_watchpoints_json, notes_md, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.asOfDate,
        record.marketTone,
        record.policyBias ?? null,
        record.liquidityView ?? null,
        record.headlineRisk ?? null,
        stringifyJson(record.priorityWatchpoints ?? []),
        record.notesMd ?? null,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
  }

  getLatestMarketContextSnapshot(): MarketContextSnapshotRow | null {
    const row = this.db
      .prepare(`
        SELECT
          market_context_id, as_of_date, market_tone, policy_bias, liquidity_view,
          headline_risk, priority_watchpoints_json, notes_md, created_at
        FROM market_context_snapshots
        ORDER BY as_of_date DESC, market_context_id DESC
        LIMIT 1
      `)
      .get() as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      marketContextId: Number(row.market_context_id),
      asOfDate: String(row.as_of_date),
      marketTone: String(row.market_tone),
      policyBias: row.policy_bias === null ? null : String(row.policy_bias),
      liquidityView: row.liquidity_view === null ? null : String(row.liquidity_view),
      headlineRisk: row.headline_risk === null ? null : String(row.headline_risk),
      priorityWatchpoints: parseJson<string[]>(row.priority_watchpoints_json as string | null) ?? [],
      notesMd: row.notes_md === null ? null : String(row.notes_md),
      createdAt: String(row.created_at),
    };
  }

  getMarketContextSnapshot(asOfDate: string): MarketContextSnapshotRow | null {
    const row = this.db
      .prepare(`
        SELECT
          market_context_id, as_of_date, market_tone, policy_bias, liquidity_view,
          headline_risk, priority_watchpoints_json, notes_md, created_at
        FROM market_context_snapshots
        WHERE as_of_date = ?
      `)
      .get(asOfDate) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      marketContextId: Number(row.market_context_id),
      asOfDate: String(row.as_of_date),
      marketTone: String(row.market_tone),
      policyBias: row.policy_bias === null ? null : String(row.policy_bias),
      liquidityView: row.liquidity_view === null ? null : String(row.liquidity_view),
      headlineRisk: row.headline_risk === null ? null : String(row.headline_risk),
      priorityWatchpoints: parseJson<string[]>(row.priority_watchpoints_json as string | null) ?? [],
      notesMd: row.notes_md === null ? null : String(row.notes_md),
      createdAt: String(row.created_at),
    };
  }

  listRuntimeIndustries(): RuntimeIndustryRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          i.industry_id,
          i.name,
          i.knowledge_md_path,
          v.current_view,
          v.recent_change,
          v.key_signals_json,
          v.watchpoints_json
        FROM industries i
        LEFT JOIN industry_knowledge_versions v
          ON v.industry_knowledge_version_id = (
            SELECT industry_knowledge_version_id
            FROM industry_knowledge_versions
            WHERE industry_id = i.industry_id
            ORDER BY version_no DESC, industry_knowledge_version_id DESC
            LIMIT 1
          )
        ORDER BY i.industry_id ASC
      `)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      industryId: String(row.industry_id),
      name: String(row.name),
      currentView: row.current_view === null ? null : String(row.current_view),
      recentChange: row.recent_change === null ? null : String(row.recent_change),
      keySignals: parseJson<string[]>(row.key_signals_json as string | null) ?? [],
      watchpoints: parseJson<string[]>(row.watchpoints_json as string | null) ?? [],
      knowledgeMdPath: row.knowledge_md_path === null ? null : String(row.knowledge_md_path),
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

  replacePositionUpdateCards(workflowRunId: string, cards: PositionUpdateCard[]): void {
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM position_update_cards WHERE workflow_run_id = ?")
        .run(workflowRunId);

      const stmt = this.db.prepare(`
        INSERT INTO position_update_cards (
          workflow_run_id, ticker, thesis_status, today_view, suggested_weight_change,
          confidence, why_now, risk_flags_json, action, priority, score, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const card of cards) {
        stmt.run(
          workflowRunId,
          card.ticker,
          card.thesisStatus,
          card.todayView,
          card.suggestedWeightChange,
          card.confidence,
          card.whyNow,
          stringifyJson(card.riskFlags),
          card.action,
          card.priority,
          card.score,
          nowIso(),
        );
      }
    });
  }

  replaceCandidateAssessments(workflowRunId: string, items: CandidateAssessment[]): void {
    this.transaction(() => {
      this.db
        .prepare("DELETE FROM candidate_assessments WHERE workflow_run_id = ?")
        .run(workflowRunId);

      const stmt = this.db.prepare(`
        INSERT INTO candidate_assessments (
          workflow_run_id, ticker, score, confidence, action, why_now, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of items) {
        stmt.run(
          workflowRunId,
          item.ticker,
          item.score,
          item.confidence,
          item.action,
          item.whyNow,
          nowIso(),
        );
      }
    });
  }

  upsertRiskGateResult(workflowRunId: string, result: RiskGateResult): number {
    const existing = this.db
      .prepare("SELECT risk_gate_result_id FROM risk_gate_results WHERE workflow_run_id = ?")
      .get(workflowRunId) as { risk_gate_result_id: number } | undefined;

    if (existing) {
      this.db
        .prepare(`
          UPDATE risk_gate_results
          SET decision = ?, alerts_json = ?, not_to_do_json = ?, created_at = ?
          WHERE risk_gate_result_id = ?
        `)
        .run(
          result.decision,
          stringifyJson(result.alerts),
          stringifyJson(result.notToDo),
          nowIso(),
          existing.risk_gate_result_id,
        );
      return existing.risk_gate_result_id;
    }

    const insertResult = this.db
      .prepare(`
        INSERT INTO risk_gate_results (
          workflow_run_id, decision, alerts_json, not_to_do_json, created_at
        )
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        workflowRunId,
        result.decision,
        stringifyJson(result.alerts),
        stringifyJson(result.notToDo),
        nowIso(),
      );
    return Number(insertResult.lastInsertRowid);
  }

  createOperationSheet(record: OperationSheetCreate): number {
    return this.transaction(() => {
      const result = this.db
        .prepare(`
        INSERT INTO operation_sheets (
          workflow_run_id, run_date, portfolio_id, status, market_attitude, risk_gate_decision,
          body_md, markdown_path, json_path, created_at, reviewed_at, reviewer
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.workflowRunId,
        record.runDate,
        record.portfolioId ?? null,
        record.status,
        record.marketAttitude ?? null,
        record.riskGateDecision ?? null,
        record.bodyMd ?? null,
        record.markdownPath ?? null,
        record.jsonPath ?? null,
        nowIso(),
        record.reviewedAt ?? null,
        record.reviewer ?? null,
        );

      const operationSheetId = Number(result.lastInsertRowid);
      const itemStmt = this.db.prepare(`
        INSERT INTO operation_sheet_items (
          operation_sheet_id, item_bucket, ticker, action, weight_change,
          confidence, reason, cancel_condition, sort_order, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      record.items.forEach((item, index) => {
        itemStmt.run(
          operationSheetId,
          item.itemBucket,
          item.ticker ?? null,
          item.action ?? null,
          item.weightChange ?? null,
          item.confidence ?? null,
          item.reason ?? null,
          item.cancelCondition ?? null,
          item.sortOrder ?? index,
          nowIso(),
        );
      });

      return operationSheetId;
    });
  }

  getOperationSheet(operationSheetId: number): OperationSheetRow | null {
    const row = this.db
      .prepare(`
        SELECT
          operation_sheet_id, workflow_run_id, run_date, portfolio_id, status,
          market_attitude, risk_gate_decision, body_md, markdown_path, json_path,
          created_at, reviewed_at, reviewer
        FROM operation_sheets
        WHERE operation_sheet_id = ?
      `)
      .get(operationSheetId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      operationSheetId: Number(row.operation_sheet_id),
      workflowRunId: String(row.workflow_run_id),
      runDate: String(row.run_date),
      portfolioId: row.portfolio_id === null ? null : String(row.portfolio_id),
      status: String(row.status),
      marketAttitude: row.market_attitude === null ? null : String(row.market_attitude),
      riskGateDecision: row.risk_gate_decision === null ? null : String(row.risk_gate_decision),
      bodyMd: row.body_md === null ? null : String(row.body_md),
      markdownPath: row.markdown_path === null ? null : String(row.markdown_path),
      jsonPath: row.json_path === null ? null : String(row.json_path),
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at === null ? null : String(row.reviewed_at),
      reviewer: row.reviewer === null ? null : String(row.reviewer),
    };
  }

  getOperationSheetByWorkflowRunId(workflowRunId: string): OperationSheetRow | null {
    const row = this.db
      .prepare(`
        SELECT
          operation_sheet_id, workflow_run_id, run_date, portfolio_id, status,
          market_attitude, risk_gate_decision, body_md, markdown_path, json_path,
          created_at, reviewed_at, reviewer
        FROM operation_sheets
        WHERE workflow_run_id = ?
      `)
      .get(workflowRunId) as Record<string, unknown> | undefined;
    if (!row) {
      return null;
    }
    return {
      operationSheetId: Number(row.operation_sheet_id),
      workflowRunId: String(row.workflow_run_id),
      runDate: String(row.run_date),
      portfolioId: row.portfolio_id === null ? null : String(row.portfolio_id),
      status: String(row.status),
      marketAttitude: row.market_attitude === null ? null : String(row.market_attitude),
      riskGateDecision: row.risk_gate_decision === null ? null : String(row.risk_gate_decision),
      bodyMd: row.body_md === null ? null : String(row.body_md),
      markdownPath: row.markdown_path === null ? null : String(row.markdown_path),
      jsonPath: row.json_path === null ? null : String(row.json_path),
      createdAt: String(row.created_at),
      reviewedAt: row.reviewed_at === null ? null : String(row.reviewed_at),
      reviewer: row.reviewer === null ? null : String(row.reviewer),
    };
  }

  listOperationSheetItems(operationSheetId: number): OperationSheetItemRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          operation_sheet_item_id, operation_sheet_id, item_bucket, ticker, action,
          weight_change, confidence, reason, cancel_condition, sort_order, created_at
        FROM operation_sheet_items
        WHERE operation_sheet_id = ?
        ORDER BY item_bucket ASC, sort_order ASC, operation_sheet_item_id ASC
      `)
      .all(operationSheetId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      operationSheetItemId: Number(row.operation_sheet_item_id),
      operationSheetId: Number(row.operation_sheet_id),
      itemBucket: String(row.item_bucket),
      ticker: row.ticker === null ? null : String(row.ticker),
      action: row.action === null ? null : String(row.action),
      weightChange: row.weight_change === null ? null : Number(row.weight_change),
      confidence: row.confidence === null ? null : Number(row.confidence),
      reason: row.reason === null ? null : String(row.reason),
      cancelCondition: row.cancel_condition === null ? null : String(row.cancel_condition),
      sortOrder: Number(row.sort_order),
      createdAt: String(row.created_at),
    }));
  }

  markOperationSheetReviewed(args: {
    operationSheetId: number;
    status: string;
    reviewer: string;
    reviewedAt?: string;
  }): void {
    this.db
      .prepare(`
        UPDATE operation_sheets
        SET status = ?, reviewer = ?, reviewed_at = ?
        WHERE operation_sheet_id = ?
      `)
      .run(args.status, args.reviewer, args.reviewedAt ?? nowIso(), args.operationSheetId);
  }

  createApproval(record: ApprovalCreate): number {
    const result = this.db
      .prepare(`
        INSERT INTO approvals (operation_sheet_id, decision, reviewer, notes_md, created_at)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(
        record.operationSheetId,
        record.decision,
        record.reviewer,
        record.notesMd ?? null,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
  }

  listApprovals(operationSheetId: number): ApprovalRow[] {
    const rows = this.db
      .prepare(`
        SELECT approval_id, operation_sheet_id, decision, reviewer, notes_md, created_at
        FROM approvals
        WHERE operation_sheet_id = ?
        ORDER BY approval_id ASC
      `)
      .all(operationSheetId) as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      approvalId: Number(row.approval_id),
      operationSheetId: Number(row.operation_sheet_id),
      decision: String(row.decision),
      reviewer: String(row.reviewer),
      notesMd: row.notes_md === null ? null : String(row.notes_md),
      createdAt: String(row.created_at),
    }));
  }

  createExecutionResult(record: ExecutionResultCreate): number {
    const result = this.db
      .prepare(`
        INSERT INTO execution_results (
          operation_sheet_item_id, execution_decision, approved_weight_change,
          executed_weight_change, executor, executed_at, notes_md
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.operationSheetItemId,
        record.executionDecision,
        record.approvedWeightChange ?? null,
        record.executedWeightChange ?? null,
        record.executor ?? null,
        record.executedAt ?? null,
        record.notesMd ?? null,
      );
    return Number(result.lastInsertRowid);
  }

  createObservationItem(record: ObservationItemCreate): number {
    const timestamp = nowIso();
    const result = this.db
      .prepare(`
        INSERT INTO observation_items (
          entity_type, entity_id, category, content_md, status, priority,
          source_workflow_run_id, due_date, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.entityType,
        record.entityId ?? null,
        record.category ?? null,
        record.contentMd,
        record.status ?? "open",
        record.priority ?? null,
        record.sourceWorkflowRunId ?? null,
        record.dueDate ?? null,
        timestamp,
        timestamp,
      );
    return Number(result.lastInsertRowid);
  }

  listOpenObservationItems(): ObservationItemRow[] {
    const rows = this.db
      .prepare(`
        SELECT
          observation_item_id, entity_type, entity_id, category, content_md, status, priority,
          source_workflow_run_id, due_date, created_at, updated_at, closed_at
        FROM observation_items
        WHERE status = 'open'
        ORDER BY COALESCE(priority, 'zzz') ASC, observation_item_id ASC
      `)
      .all() as Array<Record<string, unknown>>;
    return rows.map((row) => ({
      observationItemId: Number(row.observation_item_id),
      entityType: String(row.entity_type),
      entityId: row.entity_id === null ? null : String(row.entity_id),
      category: row.category === null ? null : String(row.category),
      contentMd: String(row.content_md),
      status: String(row.status),
      priority: row.priority === null ? null : String(row.priority),
      sourceWorkflowRunId: row.source_workflow_run_id === null ? null : String(row.source_workflow_run_id),
      dueDate: row.due_date === null ? null : String(row.due_date),
      createdAt: String(row.created_at),
      updatedAt: String(row.updated_at),
      closedAt: row.closed_at === null ? null : String(row.closed_at),
    }));
  }

  upsertPortfolioSnapshot(record: PortfolioSnapshotUpsert): number {
    const existing = this.db
      .prepare(`
        SELECT portfolio_snapshot_id
        FROM portfolio_snapshots
        WHERE portfolio_id = ? AND snapshot_date = ?
      `)
      .get(record.portfolioId, record.snapshotDate) as { portfolio_snapshot_id: number } | undefined;

    if (existing) {
      this.db
        .prepare(`
          UPDATE portfolio_snapshots
          SET total_equity_weight = ?, cash_weight = ?, sector_exposure_json = ?,
              style_exposure_json = ?, risk_budget_json = ?, notes_md = ?, created_at = ?
          WHERE portfolio_snapshot_id = ?
        `)
        .run(
          record.totalEquityWeight ?? null,
          record.cashWeight ?? null,
          stringifyJson(record.sectorExposureJson),
          stringifyJson(record.styleExposureJson),
          stringifyJson(record.riskBudgetJson),
          record.notesMd ?? null,
          nowIso(),
          existing.portfolio_snapshot_id,
        );
      return existing.portfolio_snapshot_id;
    }

    const result = this.db
      .prepare(`
        INSERT INTO portfolio_snapshots (
          portfolio_id, snapshot_date, total_equity_weight, cash_weight,
          sector_exposure_json, style_exposure_json, risk_budget_json, notes_md, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        record.portfolioId,
        record.snapshotDate,
        record.totalEquityWeight ?? null,
        record.cashWeight ?? null,
        stringifyJson(record.sectorExposureJson),
        stringifyJson(record.styleExposureJson),
        stringifyJson(record.riskBudgetJson),
        record.notesMd ?? null,
        nowIso(),
      );
    return Number(result.lastInsertRowid);
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
