import fs from "node:fs/promises";
import path from "node:path";
import { todayInShanghai, writeText } from "./filesystem.js";
import { parseMarkdownDocument, stringifyMarkdownDocument } from "./frontmatter.js";
import { overwriteMarkdown } from "./loaders.js";
import {
  resolveInvestmentOutputPath,
} from "../runtime/paths.js";
import { resolveInvestmentDbPath } from "../storage/db-config.js";
import {
  DEFAULT_PORTFOLIO_ID,
  loadRuntimePositions,
  loadRuntimeTheses,
} from "../storage/runtime-state.js";
import { InvestmentStore } from "../storage/investment-store.js";
import type { Frontmatter, RiskGateResult, ThesisRecord } from "../types.js";
import type { OperationSheetItem } from "../workflows/daily-position-decision/types.js";

function resolveRepoRoot(investmentRoot: string): string {
  return path.dirname(investmentRoot);
}

function createStore(investmentRoot: string): InvestmentStore {
  return new InvestmentStore({
    dbPath: resolveInvestmentDbPath(resolveRepoRoot(investmentRoot)),
  });
}

function normalizeSheetItemRef(ref: string | undefined): { ticker?: string | null; reason?: string | null } {
  if (!ref || ref.trim().length === 0) {
    return {};
  }

  const trimmed = ref.trim();
  const tickerMatch = trimmed.match(/^(?:position|ticker):(.+)$/);
  if (tickerMatch) {
    return {
      ticker: tickerMatch[1],
      reason: trimmed,
    };
  }

  if (trimmed.startsWith("watch:")) {
    return {
      reason: trimmed.slice("watch:".length).trim(),
    };
  }

  if (trimmed.startsWith("industry:")) {
    return {
      reason: trimmed.slice("industry:".length).trim(),
    };
  }

  return {
    reason: trimmed,
  };
}

function normalizeOperationSheetItems(args: {
  sheetItems: OperationSheetItem[];
}) {
  const items: Array<{
    itemBucket: string;
    ticker?: string | null;
    action?: string | null;
    weightChange?: number | null;
    confidence?: number | null;
    reason?: string | null;
    cancelCondition?: string | null;
    sortOrder?: number;
  }> = [];

  args.sheetItems.forEach((item, index) => {
    const normalizedRef = normalizeSheetItemRef(item.ref);
    items.push({
      itemBucket: item.bucket,
      ticker: normalizedRef.ticker ?? null,
      action: item.action ?? null,
      weightChange: typeof item.weightChange === "number" ? item.weightChange : null,
      confidence: item.confidence,
      reason: normalizedRef.reason ?? null,
      cancelCondition: null,
      sortOrder: index,
    });
  });

  return items;
}

function renderOperationSheetMarkdown(args: {
  runDate: string;
  marketAttitude: string;
  riskGate: RiskGateResult;
  body: string;
  status: "draft" | "approve" | "reject";
  reviewer?: string;
  reviewedAt?: string;
  notes?: string;
}): string {
  const bodyParts = [args.body.trim()];
  if (args.status !== "draft") {
    bodyParts.push(
      [
        "## Approval Record",
        `- decision: ${args.status}`,
        `- reviewer: ${args.reviewer ?? "unknown"}`,
        `- reviewed_at: ${args.reviewedAt ?? ""}`,
        `- notes: ${args.notes || "none"}`,
      ].join("\n"),
    );
  }
  return stringifyMarkdownDocument(
    {
      kind: "daily_operation_sheet",
      run_date: args.runDate,
      status: args.status,
      risk_gate: args.riskGate.decision,
      market_attitude: args.marketAttitude,
      reviewer: args.reviewer ?? "",
      reviewed_at: args.reviewedAt ?? "",
    },
    bodyParts.filter(Boolean).join("\n\n"),
  );
}

