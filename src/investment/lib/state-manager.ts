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
  loadRuntimeCandidates,
  loadRuntimePositions,
  loadRuntimeTheses,
} from "../storage/runtime-state.js";
import { type RuntimePositionRow, type ThesisUpsert, InvestmentStore } from "../storage/investment-store.js";
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

function normalizeStoredMarkdownPath(sourceRoot: string, absolutePath: string): string {
  return path.relative(resolveRepoRoot(sourceRoot), absolutePath).replaceAll(path.sep, "/");
}

function positionSnapshotHoldingDays(runDate: string, openedAt: string | null): number {
  if (!openedAt) {
    return 0;
  }
  const openedTs = Date.parse(openedAt);
  const runTs = Date.parse(`${runDate}T00:00:00+08:00`);
  if (Number.isNaN(openedTs) || Number.isNaN(runTs)) {
    return 0;
  }
  return Math.max(0, Math.floor((runTs - openedTs) / 86_400_000));
}

function normalizeSheetItemRef(ref: string | undefined): { ticker?: string | null; reason?: string | null } {
  if (!ref || ref.trim().length === 0) {
    return {};
  }

  const trimmed = ref.trim();
  const tickerMatch = trimmed.match(/^(?:position|candidate|ticker):(.+)$/);
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

function buildOperationSheetItems(args: {
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
  nextVersionNo: number;
  nextSourceMdPath: string;
  nextSections: Record<string, string>;
}> {
  const raw = await fs.readFile(args.thesis.path, "utf8");
  const doc = parseMarkdownDocument(args.thesis.path, raw);
  const nextFrontmatter: Frontmatter = {
    ...doc.frontmatter,
    last_updated: args.runDate,
  };
  const nextBody = `${doc.body}\n\n## Latest Decision ${args.runDate}\n\n${args.decisionLine}`.trim();
  await overwriteMarkdown(args.thesis.path, nextFrontmatter, nextBody);
  const reparsed = parseMarkdownDocument(
    args.thesis.path,
    stringifyMarkdownDocument(nextFrontmatter, nextBody),
  );
  const currentVersionNo = typeof doc.frontmatter.current_version_no === "number"
    ? Number(doc.frontmatter.current_version_no)
    : 1;
  return {
    nextVersionNo: currentVersionNo + 1,
    nextSourceMdPath: args.thesis.path,
    nextSections: reparsed.sections,
  };
}

function buildPortfolioSnapshotFromPositions(portfolioId: string, runDate: string, positions: RuntimePositionRow[]) {
  const sectorExposure = new Map<string, number>();
  let totalEquityWeight = 0;
  for (const position of positions) {
    totalEquityWeight += position.currentWeight;
    const sectorKey = position.industryName ?? position.industryId ?? "unknown";
    sectorExposure.set(sectorKey, (sectorExposure.get(sectorKey) ?? 0) + position.currentWeight);
  }
  return {
    portfolioId,
    snapshotDate: runDate,
    totalEquityWeight,
    cashWeight: Math.max(0, 100 - totalEquityWeight),
    sectorExposureJson: Object.fromEntries(sectorExposure.entries()),
    styleExposureJson: null,
    riskBudgetJson: null,
    notesMd: "Generated from SQLite runtime state.",
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
  const [positions, candidates, theses] = await Promise.all([
    loadRuntimePositions(investmentRoot, todayInShanghai(), portfolioId),
    loadRuntimeCandidates(investmentRoot, portfolioId),
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
    "## Candidate Pool",
    ...candidates.map((item) => `- ${item.name}(${item.ticker}): target ${item.targetEntryWeight}%`),
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
  const portfolioId = input.portfolioId ?? DEFAULT_PORTFOLIO_ID;
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

  const store = createStore(investmentRoot);
  try {
    store.createOperationSheet({
      workflowRunId: input.workflowRunId,
      runDate: input.runDate,
      portfolioId,
      status: "awaiting_approval",
      marketAttitude: input.marketAttitude,
      riskGateDecision: input.riskGate.decision,
      bodyMd: input.dailyOperationSheetBody,
      markdownPath: outputMarkdownPath,
      items: buildOperationSheetItems({
        sheetItems: input.sheetItems,
      }),
    });
  } finally {
    store.close();
  }

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

  try {
    const operationSheet = store.getOperationSheetByWorkflowRunId(input.workflowRunId);
    if (!operationSheet) {
      throw new Error(`Missing operation sheet for workflow run ${input.workflowRunId}.`);
    }

    store.markOperationSheetReviewed({
      operationSheetId: operationSheet.operationSheetId,
      status: input.decision,
      reviewer: input.reviewer,
      reviewedAt,
    });
    store.createApproval({
      operationSheetId: operationSheet.operationSheetId,
      decision: input.decision,
      reviewer: input.reviewer,
      notesMd: input.notes,
    });

    const outputMarkdownPath =
      operationSheet.markdownPath ??
      resolveInvestmentOutputPath(investmentRoot, "daily", input.runDate, `${input.runDate}-daily-operation-sheet.md`);

    await writeText(
      outputMarkdownPath,
      renderOperationSheetMarkdown({
        runDate: input.runDate,
        marketAttitude: input.marketAttitude,
        riskGate: input.riskGate,
        body: operationSheet.bodyMd ?? input.dailyOperationSheetBody,
        status: input.decision,
        reviewer: input.reviewer,
        reviewedAt,
        notes: input.notes,
      }),
    );

    const operationItems = store.listOperationSheetItems(operationSheet.operationSheetId);
    const requiredItems = operationItems.filter((item) => item.itemBucket === "required");
    const watchItems = operationItems.filter((item) => item.itemBucket === "watch");

    if (input.decision === "approve") {
      const positions = store.listRuntimePositions(portfolioId);
      const positionMap = new Map(positions.map((item) => [item.ticker, item]));
      const candidates = store.listRuntimeCandidates(portfolioId);
      const candidateMap = new Map(candidates.map((item) => [item.ticker, item]));
      const theses = await loadRuntimeTheses(investmentRoot);
      const thesisMap = new Map(theses.map((item) => [item.ticker, item]));

      for (const action of requiredItems) {
        if (!action.ticker) {
          continue;
        }

        const position = positionMap.get(action.ticker);
        const candidate = candidateMap.get(action.ticker);
        const weightDelta = action.weightChange ?? 0;

        if (position) {
          const nextWeight = Math.max(0, Math.round((position.currentWeight + weightDelta) * 100) / 100);
          store.upsertPosition({
            portfolioId,
            ticker: position.ticker,
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
            status: "open",
            currentWeight: Math.round(weightDelta * 100) / 100,
            costBasis: null,
            openedAt: reviewedAt,
            closedAt: null,
            thesisId: candidate?.thesisId ?? null,
            convictionBucket: null,
            notesMd: candidate?.notesMd ?? null,
          });
        }

        const thesis = thesisMap.get(action.ticker);
        if (thesis) {
          const actionLabel = candidate?.name ?? thesis.companyName ?? action.ticker;
          const nextMarkdown = await updateThesisMarkdown({
            thesis,
            runDate: input.runDate,
            decisionLine: buildThesisDecisionLine({
              label: actionLabel,
              action: action.action,
              weightChange: action.weightChange,
            }),
          });
          const current = store.getThesis(thesis.thesisId);
          const thesisUpsert: ThesisUpsert = {
            thesisId: thesis.thesisId,
            ticker: thesis.ticker,
            industryId: thesis.industryId,
            status: thesis.status,
            catalystStrength: thesis.catalystStrength,
            valuationView: thesis.valuationView,
            riskLevel: thesis.riskLevel,
            confidenceBase: thesis.confidenceBase,
            monitoringFlags: thesis.monitoringFlags,
            lastUpdated: input.runDate,
            sourceMdPath: normalizeStoredMarkdownPath(investmentRoot, nextMarkdown.nextSourceMdPath),
            currentVersionNo: (current?.currentVersionNo ?? 1) + 1,
          };
          store.upsertThesis(thesisUpsert);
          store.insertThesisVersion({
            thesisId: thesis.thesisId,
            versionNo: thesisUpsert.currentVersionNo ?? nextMarkdown.nextVersionNo,
            changeReason: "daily-run approval writeback",
            editor: input.reviewer,
            coreClaimMd: nextMarkdown.nextSections["Core Claim"] ?? "",
            keyDriversMd: nextMarkdown.nextSections["Key Drivers"] ?? "",
            invalidationConditionsMd: nextMarkdown.nextSections["Invalidation Conditions"] ?? "",
            verifiedPointsMd: nextMarkdown.nextSections["Verified Points"] ?? "",
            falsifiedPointsMd: nextMarkdown.nextSections["Falsified Points"] ?? "",
          });
        }
      }

      for (const watchItem of watchItems) {
        const contentMd = watchItem.reason ?? watchItem.ticker ?? "";
        if (!contentMd.trim()) {
          continue;
        }
        store.createObservationItem({
          entityType: watchItem.ticker ? "ticker" : "workflow",
          entityId: watchItem.ticker ?? portfolioId,
          category: "daily_watch",
          contentMd,
          priority: "medium",
          sourceWorkflowRunId: input.workflowRunId,
        });
      }
    }

    for (const item of requiredItems) {
      store.createExecutionResult({
        operationSheetItemId: item.operationSheetItemId,
        executionDecision: input.decision === "approve" ? "approved" : "rejected",
        approvedWeightChange: item.weightChange ?? null,
        executedWeightChange: input.decision === "approve"
          ? item.weightChange ?? null
          : 0,
        executor: input.reviewer,
        executedAt: reviewedAt,
        notesMd: input.notes,
      });
    }

    const updatedPositions = store.listRuntimePositions(portfolioId);
    const thesisRows = store.listRuntimeTheses();
    const thesisStatusMap = new Map(thesisRows.map((item) => [item.thesisId, item.status]));
    store.replacePositionDailySnapshots(
      portfolioId,
      input.runDate,
      updatedPositions.map((item) => ({
        portfolioId,
        tradeDate: input.runDate,
        ticker: item.ticker,
        weight: item.currentWeight,
        costBasis: item.costBasis,
        holdingDays: positionSnapshotHoldingDays(input.runDate, item.openedAt),
        thesisId: item.thesisId,
        thesisStatus: item.thesisId ? thesisStatusMap.get(item.thesisId) ?? null : null,
        sectorName: item.industryName,
        industryId: item.industryId,
        sourceRunId: input.workflowRunId,
      })),
    );
    store.upsertPortfolioSnapshot(buildPortfolioSnapshotFromPositions(portfolioId, input.runDate, updatedPositions));

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
