import path from "node:path";
import { loadIndustries, loadRules, loadTheses } from "../lib/loaders.js";
import type {
  IndustryRecord,
  MarketContext,
  PositionRecord,
  RulesConfig,
  ThesisRecord,
} from "../types.js";
import { resolveInvestmentDbPath } from "./db-config.js";
import { InvestmentStore } from "./investment-store.js";

export const DEFAULT_PORTFOLIO_ID = "main-portfolio";

function holdingDaysFor(runDate: string, openedAt: string | null): number {
  if (!openedAt) {
    return 0;
  }
  const opened = Date.parse(openedAt);
  const current = Date.parse(`${runDate}T00:00:00+08:00`);
  if (Number.isNaN(opened) || Number.isNaN(current)) {
    return 0;
  }
  return Math.max(0, Math.floor((current - opened) / 86_400_000));
}

function withStore<T>(investmentRoot: string, work: (store: InvestmentStore) => Promise<T> | T): Promise<T> {
  const store = new InvestmentStore({
    dbPath: resolveInvestmentDbPath(path.dirname(investmentRoot)),
  });
  return Promise.resolve(work(store)).finally(() => store.close());
}

export async function loadRuntimePositions(
  investmentRoot: string,
  runDate: string,
  portfolioId = DEFAULT_PORTFOLIO_ID,
): Promise<PositionRecord[]> {
  return withStore(investmentRoot, (store) =>
    store.listRuntimePositions(portfolioId).map((row) => ({
      ticker: row.ticker,
      name: row.name,
      weight: row.currentWeight,
      costBasis: row.costBasis ?? 0,
      holdingDays: holdingDaysFor(runDate, row.openedAt),
      sector: row.industryName ?? row.industryId ?? "unknown",
      industryId: row.industryId ?? "unknown",
      thesisId: row.thesisId ?? "",
      path: `sqlite://positions/${portfolioId}/${row.ticker}`,
    })),
  );
}

export async function loadRuntimeTheses(investmentRoot: string): Promise<ThesisRecord[]> {
  return loadTheses(investmentRoot);
}

export async function loadRuntimeIndustries(investmentRoot: string): Promise<IndustryRecord[]> {
  return loadIndustries(investmentRoot);
}

export function createDefaultMarketContext(asOf: string): MarketContext {
  return {
    asOf,
    marketTone: "neutral",
    policyBias: "neutral",
    liquidityView: "balanced",
    headlineRisk: "medium",
    priorityWatchpoints: [],
    notes: "",
  };
}

export async function loadRuntimeRules(investmentRoot: string): Promise<RulesConfig> {
  return loadRules(investmentRoot);
}