async function updateThesisMarkdown(args: {
  thesis: ThesisRecord;
  runDate: string;
  decisionLine: string;
}): Promise<{
  nextSourceMdPath: string;
}> {
  const raw = await fs.readFile(args.thesis.path, "utf8");
  const doc = parseMarkdownDocument(args.thesis.path, raw);
  const nextFrontmatter: Frontmatter = {
    ...doc.frontmatter,
    last_updated: args.runDate,
  };
  const nextBody = `${doc.body}\n\n## Latest Decision ${args.runDate}\n\n${args.decisionLine}`.trim();
  await overwriteMarkdown(args.thesis.path, nextFrontmatter, nextBody);
  return {
    nextSourceMdPath: args.thesis.path,
  };
}

function formatActionWeightChange(weightChange: number | null | undefined): string {
  if (typeof weightChange !== "number" || Number.isNaN(weightChange)) {
    return "";
  }
  return `${weightChange > 0 ? "+" : ""}${weightChange}%`;
}

function buildThesisDecisionLine(args: {
  label: string;
  action: string | null;
  weightChange: number | null;
}): string {
  const parts = [args.label];
  if (args.action) {
    parts.push(args.action);
  }
  const weightChange = formatActionWeightChange(args.weightChange);
  if (weightChange) {
    parts.push(weightChange);
  }
  return parts.join(" ").trim();
}

async function writeActionLog(args: {
  investmentRoot: string;
  runDate: string;
  decision: string;
  reviewer: string;
  notes: string;
  sheetMarkdownPath: string;
}): Promise<string> {
  const actionLogPath = resolveInvestmentOutputPath(
    args.investmentRoot,
    "daily",
    args.runDate,
    `${args.runDate}-${args.decision}-action-log.md`,
  );
  await writeText(
    actionLogPath,
    stringifyMarkdownDocument(
      {
        kind: "action_log",
        run_date: args.runDate,
        decision: args.decision,
        reviewer: args.reviewer,
      },
      [
        "## Notes",
        args.notes || "none",
        "",
        "## Operation Sheet",
        args.sheetMarkdownPath,
      ].join("\n"),
    ),
  );
  return actionLogPath;
}

export async function rebuildPortfolioMemory(
  investmentRoot: string,
  portfolioId = DEFAULT_PORTFOLIO_ID,
): Promise<string> {
  const [positions, theses] = await Promise.all([
    loadRuntimePositions(investmentRoot, todayInShanghai(), portfolioId),
    loadRuntimeTheses(investmentRoot),
  ]);

  const thesisMap = new Map(theses.map((item) => [item.thesisId, item]));
  const body = [
    "## Current Positions",
    ...positions.map((item) => {
      const thesis = thesisMap.get(item.thesisId);
      return `- ${item.name}(${item.ticker}): weight ${item.weight}%, thesis ${thesis?.status ?? "unknown"}`;
    }),
    "",
    "## Thesis Coverage",
    ...theses.map((item) => `- ${item.companyName}(${item.ticker}): ${item.status}, updated ${item.lastUpdated}`),
  ].join("\n");

  const pathname = resolveInvestmentOutputPath(investmentRoot, "state", "portfolio-memory.md");
  await writeText(
    pathname,
    stringifyMarkdownDocument(
      {
        kind: "portfolio_memory",
        last_rebuilt: todayInShanghai(),
        source: "sqlite",
      },
      body,
    ),
  );
  return pathname;
}

export interface PersistDailyDraftInput {
  workflowRunId: string;
  runDate: string;
  portfolioId?: string;
  marketAttitude: string;
  riskGate: RiskGateResult;
  sheetItems: OperationSheetItem[];
  dailyOperationSheetBody: string;
}

export interface PersistDailyDraftResult {
  outputMarkdownPath: string;
}

export async function persistDailyDraft(
  investmentRoot: string,
  input: PersistDailyDraftInput,
): Promise<PersistDailyDraftResult> {
  const dailyDir = resolveInvestmentOutputPath(investmentRoot, "daily", input.runDate);
  const outputMarkdownPath = path.join(dailyDir, `${input.runDate}-daily-operation-sheet.md`);

  const markdown = renderOperationSheetMarkdown({
    runDate: input.runDate,
    marketAttitude: input.marketAttitude,
    riskGate: input.riskGate,
    body: input.dailyOperationSheetBody,
    status: "draft",
  });
  await writeText(outputMarkdownPath, markdown);

  return { outputMarkdownPath };
}

