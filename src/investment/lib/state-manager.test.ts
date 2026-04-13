import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { stringifyMarkdownDocument } from "./frontmatter.js";
import {
  applyApprovalWriteback,
  persistDailyDraft,
} from "./state-manager.js";
import { InvestmentStore } from "../storage/investment-store.js";
import { resolveInvestmentDbPath } from "../storage/db-config.js";

async function writeMarkdown(filePath: string, frontmatter: Record<string, unknown>, body: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, stringifyMarkdownDocument(frontmatter, body), "utf8");
}

async function createTempInvestmentRoot(): Promise<{ tempRoot: string; investmentRoot: string; dbPath: string }> {
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "investment-runtime-"));
  const investmentRoot = path.join(tempRoot, "investment");
  await fs.mkdir(investmentRoot, { recursive: true });
  return {
    tempRoot,
    investmentRoot,
    dbPath: resolveInvestmentDbPath(tempRoot),
  };
}

async function seedKnowledgeFiles(investmentRoot: string): Promise<void> {
  await writeMarkdown(
    path.join(investmentRoot, "knowledge/industries/power-equipment.md"),
    {
      kind: "industry_knowledge",
      industry_id: "power-equipment",
      name: "电力设备与储能",
      current_view: "positive",
      recent_change: "grid_and_storage_supportive",
      key_signals: ["电网投资维持强度"],
      watchpoints: ["海外需求波动"],
    },
    [
      "## 行业静态底盘",
      "电力设备景气延续。",
      "",
      "## 行业核心跟踪框架",
      "- 电网投资",
    ].join("\n"),
  );

  await writeMarkdown(
    path.join(investmentRoot, "knowledge/companies/300750-CATL/thesis.md"),
    {
      kind: "thesis",
      thesis_id: "thesis-300750",
      ticker: "300750",
      company_name: "宁德时代",
      industry_id: "power-equipment",
      status: "strengthened",
      catalyst_strength: "strong",
      valuation_view: "okay",
      risk_level: "medium",
      confidence_base: 0.72,
      last_updated: "2026-04-08",
      monitoring_flags: ["关注海外需求波动"],
    },
    [
      "## Core Claim",
      "宁德时代核心逻辑稳定。",
      "",
      "## Key Drivers",
      "- 储能",
      "",
      "## Invalidation Conditions",
      "- 龙头地位弱化",
      "",
      "## Verified Points",
      "- 订单维持",
      "",
      "## Falsified Points",
      "- 暂无",
    ].join("\n"),
  );
}

