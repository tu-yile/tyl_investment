import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import { consoleConfig } from "#src/config/console-config.js";
import { runtimePathsConfig } from "#src/config/runtime-paths-config.js";
import { resolveInvestmentDbPath } from "#src/investment/storage/db-config.js";
import { InvestmentStore } from "#src/investment/storage/investment-store.js";

type LogLevel = "info" | "warn" | "error";
type SqliteDatabaseId = "gateway" | "investment";

interface LogEntry {
  ts?: string;
  level?: LogLevel | string;
  message?: string;
  extra?: unknown;
}

interface SseClient {
  id: number;
  response: http.ServerResponse;
}

interface SqliteDatabaseInfo {
  id: SqliteDatabaseId;
  name: string;
  path: string;
  description: string;
}

interface SqliteTableSummary {
  name: string;
  rowCount: number | null;
  sql: string | null;
}

interface SqliteTablePreview {
  table: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  limit: number;
}

interface InvestmentPositionRecord {
  positionId: number;
  portfolioId: string;
  portfolioName: string;
  ticker: string;
  name: string;
  weight: number;
  costBasis: number;
  holdingDays: number;
  sector: string;
  industryId: string;
  thesisId: string;
  notes: string;
  updatedAt: string;
  status: "active" | "archived";
  archivedAt: string | null;
  dataSource: "sqlite";
}

interface InvestmentPositionCreatePayload extends InvestmentPositionUpdatePayload {
  ticker: string;
}

interface InvestmentPositionMutationResponse {
  action: "created" | "updated" | "archived";
  position: InvestmentPositionRecord | null;
  archivedPosition: InvestmentPositionRecord | null;
}

interface InvestmentPositionUpdatePayload {
  name: string;
  weight: number;
  costBasis: number;
  holdingDays: number;
  sector: string;
  industryId: string;
  thesisId: string;
  notes: string;
}

interface GatewayThreadRunItem {
  runId: string;
  conversationId: string;
  threadId: string | null;
  prompt: string;
  status: string;
  summary: string | null;
  error: string | null;
  startedAt: string;
  finishedAt: string | null;
}

interface GatewayThreadSummary {
  threadId: string;
  conversationId: string;
  workspace: string | null;
  mode: string | null;
  runCount: number;
  latestStatus: string;
  latestPrompt: string;
  latestStartedAt: string;
  latestFinishedAt: string | null;
  runs: GatewayThreadRunItem[];
}

type GatewayRuntimeStatus = "stopped" | "starting" | "running" | "stopping";

const DEFAULT_PORT = consoleConfig.port;
const POLL_INTERVAL_MS = 800;
const INITIAL_LINES = 200;
const DEFAULT_TABLE_PREVIEW_LIMIT = 50;
const MAX_TABLE_PREVIEW_LIMIT = 100;
const CLIENT_DIST_DIR = path.join(runtimePathsConfig.cwd, "dist/dashboard/client");
const CLIENT_INDEX_PATH = path.join(CLIENT_DIST_DIR, "index.html");
const CLIENT_ROUTE_PATHS = new Set(["/", "/gateway", "/gateway/", "/logs", "/logs/", "/sqlite", "/sqlite/"]);
const GATEWAY_ENTRY_PATH = path.join(runtimePathsConfig.cwd, "dist/gateway/index.js");
const DEFAULT_DASHBOARD_PORTFOLIO_ID = process.env.DASHBOARD_PORTFOLIO_ID ?? "main-portfolio";
const MS_PER_DAY = 24 * 60 * 60 * 1000;

class GatewayProcessController {
  private child: ChildProcessWithoutNullStreams | null = null;

  private status: GatewayRuntimeStatus = "stopped";

  private startedAt: string | null = null;

  private stoppedAt: string | null = null;

  private lastExitCode: number | null = null;

  private lastExitSignal: string | null = null;

  private lastError: string | null = null;

  private readonly command = `${process.execPath} ${path.relative(runtimePathsConfig.cwd, GATEWAY_ENTRY_PATH)}`;