export interface ApprovalWritebackInput {
  workflowRunId: string;
  runDate: string;
  decision: "approve" | "reject";
  reviewer: string;
  notes: string;
  marketAttitude: string;
  riskGate: RiskGateResult;
  dailyOperationSheetBody: string;
  portfolioId?: string;
  sheetItems: OperationSheetItem[];
}

export interface ApprovalWritebackResult {
  sheetMarkdownPath: string;
  actionLogPath: string;
  portfolioMemoryPath: string;
}

export async function applyApprovalWriteback(
  investmentRoot: string,
  input: ApprovalWritebackInput,
): Promise<ApprovalWritebackResult> {
  const reviewedAt = `${input.runDate}T09:00:00+08:00`;
  const portfolioId = input.portfolioId ?? DEFAULT_PORTFOLIO_ID;
  const store = createStore(investmentRoot);
  const operationItems = normalizeOperationSheetItems({
    sheetItems: input.sheetItems,
  });
  const requiredItems = operationItems.filter((item) => item.itemBucket === "required");

  try {
    const outputMarkdownPath =
      resolveInvestmentOutputPath(investmentRoot, "daily", input.runDate, `${input.runDate}-daily-operation-sheet.md`);

    await writeText(
      outputMarkdownPath,
      renderOperationSheetMarkdown({
        runDate: input.runDate,
        marketAttitude: input.marketAttitude,
        riskGate: input.riskGate,
        body: input.dailyOperationSheetBody,
        status: input.decision,
        reviewer: input.reviewer,
        reviewedAt,
        notes: input.notes,
      }),
    );

    if (input.decision === "approve") {
      const positions = store.listRuntimePositions(portfolioId);
      const positionMap = new Map(positions.map((item) => [item.ticker, item]));
      const theses = await loadRuntimeTheses(investmentRoot);
      const thesisMap = new Map(theses.map((item) => [item.ticker, item]));

      for (const action of requiredItems) {
        if (!action.ticker) {
          continue;
        }

        const position = positionMap.get(action.ticker);
        const thesis = thesisMap.get(action.ticker);
        const weightDelta = action.weightChange ?? 0;

        if (position) {
          const nextWeight = Math.max(0, Math.round((position.currentWeight + weightDelta) * 100) / 100);
          store.upsertPosition({
            portfolioId,
            ticker: position.ticker,
            name: position.name,
            industryId: position.industryId,
            industryName: position.industryName,
            status: nextWeight <= 0 ? "closed" : "open",
            currentWeight: nextWeight,
            costBasis: position.costBasis,
            openedAt: position.openedAt,
            closedAt: nextWeight <= 0 ? reviewedAt : null,
            thesisId: position.thesisId,
            convictionBucket: position.convictionBucket,
            notesMd: position.notesMd,
          });
        } else if (action.action === "add" && weightDelta > 0) {
          store.upsertPosition({
            portfolioId,
            ticker: action.ticker,
            name: thesis?.companyName ?? action.ticker,
            industryId: thesis?.industryId ?? null,
            industryName: null,
            status: "open",
            currentWeight: Math.round(weightDelta * 100) / 100,
            costBasis: null,
            openedAt: reviewedAt,
            closedAt: null,
            thesisId: thesis?.thesisId ?? null,
            convictionBucket: null,
            notesMd: null,
          });
        }

        if (thesis) {
          const actionLabel = thesis.companyName ?? action.ticker;
          await updateThesisMarkdown({
            thesis,
            runDate: input.runDate,
            decisionLine: buildThesisDecisionLine({
              label: actionLabel,
              action: action.action,
              weightChange: action.weightChange,
            }),
          });
        }
      }

    }
    const actionLogPath = await writeActionLog({
      investmentRoot,
      runDate: input.runDate,
      decision: input.decision,
      reviewer: input.reviewer,
      notes: input.notes,
      sheetMarkdownPath: outputMarkdownPath,
    });
    const portfolioMemoryPath = await rebuildPortfolioMemory(investmentRoot, portfolioId);

    return {
      sheetMarkdownPath: outputMarkdownPath,
      actionLogPath,
      portfolioMemoryPath,
    };
  } finally {
    store.close();
  }
}
