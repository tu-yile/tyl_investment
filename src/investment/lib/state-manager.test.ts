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
import { resolveInvestmentRuntimePathsForEnv } from "../runtime/paths.js";
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

async function withInvestmentEnv<T>(env: "prod" | "test", work: () => Promise<T>): Promise<T> {
  const previous = process.env.INVESTMENT_ENV;
  process.env.INVESTMENT_ENV = env;
  try {
    return await work();
  } finally {
    if (previous === undefined) {
      delete process.env.INVESTMENT_ENV;
    } else {
      process.env.INVESTMENT_ENV = previous;
    }
  }
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
    store.upsertPosition({
      portfolioId: "main-portfolio",
      ticker: "300750",
      name: "宁德时代",
      industryId: "power-equipment",
      industryName: "电力设备与储能",
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
    sheetItems: [
      {
        bucket: "required",
        ref: "position:300750",
        action: "reduce",
        weightChange: -1,
        confidence: 0.8,
      },
      {
        bucket: "watch",
        ref: "watch:跟踪储能订单兑现",
      },
    ],
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
    sheetItems: [
      {
        bucket: "required",
        ref: "position:300750",
        action: "reduce",
        weightChange: -1,
        confidence: 0.8,
      },
    ],
  });

  const checkStore = new InvestmentStore({ dbPath });
  try {
    const updatedPosition = checkStore.listRuntimePositions("main-portfolio")[0];
    assert.equal(updatedPosition?.currentWeight, 3);
  } finally {
    checkStore.close();
  }

  const sheetMarkdown = await fs.readFile(result.sheetMarkdownPath, "utf8");
  assert.match(sheetMarkdown, /Approval Record/);
  const thesisMarkdown = await fs.readFile(
    path.join(investmentRoot, "knowledge/companies/300750-CATL/thesis.md"),
    "utf8",
  );
  assert.match(thesisMarkdown, /last_updated: 2026-04-10/);
  assert.match(thesisMarkdown, /Latest Decision 2026-04-10/);

  await fs.rm(tempRoot, { recursive: true, force: true });
});

test("persistDailyDraft writes workflow output into the test runtime tree", async () => {
  await withInvestmentEnv("test", async () => {
    const { tempRoot, investmentRoot, dbPath } = await createTempInvestmentRoot();
    const testPaths = resolveInvestmentRuntimePathsForEnv(tempRoot, "test");

    const store = new InvestmentStore({ dbPath });
    try {
      store.upsertPortfolio({
        portfolioId: "main-portfolio",
        name: "主组合",
        strategyStyle: "主动多头",
        marketScope: "A股",
        holdingPeriod: "中线",
      });
      store.createWorkflowRun({
        workflowRunId: "run-test",
        workflowId: "daily-position-decision",
        portfolioId: "main-portfolio",
        runDate: "2026-04-11",
        triggerType: "manual",
        status: "running",
      });
    } finally {
      store.close();
    }

    const result = await persistDailyDraft(investmentRoot, {
      workflowRunId: "run-test",
      runDate: "2026-04-11",
      marketAttitude: "中性偏积极",
      riskGate: {
        decision: "pass",
        alerts: ["测试环境允许执行"],
        notToDo: [],
      },
      sheetItems: [
        {
          bucket: "hold",
          ref: "position:300750",
          action: "hold",
          weightChange: 0,
          confidence: 0.75,
        },
      ],
      dailyOperationSheetBody: "## 测试环境\n- 验证输出路径",
    });

    assert.equal(
      result.outputMarkdownPath,
      path.join(testPaths.outputRoot, "daily", "2026-04-11", "2026-04-11-daily-operation-sheet.md"),
    );
    await assert.doesNotReject(fs.access(result.outputMarkdownPath));
    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
