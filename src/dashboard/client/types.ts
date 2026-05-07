export interface LogEntry {
  ts?: string;
  level?: string;
  message?: string;
  extra?: unknown;
}

export interface LogHistoryResponse {
  logPath: string;
  entries: LogEntry[];
}

export interface SqliteDatabaseInfo {
  id: "gateway" | "investment";
  name: string;
  path: string;
  description: string;
}

export interface ConsoleSummaryResponse {
  log: {
    path: string;
    exists: boolean;
    sizeBytes: number;
    entryCount: number;
  };
  databases: Array<
    SqliteDatabaseInfo & {
      exists: boolean;
      sizeBytes: number;
      tableCount: number;
    }
  >;
}

export type InvestmentPositionStatus = "active" | "archived";

export interface InvestmentPosition {
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
  status: InvestmentPositionStatus;
  archivedAt: string | null;
  dataSource: "sqlite";
}

export interface InvestmentPositionsResponse {
  positions: InvestmentPosition[];
  archivedPositions: InvestmentPosition[];
}

export interface UpdateInvestmentPositionPayload {
  name: string;
  weight: number;
  costBasis: number;
  holdingDays: number;
  sector: string;
  industryId: string;
  thesisId: string;
  notes: string;
}

export interface CreateInvestmentPositionPayload extends UpdateInvestmentPositionPayload {
  ticker: string;
}

export interface InvestmentPositionMutationResponse {
  action: "created" | "updated" | "archived";
  position: InvestmentPosition | null;
  archivedPosition: InvestmentPosition | null;
}

export interface SqliteTableSummary {
  name: string;
  rowCount: number | null;
  sql: string | null;
}

export interface SqliteTablesResponse {
  database: SqliteDatabaseInfo;
  tables: SqliteTableSummary[];
}

export interface SqliteTablePreview {
  table: string;
  columns: string[];
  rows: Array<Record<string, unknown>>;
  limit: number;
}

export interface SqliteRowsResponse {
  database: SqliteDatabaseInfo;
  preview: SqliteTablePreview;
}

export interface GatewayStatusResponse {
  status: "stopped" | "starting" | "running" | "stopping";
  managed: boolean;
  pid: number | null;
  command: string;
  startedAt: string | null;
  stoppedAt: string | null;
  lastExitCode: number | null;
  lastExitSignal: string | null;
  lastError: string | null;
  logPath: string;
}

export interface GatewayControlResponse {
  ok: boolean;
  gateway: GatewayStatusResponse;
}

export interface GatewayThreadRunItem {
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

export interface GatewayThreadSummary {
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

export interface GatewayThreadsResponse {
  threads: GatewayThreadSummary[];
}