test("persistDailyDraft and applyApprovalWriteback close the sqlite loop", async () => {
  const { tempRoot, investmentRoot, dbPath } = await createTempInvestmentRoot();
  await seedKnowledgeFiles(investmentRoot);

  const store = new InvestmentStore({ dbPath });
  try {
    store.upsertPortfolio({
      portfolioId: "main-portfolio",
      name: "主组合",
      strategyStyle: "主动多头",
      marketScope: "A股",
      holdingPeriod: "中线",
    });
    store.upsertIndustry({
      industryId: "power-equipment",
      name: "电力设备与储能",
      knowledgeMdPath: "investment/knowledge/industries/power-equipment.md",
    });
    store.insertIndustryKnowledgeVersion({
      industryId: "power-equipment",
      versionNo: 1,
      currentView: "positive",
      recentChange: "grid_and_storage_supportive",
      keySignals: ["电网投资维持强度"],
      watchpoints: ["海外需求波动"],
      sourceMdPath: "investment/knowledge/industries/power-equipment.md",
      editor: "test",
    });
    store.upsertInstrument({
      ticker: "300750",
      name: "宁德时代",
      industryId: "power-equipment",
    });
    store.upsertThesis({
      thesisId: "thesis-300750",
      ticker: "300750",
      industryId: "power-equipment",
      status: "strengthened",
      catalystStrength: "strong",
      valuationView: "okay",
      riskLevel: "medium",
      confidenceBase: 0.72,
      monitoringFlags: ["关注海外需求波动"],
      lastUpdated: "2026-04-08",
      sourceMdPath: "investment/knowledge/companies/300750-CATL/thesis.md",
      currentVersionNo: 1,
    });
    store.insertThesisVersion({
      thesisId: "thesis-300750",
      versionNo: 1,
      changeReason: "seed",
      editor: "test",
      coreClaimMd: "宁德时代核心逻辑稳定。",
    });
    store.upsertPosition({
      portfolioId: "main-portfolio",
      ticker: "300750",
      currentWeight: 4,
      costBasis: 188,
      openedAt: "2026-03-01T09:30:00+08:00",
      thesisId: "thesis-300750",
    });
    store.createWorkflowRun({
      workflowRunId: "run-1",
      workflowId: "daily-position-decision",
      portfolioId: "main-portfolio",
      runDate: "2026-04-10",
      triggerType: "manual",
      status: "running",
    });
  } finally {
    store.close();
  }

  await persistDailyDraft(investmentRoot, {
    workflowRunId: "run-1",
    runDate: "2026-04-10",
    marketAttitude: "偏积极",
    riskGate: {
      decision: "pass",
      alerts: ["组合允许执行"],
      notToDo: ["不要追高"],
    },
    positionUpdates: [
      {
        ticker: "300750",
        name: "宁德时代",
        thesisStatus: "strengthened",
        todayView: "建议减仓 1%",
        suggestedWeightChange: -1,
        confidence: 0.8,
        whyNow: "锁定部分收益",
        riskFlags: ["关注海外需求波动"],
        action: "reduce",
        priority: "high",
        score: 0.8,
      },
    ],
    candidateAssessments: [],
    requiredActions: [
      {
        ticker: "300750",
        name: "宁德时代",
        thesisStatus: "strengthened",
        todayView: "建议减仓 1%",
        suggestedWeightChange: -1,
        confidence: 0.8,
        whyNow: "锁定部分收益",
        riskFlags: ["关注海外需求波动"],
        action: "reduce",
        priority: "high",
        score: 0.8,
      },
    ],
    optionalActions: [],
    continueHolding: [],
    focusWatchlist: ["跟踪储能订单兑现"],
    dailyOperationSheetBody: "## 必须动作\n- 宁德时代减仓 1%",
  });

  const result = await applyApprovalWriteback(investmentRoot, {
    workflowRunId: "run-1",
    runDate: "2026-04-10",
    decision: "approve",
    reviewer: "tester",
    notes: "批准执行",
    marketAttitude: "偏积极",
    riskGate: {
      decision: "pass",
      alerts: ["组合允许执行"],
      notToDo: ["不要追高"],
    },
    dailyOperationSheetBody: "## 必须动作\n- 宁德时代减仓 1%",
    requiredActions: [
      {
        ticker: "300750",
        name: "宁德时代",
        suggestedWeightChange: -1,
        action: "reduce",
      },
    ],
  });

  const checkStore = new InvestmentStore({ dbPath });
  try {
    const updatedPosition = checkStore.listRuntimePositions("main-portfolio")[0];
    assert.equal(updatedPosition?.currentWeight, 3);

    const operationSheet = checkStore.getOperationSheetByWorkflowRunId("run-1");
    assert.equal(operationSheet?.status, "approve");

    const approvals = checkStore.listApprovals(operationSheet!.operationSheetId);
    assert.equal(approvals.length, 1);

    const executionCount = checkStore.db
      .prepare("SELECT COUNT(*) AS count FROM execution_results")
      .get() as { count: number };
    assert.equal(executionCount.count, 1);

    const thesis = checkStore.getThesis("thesis-300750");
    assert.equal(thesis?.lastUpdated, "2026-04-10");
    assert.equal(thesis?.currentVersionNo, 2);

    const dailySnapshots = checkStore.db
      .prepare("SELECT COUNT(*) AS count FROM position_daily_snapshots WHERE trade_date = ?")
      .get("2026-04-10") as { count: number };
    assert.equal(dailySnapshots.count, 1);
  } finally {
    checkStore.close();
  }

  const sheetMarkdown = await fs.readFile(result.sheetMarkdownPath, "utf8");
  assert.match(sheetMarkdown, /Approval Record/);
  const thesisMarkdown = await fs.readFile(
    path.join(investmentRoot, "knowledge/companies/300750-CATL/thesis.md"),
    "utf8",
  );
  assert.match(thesisMarkdown, /Latest Decision 2026-04-10/);

  await fs.rm(tempRoot, { recursive: true, force: true });
});
