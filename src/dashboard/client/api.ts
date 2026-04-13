import type {
  CreateInvestmentPositionPayload,
  ConsoleSummaryResponse,
  GatewayControlResponse,
  GatewayStatusResponse,
  GatewayThreadsResponse,
  InvestmentPosition,
  InvestmentPositionMutationResponse,
  InvestmentPositionsResponse,
  LogHistoryResponse,
  SqliteRowsResponse,
  SqliteTablesResponse,
  UpdateInvestmentPositionPayload,
} from "./types";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload as T;
}

export function fetchConsoleSummary(): Promise<ConsoleSummaryResponse> {
  return fetchJson<ConsoleSummaryResponse>("/api/console/summary");
}

export function fetchInvestmentPositions(): Promise<InvestmentPositionsResponse> {
  return fetchJson<InvestmentPositionsResponse>("/api/investment/positions");
}

export function createInvestmentPosition(
  payload: CreateInvestmentPositionPayload,
): Promise<InvestmentPositionMutationResponse> {
  return fetchJson<InvestmentPositionMutationResponse>("/api/investment/positions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function updateInvestmentPosition(
  ticker: string,
  payload: UpdateInvestmentPositionPayload,
): Promise<InvestmentPositionMutationResponse> {
  return fetchJson<InvestmentPositionMutationResponse>(`/api/investment/positions/${encodeURIComponent(ticker)}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

export function fetchLogHistory(): Promise<LogHistoryResponse> {
  return fetchJson<LogHistoryResponse>("/api/history");
}

export function fetchSqliteTables(databaseId: string): Promise<SqliteTablesResponse> {
  return fetchJson<SqliteTablesResponse>(`/api/sqlite/tables?db=${encodeURIComponent(databaseId)}`);
}

export function fetchSqliteRows(databaseId: string, tableName: string, limit: number): Promise<SqliteRowsResponse> {
  return fetchJson<SqliteRowsResponse>(
    `/api/sqlite/rows?db=${encodeURIComponent(databaseId)}&table=${encodeURIComponent(tableName)}&limit=${limit}`,
  );
}

export function fetchGatewayStatus(): Promise<GatewayStatusResponse> {
  return fetchJson<GatewayStatusResponse>("/api/gateway/status");
}

export function controlGateway(action: "start" | "stop" | "restart"): Promise<GatewayControlResponse> {
  return fetchJson<GatewayControlResponse>("/api/gateway/control", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ action }),
  });
}

export function fetchGatewayThreads(): Promise<GatewayThreadsResponse> {
  return fetchJson<GatewayThreadsResponse>("/api/gateway/threads");
}
