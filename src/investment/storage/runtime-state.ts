import fs from "node:fs/promises";
import path from "node:path";
import { loadMarkdown, loadRules } from "../lib/loaders.js";
import { resolveInvestmentRuntimePathsFromRoot } from "../runtime/paths.js";
import type {
  CandidateRecord,
  IndustryRecord,
  MarketContext,
  PositionRecord,
  RulesConfig,
  ThesisRecord,
} from "../types.js";
import { resolveInvestmentDbPath } from "./db-config.js";
import { InvestmentStore } from "./investment-store.js";

export const DEFAULT_PORTFOLIO_ID = "main-portfolio";

function resolveRepoRoot(investmentRoot: string): string {
  return path.dirname(investmentRoot);
}

function resolveStoredMarkdownPath(investmentRoot: string, storedPath: string | null | undefined): string | null {
  if (!storedPath) {
    return null;
  }
  const runtimePaths = resolveInvestmentRuntimePathsFromRoot(investmentRoot);
  if (path.isAbsolute(storedPath)) {
    return storedPath;
  }
  if (storedPath.startsWith("investment/")) {
    return path.join(resolveRepoRoot(investmentRoot), storedPath);
  }
  return path.join(runtimePaths.envRoot, storedPath);
}

async function readSectionsFromMarkdown(
  investmentRoot: string,
  storedPath: string | null | undefined,
): Promise<{ path: string; sections: Record<string, string> }> {
  const absolutePath = resolveStoredMarkdownPath(investmentRoot, storedPath);
  if (!absolutePath) {
    return {
      path: storedPath ?? "",
      sections: {},
    };
  }
  try {
    await fs.access(absolutePath);
    const doc = await loadMarkdown(absolutePath);
    return {
      path: absolutePath,
      sections: doc.sections,
    };
  } catch {
    return {
      path: absolutePath,
      sections: {},
    };
  }
}

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
    dbPath: resolveInvestmentDbPath(resolveRepoRoot(investmentRoot)),
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

export async function loadRuntimeCandidates(
  investmentRoot: string,
  portfolioId = DEFAULT_PORTFOLIO_ID,
): Promise<CandidateRecord[]> {
  return withStore(investmentRoot, (store) =>
    store.listRuntimeCandidates(portfolioId).map((row) => ({
      ticker: row.ticker,
      name: row.name,
      targetEntryWeight: row.targetEntryWeight ?? 0,
      industryId: row.industryId ?? "unknown",
      thesisId: row.thesisId ?? "",
      sourceFlow: row.sourceFlow ?? "",
      status: row.status,
      path: `sqlite://candidates/${portfolioId}/${row.ticker}`,
    })),
  );
}

export async function loadRuntimeTheses(investmentRoot: string): Promise<ThesisRecord[]> {
  return withStore(investmentRoot, async (store) => {
    const rows = store.listRuntimeTheses();
    const theses: ThesisRecord[] = [];
    for (const row of rows) {
      const markdown = await readSectionsFromMarkdown(investmentRoot, row.sourceMdPath);
      theses.push({
        thesisId: row.thesisId,
        ticker: row.ticker,
        companyName: row.companyName,
        industryId: row.industryId ?? "unknown",
        status: row.status,
        catalystStrength: row.catalystStrength ?? "",
        valuationView: row.valuationView ?? "",
        riskLevel: row.riskLevel ?? "",
        confidenceBase: row.confidenceBase ?? 0,
        lastUpdated: row.lastUpdated,
        monitoringFlags: row.monitoringFlags,
        path: markdown.path,
        sections: markdown.sections,
      });
    }
    return theses;
  });
}

export async function loadRuntimeIndustries(investmentRoot: string): Promise<IndustryRecord[]> {
  return withStore(investmentRoot, async (store) => {
    const rows = store.listRuntimeIndustries();
    const industries: IndustryRecord[] = [];
    for (const row of rows) {
      const markdown = await readSectionsFromMarkdown(investmentRoot, row.knowledgeMdPath);
      industries.push({
        industryId: row.industryId,
        name: row.name,
        currentView: row.currentView ?? "neutral",
        recentChange: row.recentChange ?? "",
        keySignals: row.keySignals,
        watchpoints: row.watchpoints,
        path: markdown.path,
        sections: markdown.sections,
      });
    }
    return industries;
  });
}

export async function loadRuntimeMarketContext(investmentRoot: string): Promise<MarketContext> {
  return withStore(investmentRoot, (store) => {
    const snapshot = store.getLatestMarketContextSnapshot();
    if (!snapshot) {
      throw new Error("Missing market_context_snapshots data in SQLite.");
    }
    return {
      asOf: snapshot.asOfDate,
      marketTone: snapshot.marketTone,
      policyBias: snapshot.policyBias ?? "neutral",
      liquidityView: snapshot.liquidityView ?? "balanced",
      headlineRisk: snapshot.headlineRisk ?? "medium",
      priorityWatchpoints: snapshot.priorityWatchpoints,
      notes: snapshot.notesMd ?? "",
    };
  });
}

export async function loadRuntimePendingItems(
  investmentRoot: string,
  _portfolioId = DEFAULT_PORTFOLIO_ID,
): Promise<string[]> {
  return withStore(investmentRoot, (store) =>
    store.listOpenObservationItems().map((item) => item.contentMd).filter((item) => item.trim().length > 0),
  );
}

export async function loadRuntimeRules(investmentRoot: string): Promise<RulesConfig> {
  return loadRules(investmentRoot);
}
