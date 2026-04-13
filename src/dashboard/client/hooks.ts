import { useCallback, useEffect, useState } from "react";
import {
  createInvestmentPosition,
  fetchConsoleSummary,
  fetchInvestmentPositions,
  fetchLogHistory,
  updateInvestmentPosition,
} from "./api";
import type {
  CreateInvestmentPositionPayload,
  ConsoleSummaryResponse,
  InvestmentPosition,
  InvestmentPositionMutationResponse,
  LogEntry,
  UpdateInvestmentPositionPayload,
} from "./types";

const MAX_LOG_ENTRIES = 1000;

function trimEntries(entries: LogEntry[]): LogEntry[] {
  if (entries.length <= MAX_LOG_ENTRIES) {
    return entries;
  }
  return entries.slice(entries.length - MAX_LOG_ENTRIES);
}

export function useConsoleSummary() {
  const [summary, setSummary] = useState<ConsoleSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload = await fetchConsoleSummary();
      setSummary(payload);
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "控制台概览加载失败");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, []);

  return {
    summary,
    loading,
    error,
    reload,
  };
}

export function useInvestmentPositions() {
  const [positions, setPositions] = useState<InvestmentPosition[]>([]);
  const [archivedPositions, setArchivedPositions] = useState<InvestmentPosition[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingTicker, setSavingTicker] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) {
      setLoading(true);
    }
    setError(null);
    try {
      const payload = await fetchInvestmentPositions();
      setPositions(payload.positions);
      setArchivedPositions(payload.archivedPositions);
    } catch (reloadError) {
      setError(reloadError instanceof Error ? reloadError.message : "持仓加载失败");
    } finally {
      if (!options?.silent) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    void reload();
  }, []);

  const applyMutation = useCallback((response: InvestmentPositionMutationResponse) => {
    if (response.action === "archived") {
      setPositions((current) => current.filter((item) => item.positionId !== response.archivedPosition?.positionId));
      if (response.archivedPosition) {
        setArchivedPositions((current) =>
          [response.archivedPosition, ...current.filter((item) => item.positionId !== response.archivedPosition?.positionId)].sort(
            (left, right) => (right.archivedAt || right.updatedAt).localeCompare(left.archivedAt || left.updatedAt),
          ),
        );
      }
      setSaveMessage(response.archivedPosition ? `${response.archivedPosition.name} 已归档` : "持仓已归档");
      return response.archivedPosition;
    }

    if (response.position) {
      setPositions((current) =>
        [...current.filter((item) => item.positionId !== response.position?.positionId), response.position].sort(
          (left, right) => right.weight - left.weight || left.ticker.localeCompare(right.ticker),
        ),
      );
    }

    if (response.action === "created") {
      setSaveMessage(response.position ? `${response.position.name} 已新增到持仓` : "持仓已新增");
    } else {
      setSaveMessage(response.position ? `${response.position.name} 持仓已更新` : "持仓已更新");
    }

    return response.position;
  }, []);

  const savePosition = useCallback(async (ticker: string, payload: UpdateInvestmentPositionPayload): Promise<InvestmentPosition | null> => {
    setSavingTicker(ticker);
    setSaveMessage(null);
    setError(null);
    try {
      const response = await updateInvestmentPosition(ticker, payload);
      return applyMutation(response);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "持仓更新失败");
      return null;
    } finally {
      setSavingTicker("");
    }
  }, [applyMutation]);

  const createPosition = useCallback(async (payload: CreateInvestmentPositionPayload): Promise<InvestmentPosition | null> => {
    setSavingTicker(payload.ticker);
    setSaveMessage(null);
    setError(null);
    try {
      const response = await createInvestmentPosition(payload);
      return applyMutation(response);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "新增持仓失败");
      return null;
    } finally {
      setSavingTicker("");
    }
  }, [applyMutation]);

  return {
    positions,
    archivedPositions,
    loading,
    error,
    savingTicker,
    saveMessage,
    reload,
    savePosition,
    createPosition,
    clearSaveMessage: useCallback(() => setSaveMessage(null), []),
  };
}

export function useLogStream() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [connectionLabel, setConnectionLabel] = useState("连接中");
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    let active = true;
    const source = new EventSource("/events");

    fetchLogHistory()
      .then((payload) => {
        if (!active) {
          return;
        }
        setEntries(trimEntries(payload.entries || []));
      })
      .catch(() => {
        if (!active) {
          return;
        }
        setConnectionLabel("历史日志加载失败");
        setConnected(false);
      });

    source.addEventListener("hello", () => {
      if (!active) {
        return;
      }
      setConnectionLabel("已连接");
      setConnected(true);
    });

    source.addEventListener("log", (event) => {
      if (!active) {
        return;
      }
      const payload = JSON.parse(event.data) as LogEntry;
      setEntries((current) => trimEntries([...current, payload]));
    });

    source.onerror = () => {
      if (!active) {
        return;
      }
      setConnectionLabel("连接断开，浏览器会自动重连");
      setConnected(false);
    };

    return () => {
      active = false;
      source.close();
    };
  }, []);

  return {
    entries,
    connectionLabel,
    connected,
    clearEntries: () => setEntries([]),
  };
}