  getStatus() {
    return {
      status: this.status,
      managed: this.child !== null,
      pid: this.child?.pid ?? null,
      command: this.command,
      startedAt: this.startedAt,
      stoppedAt: this.stoppedAt,
      lastExitCode: this.lastExitCode,
      lastExitSignal: this.lastExitSignal,
      lastError: this.lastError,
      logPath: runtimePathsConfig.logPath,
    };
  }

  async start(): Promise<void> {
    if (this.status === "running" || this.status === "starting") {
      return;
    }
    if (!fs.existsSync(GATEWAY_ENTRY_PATH)) {
      throw new Error(`Gateway entry build missing: ${GATEWAY_ENTRY_PATH}`);
    }

    this.status = "starting";
    this.lastError = null;
    this.lastExitCode = null;
    this.lastExitSignal = null;

    const child = spawn(process.execPath, [GATEWAY_ENTRY_PATH], {
      cwd: runtimePathsConfig.cwd,
      stdio: ["ignore", "pipe", "pipe"],
      env: process.env,
    });

    this.child = child;
    this.startedAt = new Date().toISOString();

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });
    child.stderr.on("data", (chunk) => {
      const text = chunk.toString();
      this.lastError = text.trim() || this.lastError;
      process.stderr.write(chunk);
    });
    child.once("spawn", () => {
      this.status = "running";
    });
    child.once("error", (error) => {
      this.lastError = error.message;
      this.status = "stopped";
      this.stoppedAt = new Date().toISOString();
      this.child = null;
    });
    child.once("exit", (code, signal) => {
      this.lastExitCode = code;
      this.lastExitSignal = signal;
      this.stoppedAt = new Date().toISOString();
      this.status = "stopped";
      this.child = null;
    });
  }

  async stop(): Promise<void> {
    if (!this.child || this.status === "stopped" || this.status === "stopping") {
      return;
    }

    const activeChild = this.child;
    this.status = "stopping";

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) {
          return;
        }
        settled = true;
        resolve();
      };

      activeChild.once("exit", () => {
        finish();
      });

      activeChild.kill("SIGTERM");

      setTimeout(() => {
        if (activeChild.exitCode === null && activeChild.signalCode === null) {
          activeChild.kill("SIGKILL");
        }
        finish();
      }, 5_000);
    });
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}

function readJsonBody(request: http.IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (_error) {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function safeParseEntry(line: string): LogEntry | null {
  try {
    return JSON.parse(line) as LogEntry;
  } catch (_error) {
    return null;
  }
}

function json(response: http.ServerResponse, statusCode: number, payload: unknown): void {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload));
}

function text(response: http.ServerResponse, statusCode: number, body: string): void {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(body);
}

function tailLines(filePath: string, count: number): string[] {
  if (!fs.existsSync(filePath)) {
    return [];
  }
  const content = fs.readFileSync(filePath, "utf8");
  const lines = content.split("\n").filter(Boolean);
  return lines.slice(-count);
}

function readEntries(filePath: string, count: number): LogEntry[] {
  return tailLines(filePath, count)
    .map((line) => safeParseEntry(line))
    .filter((entry): entry is LogEntry => Boolean(entry));
}

function formatSseData(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function normalizeValue(value: unknown): unknown {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (value instanceof Uint8Array) {
    return `[blob ${value.byteLength} bytes]`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeValue(item));
  }
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).map(([key, item]) => [key, normalizeValue(item)]);
    return Object.fromEntries(entries);
  }
  return value;
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function parseLimit(rawValue: string | null): number {
  const parsed = Number.parseInt(rawValue || "", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_TABLE_PREVIEW_LIMIT;
  }
  return Math.min(parsed, MAX_TABLE_PREVIEW_LIMIT);
}

function normalizeTicker(rawTicker: string): string {
  const value = rawTicker.trim();
  return /^\d+$/.test(value) ? value.padStart(6, "0") : value;
}

function parseNonNegativeNumber(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`Field "${key}" must be a non-negative number`);
  }
  return Math.round(value * 100) / 100;
}

function parseNonNegativeInteger(value: unknown, key: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`Field "${key}" must be a non-negative integer`);
  }
  return value;
}

function parseRequiredText(value: unknown, key: string): string {
  if (typeof value !== "string") {
    throw new Error(`Field "${key}" must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length === 0) {
    throw new Error(`Field "${key}" cannot be empty`);
  }
  return normalized;
}

function parseNotesValue(value: unknown): string {
  if (typeof value !== "string") {
    throw new Error('Field "notes" must be a string');
  }
  return value.trim();
}

function parseTickerValue(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error('Field "ticker" must be a string');
  }
  const normalized = normalizeTicker(String(value));
  if (!/^\d{6}$/.test(normalized)) {
    throw new Error('Field "ticker" must be a 6-digit code');
  }
  return normalized;
}

function calculateHoldingDays(openedAt: string | null, endedAt: string | null): number {
  if (!openedAt) {
    return 0;
  }
  const start = Date.parse(openedAt);
  const end = Date.parse(endedAt ?? new Date().toISOString());
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) {
    return 0;
  }
  return Math.max(0, Math.floor((end - start) / MS_PER_DAY));
}

function toOpenedAtFromHoldingDays(holdingDays: number): string {
  return new Date(Date.now() - holdingDays * MS_PER_DAY).toISOString();
}

function resolveDashboardPortfolio(db: DatabaseSync): { portfolioId: string; portfolioName: string } {
  const preferred = db
    .prepare(`
      SELECT portfolio_id, name
      FROM portfolios
      WHERE portfolio_id = ?
      LIMIT 1
    `)
    .get(DEFAULT_DASHBOARD_PORTFOLIO_ID) as { portfolio_id: string; name: string } | undefined;

  if (preferred) {
    return {
      portfolioId: String(preferred.portfolio_id),
      portfolioName: String(preferred.name),
    };
  }

  const active = db
    .prepare(`
      SELECT portfolio_id, name
      FROM portfolios
      WHERE status = 'active'
      ORDER BY updated_at DESC, portfolio_id ASC
      LIMIT 1
    `)
    .get() as { portfolio_id: string; name: string } | undefined;

  if (active) {
    return {
      portfolioId: String(active.portfolio_id),
      portfolioName: String(active.name),
    };
  }

  throw new Error("No portfolio configured for dashboard");
}

function mapInvestmentPositionRow(row: Record<string, unknown>): InvestmentPositionRecord {
  const openedAt = row.opened_at === null ? null : String(row.opened_at);
  const closedAt = row.closed_at === null ? null : String(row.closed_at);
  const rawStatus = String(row.status);
  const archived = rawStatus !== "open";
  return {
    positionId: Number(row.position_id),
    portfolioId: String(row.portfolio_id),
    portfolioName: String(row.portfolio_name ?? row.portfolio_id),
    ticker: normalizeTicker(String(row.ticker)),
    name: String(row.instrument_name ?? row.ticker),
    weight: Number(row.current_weight),
    costBasis: row.cost_basis === null ? 0 : Number(row.cost_basis),
    holdingDays: calculateHoldingDays(openedAt, archived ? closedAt ?? String(row.updated_at) : null),
    sector: String(row.industry_name ?? row.industry_id ?? "未分类"),
    industryId: row.industry_id === null ? "" : String(row.industry_id),
    thesisId: row.thesis_id === null ? "" : String(row.thesis_id),
    notes: row.notes_md === null ? "" : String(row.notes_md),
    updatedAt: String(row.updated_at),
    status: archived ? "archived" : "active",
    archivedAt: closedAt,
    dataSource: "sqlite",
  };
}

function queryInvestmentPositionsByStatus(
  db: DatabaseSync,
  portfolioId: string,
  status: "open" | "closed",
): InvestmentPositionRecord[] {
  const rows = db
    .prepare(`
      SELECT
        p.position_id,
        p.portfolio_id,
        pf.name AS portfolio_name,
        p.ticker,
        p.status,
        p.current_weight,
        p.cost_basis,
        p.opened_at,
        p.closed_at,
        p.thesis_id,
        p.notes_md,
        p.updated_at,
        COALESCE(p.name, p.ticker) AS instrument_name,
        COALESCE(p.industry_id, '') AS industry_id,
        COALESCE(p.industry_name, '') AS industry_name
      FROM positions p
      LEFT JOIN portfolios pf ON pf.portfolio_id = p.portfolio_id
      WHERE p.portfolio_id = ? AND p.status ${status === "open" ? "= 'open'" : "!= 'open'"}
      ORDER BY ${status === "open" ? "p.current_weight DESC, p.position_id ASC" : "COALESCE(p.closed_at, p.updated_at) DESC, p.position_id DESC"}
    `)
    .all(portfolioId) as Array<Record<string, unknown>>;

  return rows.map((row) => mapInvestmentPositionRow(row));
}

function getInvestmentPositionById(positionId: number): InvestmentPositionRecord | null {
  return withDatabase("investment", (db) => {
    const row = db
      .prepare(`
        SELECT
          p.position_id,
          p.portfolio_id,
          pf.name AS portfolio_name,
          p.ticker,
          p.status,
          p.current_weight,
          p.cost_basis,
          p.opened_at,
          p.closed_at,
          p.thesis_id,
          p.notes_md,
          p.updated_at,
          COALESCE(p.name, p.ticker) AS instrument_name,
          COALESCE(p.industry_id, '') AS industry_id,
          COALESCE(p.industry_name, '') AS industry_name
        FROM positions p
        LEFT JOIN portfolios pf ON pf.portfolio_id = p.portfolio_id
        WHERE p.position_id = ?
        LIMIT 1
      `)
      .get(positionId) as Record<string, unknown> | undefined;

    return row ? mapInvestmentPositionRow(row) : null;
  });
}

function withInvestmentStore<T>(work: (store: InvestmentStore, portfolio: { portfolioId: string; portfolioName: string }) => T): T {
  const store = new InvestmentStore({ dbPath: resolveInvestmentDbPath(runtimePathsConfig.cwd) });
  try {
    const portfolio = resolveDashboardPortfolio(store.db);
    return work(store, portfolio);
  } finally {
    store.close();
  }
}

async function listInvestmentPositions(): Promise<{
  positions: InvestmentPositionRecord[];
  archivedPositions: InvestmentPositionRecord[];
}> {
  return withDatabase("investment", (db) => {
    const portfolio = resolveDashboardPortfolio(db);
    return {
      positions: queryInvestmentPositionsByStatus(db, portfolio.portfolioId, "open"),
      archivedPositions: queryInvestmentPositionsByStatus(db, portfolio.portfolioId, "closed"),
    };
  });
}

function parseInvestmentPositionUpdatePayload(payload: unknown): InvestmentPositionUpdatePayload {
  if (!payload || typeof payload !== "object") {
    throw new Error("Invalid request body");
  }
  const body = payload as Record<string, unknown>;
  return {
    name: parseRequiredText(body.name, "name"),
    weight: parseNonNegativeNumber(body.weight, "weight"),
    costBasis: parseNonNegativeNumber(body.costBasis, "costBasis"),
    holdingDays: parseNonNegativeInteger(body.holdingDays, "holdingDays"),
    sector: parseRequiredText(body.sector, "sector"),
    industryId: parseRequiredText(body.industryId, "industryId"),
    thesisId: parseRequiredText(body.thesisId, "thesisId"),
    notes: parseNotesValue(body.notes),
  };
}

function parseInvestmentPositionCreatePayload(payload: unknown): InvestmentPositionCreatePayload {
  const base = parseInvestmentPositionUpdatePayload(payload);
  const body = payload as Record<string, unknown>;
  return {
    ...base,
    ticker: parseTickerValue(body.ticker),
  };
}

async function createInvestmentPosition(payload: unknown): Promise<InvestmentPositionMutationResponse> {
  const nextPayload = parseInvestmentPositionCreatePayload(payload);
  const positionId = withInvestmentStore((store, portfolio) =>
    store.transaction(() => {
      const existing = store.listOpenPositions(portfolio.portfolioId).find((item) => normalizeTicker(item.ticker) === nextPayload.ticker);
      if (existing) {
        throw new Error(`Position already exists: ${nextPayload.ticker}`);
      }

      return store.upsertPosition({
        portfolioId: portfolio.portfolioId,
        ticker: nextPayload.ticker,
        name: nextPayload.name,
        industryId: nextPayload.industryId,
        industryName: nextPayload.sector,
        status: "open",
        currentWeight: nextPayload.weight,
        costBasis: nextPayload.costBasis,
        openedAt: toOpenedAtFromHoldingDays(nextPayload.holdingDays),
        closedAt: null,
        thesisId: nextPayload.thesisId,
        notesMd: nextPayload.notes,
      });
    }),
  );
  return {
    action: "created",
    position: getInvestmentPositionById(positionId),
    archivedPosition: null,
  };
}

async function updateInvestmentPosition(
  ticker: string,
  payload: unknown,
): Promise<InvestmentPositionMutationResponse> {
  const normalizedTicker = normalizeTicker(ticker);
  const nextPayload = parseInvestmentPositionUpdatePayload(payload);
  const mutation = withInvestmentStore((store, portfolio) =>
    store.transaction(() => {
      const existing = store.listOpenPositions(portfolio.portfolioId).find((item) => normalizeTicker(item.ticker) === normalizedTicker);
      if (!existing) {
        throw new Error(`Position not found: ${normalizedTicker}`);
      }

      const openedAt = toOpenedAtFromHoldingDays(nextPayload.holdingDays);
      if (nextPayload.weight === 0) {
        const closedAt = new Date().toISOString();
        store.upsertPosition({
          portfolioId: portfolio.portfolioId,
          ticker: normalizedTicker,
          name: nextPayload.name,
          industryId: nextPayload.industryId,
          industryName: nextPayload.sector,
          status: "closed",
          currentWeight: 0,
          costBasis: nextPayload.costBasis,
          openedAt,
          closedAt,
          thesisId: nextPayload.thesisId,
          notesMd: nextPayload.notes,
        });
        return {
          action: "archived" as const,
          positionId: existing.positionId,
        };
      }

      const positionId = store.upsertPosition({
        portfolioId: portfolio.portfolioId,
        ticker: normalizedTicker,
        name: nextPayload.name,
        industryId: nextPayload.industryId,
        industryName: nextPayload.sector,
        status: "open",
        currentWeight: nextPayload.weight,
        costBasis: nextPayload.costBasis,
        openedAt,
        closedAt: null,
        thesisId: nextPayload.thesisId,
        notesMd: nextPayload.notes,
      });
      return {
        action: "updated" as const,
        positionId,
      };
    }),
  );

  if (mutation.action === "archived") {
    return {
      action: "archived",
      position: null,
      archivedPosition: getInvestmentPositionById(mutation.positionId),
    };
  }

  return {
    action: "updated",
    position: getInvestmentPositionById(mutation.positionId),
    archivedPosition: null,
  };
}

function getDatabaseCatalog(): SqliteDatabaseInfo[] {
  const repoRoot = runtimePathsConfig.cwd;
  return [
    {
      id: "gateway",
      name: "Gateway Runtime",
      path: runtimePathsConfig.dbPath,
      description: "网关消息、会话和运行记录",
    },
    {
      id: "investment",
      name: "Investment Core",
      path: resolveInvestmentDbPath(repoRoot),
      description: "投资主业务数据",
    },
  ];
}

function getDatabaseInfo(databaseId: string | null): SqliteDatabaseInfo | null {
  if (!databaseId) {
    return null;
  }
  return getDatabaseCatalog().find((database) => database.id === databaseId) ?? null;
}

function withDatabase<T>(databaseId: string | null, work: (db: DatabaseSync, info: SqliteDatabaseInfo) => T): T {
  const info = getDatabaseInfo(databaseId);
  if (!info) {
    throw new Error("Unknown database");
  }
  if (!fs.existsSync(info.path)) {
    throw new Error(`Database file not found: ${info.path}`);
  }

  const db = new DatabaseSync(info.path, { readOnly: true });
  try {
    return work(db, info);
  } finally {
    db.close();
  }
}

function listDatabaseTables(databaseId: string | null): { database: SqliteDatabaseInfo; tables: SqliteTableSummary[] } {
  return withDatabase(databaseId, (db, info) => {
    const tables = db
      .prepare(`
        SELECT name, sql
        FROM sqlite_master
        WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
        ORDER BY name ASC
      `)
      .all() as Array<{ name: string; sql: string | null }>;

    const tableSummaries = tables.map((table) => {
      let rowCount: number | null = null;
      try {
        const row = db.prepare(`SELECT COUNT(*) AS count FROM ${quoteIdentifier(table.name)}`).get() as { count: number };
        rowCount = Number(row.count);
      } catch (_error) {
        rowCount = null;
      }
      return {
        name: table.name,
        rowCount,
        sql: table.sql ?? null,
      };
    });

    return { database: info, tables: tableSummaries };
  });
}

function previewTable(
  databaseId: string | null,
  tableName: string | null,
  limit: number,
): { database: SqliteDatabaseInfo; preview: SqliteTablePreview } {
  return withDatabase(databaseId, (db, info) => {
    if (!tableName) {
      throw new Error("Missing table name");
    }

    const tableRow = db
      .prepare(`
        SELECT name
        FROM sqlite_master
        WHERE type = 'table' AND name = ?
        LIMIT 1
      `)
      .get(tableName) as { name: string } | undefined;

    if (!tableRow) {
      throw new Error("Unknown table");
    }

    const columns = db.prepare(`PRAGMA table_info(${quoteIdentifier(tableName)})`).all() as Array<{ name: string }>;
    const safeTableName = quoteIdentifier(tableName);
    const rows = db
      .prepare(`SELECT * FROM ${safeTableName} LIMIT ${limit}`)
      .all()
      .map((row) => normalizeValue(row as Record<string, unknown>)) as Array<Record<string, unknown>>;

    return {
      database: info,
      preview: {
        table: tableName,
        columns: columns.map((column) => column.name),
        rows,
        limit,
      },
    };
  });
}

function collectConsoleSummary(logPath: string): {
  log: { path: string; exists: boolean; sizeBytes: number; entryCount: number };
  databases: Array<SqliteDatabaseInfo & { exists: boolean; sizeBytes: number; tableCount: number }>;
} {
  const logExists = fs.existsSync(logPath);
  const logSize = logExists ? fs.statSync(logPath).size : 0;
  const databases = getDatabaseCatalog().map((database) => {
    const exists = fs.existsSync(database.path);
    let tableCount = 0;
    if (exists) {
      try {
        const db = new DatabaseSync(database.path, { readOnly: true });
        try {
          const row = db
            .prepare(`
              SELECT COUNT(*) AS count
              FROM sqlite_master
              WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
            `)
            .get() as { count: number };
          tableCount = Number(row.count);
        } finally {
          db.close();
        }
      } catch (_error) {
        tableCount = 0;
      }
    }

    return {
      ...database,
      exists,
      sizeBytes: exists ? fs.statSync(database.path).size : 0,
      tableCount,
    };
  });

  return {
    log: {
      path: logPath,
      exists: logExists,
      sizeBytes: logSize,
      entryCount: readEntries(logPath, INITIAL_LINES).length,
    },
    databases,
  };
}

function listGatewayThreads(): { threads: GatewayThreadSummary[] } {
  return withDatabase("gateway", (db) => {
    const runRows = db
      .prepare(`
        SELECT run_id, chat_id, thread_id, prompt, status, summary, error, started_at, finished_at
        FROM runs
        WHERE thread_id IS NOT NULL AND thread_id != ''
        ORDER BY started_at DESC
      `)
      .all() as Array<{
      run_id: string;
      chat_id: string;
      thread_id: string;
      prompt: string;
      status: string;
      summary: string | null;
      error: string | null;
      started_at: string;
      finished_at: string | null;
    }>;

    const sessionRows = db
      .prepare(`
        SELECT chat_id, thread_id, workspace, mode
        FROM sessions
        WHERE thread_id IS NOT NULL AND thread_id != ''
      `)
      .all() as Array<{ chat_id: string; thread_id: string; workspace: string | null; mode: string | null }>;

    const sessionByThreadId = new Map(sessionRows.map((row) => [row.thread_id, row]));
    const grouped = new Map<string, GatewayThreadSummary>();

    for (const row of runRows) {
      const existing = grouped.get(row.thread_id);
      const run: GatewayThreadRunItem = {
        runId: row.run_id,
        conversationId: row.chat_id,
        threadId: row.thread_id,
        prompt: row.prompt,
        status: row.status,
        summary: row.summary,
        error: row.error,
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      };

      if (!existing) {
        const session = sessionByThreadId.get(row.thread_id);
        grouped.set(row.thread_id, {
          threadId: row.thread_id,
          conversationId: row.chat_id,
          workspace: session?.workspace ?? null,
          mode: session?.mode ?? null,
          runCount: 1,
          latestStatus: row.status,
          latestPrompt: row.prompt,
          latestStartedAt: row.started_at,
          latestFinishedAt: row.finished_at,
          runs: [run],
        });
        continue;
      }

      existing.runCount += 1;
      existing.runs.push(run);
    }

    return {
      threads: Array.from(grouped.values()),
    };
  });
}

function guessContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}

function resolveClientAsset(requestPath: string): string | null {
  const normalizedRequestPath = requestPath.startsWith("/") ? requestPath.slice(1) : requestPath;
  let decodedPath = "";
  try {
    decodedPath = decodeURIComponent(normalizedRequestPath);
  } catch (_error) {
    return null;
  }
  const assetPath = path.resolve(CLIENT_DIST_DIR, decodedPath);

  if (!assetPath.startsWith(CLIENT_DIST_DIR)) {
    return null;
  }
  if (!fs.existsSync(assetPath) || !fs.statSync(assetPath).isFile()) {
    return null;
  }
  return assetPath;
}

function serveFile(response: http.ServerResponse, filePath: string): void {
  response.writeHead(200, {
    "Content-Type": guessContentType(filePath),
    "Cache-Control": filePath.endsWith(".html") ? "no-store" : "public, max-age=31536000, immutable",
  });
  fs.createReadStream(filePath).pipe(response);
}

function serveClientIndex(response: http.ServerResponse): void {
  if (!fs.existsSync(CLIENT_INDEX_PATH)) {
    text(
      response,
      503,
      "Console frontend build is missing. Run `npm run build` before starting the log viewer.",
    );
    return;
  }
  serveFile(response, CLIENT_INDEX_PATH);
}

export async function startGatewayLogViewer(): Promise<void> {
  const logPath = runtimePathsConfig.logPath;
  let nextClientId = 1;
  let offset = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;
  const clients = new Map<number, SseClient>();
  const gatewayController = new GatewayProcessController();

  const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "127.0.0.1"}`);

    if (requestUrl.pathname === "/api/history") {
      json(response, 200, {
        logPath,
        entries: readEntries(logPath, INITIAL_LINES),
      });
      return;
    }

    if (requestUrl.pathname === "/api/console/summary") {
      json(response, 200, collectConsoleSummary(logPath));
      return;
    }

    if (requestUrl.pathname === "/api/investment/positions") {
      if (request.method === "GET") {
        try {
          json(response, 200, await listInvestmentPositions());
        } catch (error: unknown) {
          json(response, 400, { error: error instanceof Error ? error.message : "Failed to load positions" });
        }
        return;
      }

      if (request.method === "POST") {
        try {
          json(response, 200, await createInvestmentPosition(await readJsonBody(request)));
        } catch (error: unknown) {
          json(response, 400, { error: error instanceof Error ? error.message : "Failed to create position" });
        }
        return;
      }

      if (request.method !== "GET" && request.method !== "POST") {
        json(response, 405, { error: "Method not allowed" });
        return;
      }
      return;
    }

    if (requestUrl.pathname.startsWith("/api/investment/positions/")) {
      if (request.method !== "PATCH") {
        json(response, 405, { error: "Method not allowed" });
        return;
      }

      try {
        const ticker = decodeURIComponent(requestUrl.pathname.slice("/api/investment/positions/".length));
        json(response, 200, await updateInvestmentPosition(ticker, await readJsonBody(request)));
      } catch (error: unknown) {
        json(response, 400, { error: error instanceof Error ? error.message : "Failed to update position" });
      }
      return;
    }

    if (requestUrl.pathname === "/api/gateway/status") {
      json(response, 200, gatewayController.getStatus());
      return;
    }

    if (requestUrl.pathname === "/api/gateway/threads") {
      try {
        json(response, 200, listGatewayThreads());
      } catch (error: unknown) {
        json(response, 400, { error: error instanceof Error ? error.message : "Failed to list gateway threads" });
      }
      return;
    }

    if (requestUrl.pathname === "/api/gateway/control") {
      if (request.method !== "POST") {
        json(response, 405, { error: "Method not allowed" });
        return;
      }

      try {
        const payload = (await readJsonBody(request)) as { action?: "start" | "stop" | "restart" };
        switch (payload.action) {
          case "start":
            await gatewayController.start();
            break;
          case "stop":
            await gatewayController.stop();
            break;
          case "restart":
            await gatewayController.restart();
            break;
          default:
            json(response, 400, { error: "Unknown gateway action" });
            return;
        }

        json(response, 200, {
          ok: true,
          gateway: gatewayController.getStatus(),
        });
      } catch (error: unknown) {
        json(response, 400, { error: error instanceof Error ? error.message : "Gateway control failed" });
      }
      return;
    }

    if (requestUrl.pathname === "/api/sqlite/tables") {
      try {
        json(response, 200, listDatabaseTables(requestUrl.searchParams.get("db")));
      } catch (error: unknown) {
        json(response, 400, { error: error instanceof Error ? error.message : "Failed to list tables" });
      }
      return;
    }

    if (requestUrl.pathname === "/api/sqlite/rows") {
      try {
        json(
          response,
          200,
          previewTable(
            requestUrl.searchParams.get("db"),
            requestUrl.searchParams.get("table"),
            parseLimit(requestUrl.searchParams.get("limit")),
          ),
        );
      } catch (error: unknown) {
        json(response, 400, { error: error instanceof Error ? error.message : "Failed to preview table" });
      }
      return;
    }

    if (requestUrl.pathname === "/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "Access-Control-Allow-Origin": "*",
      });
      response.write(formatSseData("hello", { entries: [] }));

      const clientId = nextClientId++;
      clients.set(clientId, { id: clientId, response });

      const cleanup = (): void => {
        clients.delete(clientId);
        response.end();
      };

      request.on("close", cleanup);
      request.on("error", cleanup);
      return;
    }

    const assetPath = resolveClientAsset(requestUrl.pathname);
    if (assetPath) {
      serveFile(response, assetPath);
      return;
    }

    if (CLIENT_ROUTE_PATHS.has(requestUrl.pathname)) {
      serveClientIndex(response);
      return;
    }

    json(response, 404, { error: "Not found" });
  });

  const pollTimer = setInterval(() => {
    if (!fs.existsSync(logPath)) {
      offset = 0;
      return;
    }

    const stats = fs.statSync(logPath);
    if (stats.size < offset) {
      offset = 0;
    }
    if (stats.size === offset) {
      return;
    }

    const stream = fs.createReadStream(logPath, {
      encoding: "utf8",
      start: offset,
      end: stats.size - 1,
    });

    let chunk = "";
    stream.on("data", (data) => {
      chunk += data;
    });
    stream.on("end", () => {
      offset = stats.size;
      const lines = chunk.split("\n").filter(Boolean);
      for (const line of lines) {
        const entry = safeParseEntry(line);
        if (!entry) {
          continue;
        }
        const payload = formatSseData("log", entry);
        for (const client of clients.values()) {
          client.response.write(payload);
        }
      }
    });
  }, POLL_INTERVAL_MS);

  server.on("close", () => {
    clearInterval(pollTimer);
    void gatewayController.stop();
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(DEFAULT_PORT, "127.0.0.1", () => {
      resolve();
    });
  });

  console.log(`Investment OS console running at http://127.0.0.1:${DEFAULT_PORT}`);
  console.log(`Serving console client from: ${CLIENT_DIST_DIR}`);
  console.log(`Watching log file: ${path.resolve(logPath)}`);
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  startGatewayLogViewer().catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
}
