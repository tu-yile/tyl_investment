import path from "node:path";
import { ensureDir, writeJson, writeText } from "./filesystem.js";
import {
  indexBy,
  loadCandidates,
  loadIndustries,
  loadMarketContext,
  loadPendingItems,
  loadPositions,
  loadRules,
  loadTheses,
} from "./loaders.js";
import { stringifyMarkdownDocument } from "./frontmatter.js";
import type {
  CandidateAssessment,
  DailyRunResult,
  IndustryRecord,
  PositionRecord,
  PositionUpdateCard,
  RiskGateResult,
  RulesConfig,
  ThesisRecord,
} from "../types.js";

// Deprecated: the active daily runtime now reads SQLite state through
// `workflows/daily-position-decision` and keeps this heuristic implementation
// only as a rendering/reference fallback during the migration period.

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

// 这里不是训练模型，而是把 thesis、行业和风险标签压成一个可比较的工作分数。
// v1 先用透明规则打分，后面再替换成更细的 agent 输出或统计模型。
export function makeConfidence(thesis: ThesisRecord, industry: IndustryRecord): number {
  let score = thesis.confidenceBase;

  if (thesis.status === "strengthened") {
    score += 0.06;
  }
  if (thesis.status === "weakened") {
    score -= 0.08;
  }
  if (thesis.status === "broken") {
    score += 0.1;
  }
  if (thesis.catalystStrength === "strong") {
    score += 0.05;
  }
  if (thesis.catalystStrength === "none") {
    score -= 0.03;
  }
  if (thesis.valuationView === "cheap") {
    score += 0.04;
  }
  if (thesis.valuationView === "rich") {
    score -= 0.07;
  }
  if (thesis.riskLevel === "high") {
    score -= 0.12;
  }
  if (industry.currentView === "positive") {
    score += 0.03;
  }
  if (industry.currentView === "negative") {
    score -= 0.08;
  }

  return round(clamp(score, 0.05, 0.95));
}

export function describeWhyNow(thesis: ThesisRecord, industry: IndustryRecord): string {
  const base = thesis.sections["Core Claim"] ?? "";
  return `${industry.name} 当前行业视角为 ${industry.currentView}，最近变化为 ${industry.recentChange}；${base.slice(0, 60)}...`;
}

// 单票重评遵循你设定的基础动作规则：
// thesis 弱化先减，thesis 强化且估值可接受才考虑加，没催化默认持有。
export function evaluatePosition(
  position: PositionRecord,
  thesis: ThesisRecord,
  industry: IndustryRecord,
  rules: RulesConfig,
): PositionUpdateCard {
  const confidence = makeConfidence(thesis, industry);
  let action = "hold";
  let todayView = "继续持有";
  let suggestedWeightChange = 0;
  let priority = "medium";

  if (thesis.status === "broken") {
    action = "exit";
    todayView = "thesis 已破坏，建议退出";
    suggestedWeightChange = -position.weight;
    priority = "critical";
  } else if (thesis.status === "weakened" && thesis.riskLevel === "high") {
    action = "reduce";
    todayView = "thesis 弱化且风险偏高，建议减仓";
    suggestedWeightChange = -Math.min(2, position.weight);
    priority = "high";
  } else if (
    thesis.status === "strengthened" &&
    thesis.riskLevel !== "high" &&
    ["okay", "cheap"].includes(thesis.valuationView) &&
    position.weight < rules.singleNameRegularCap
  ) {
    action = confidence >= rules.clearActionThreshold ? "add" : "conditional_add";
    todayView = action === "add" ? "thesis 强化，可明确加仓" : "thesis 强化，可条件性加仓";
    suggestedWeightChange = 1;
    priority = "high";
  } else if (thesis.status === "unchanged" && thesis.catalystStrength === "none") {
    action = "hold";
    todayView = "thesis 未变化且缺少催化，默认持有";
    priority = "medium";
  } else if (confidence < rules.conditionalActionThreshold) {
    action = "observe";
    todayView = "置信度不足，仅建议观察";
    priority = "low";
  }

  return {
    ticker: position.ticker,
    name: position.name,
    thesisStatus: thesis.status,
    todayView,
    suggestedWeightChange: round(suggestedWeightChange),
    confidence,
    whyNow: describeWhyNow(thesis, industry),
    riskFlags: [...thesis.monitoringFlags, ...industry.watchpoints].slice(0, 4),
    action,
    priority,
    score: confidence,
  };
}

// 候选池评估暂时只回答“值不值得进入替代排序”，不直接生成强制买入动作。
export function evaluateCandidate(
  candidate: { ticker: string; name: string; targetEntryWeight: number },
  thesis: ThesisRecord,
  industry: IndustryRecord,
): CandidateAssessment {
  const confidence = makeConfidence(thesis, industry);
  const action =
    thesis.status === "strengthened" && confidence >= 0.7 ? "watch_for_swap" : "watch_only";

  return {
    ticker: candidate.ticker,
    name: candidate.name,
    score: confidence,
    confidence,
    action,
    whyNow: `${candidate.name} 所属行业 ${industry.name} 当前为 ${industry.currentView}，可以作为候选替代排序对象。`,
  };
}

// 风险闸门只做组合级约束，不重新发明单票判断。
// 它的职责是踩刹车，而不是替 CIO 做最终排序。
export function evaluateRiskGate(
  positions: PositionRecord[],
  updates: PositionUpdateCard[],
  rules: RulesConfig,
): RiskGateResult {
  const sectorWeights = new Map<string, number>();
  const alerts: string[] = [];
  const notToDo: string[] = [];

  for (const position of positions) {
    const matchedUpdate = updates.find((update) => update.ticker === position.ticker);
    const nextWeight = round(position.weight + (matchedUpdate?.suggestedWeightChange ?? 0));
    const total = sectorWeights.get(position.industryId) ?? 0;
    sectorWeights.set(position.industryId, total + nextWeight);
  }

  let decision: RiskGateResult["decision"] = "pass";

  for (const update of updates) {
    if (Math.abs(update.suggestedWeightChange) >= rules.largeTradeThreshold && update.confidence < rules.clearActionThreshold) {
      decision = "pass_with_limit";
      alerts.push(`${update.ticker} 属于大幅操作但置信度未达明确动作阈值`);
      notToDo.push(`未经人工强化确认，不要对 ${update.ticker} 做大幅动作`);
    }
  }

  for (const [industryId, totalWeight] of sectorWeights.entries()) {
    if (totalWeight > rules.singleSectorCap) {
      decision = totalWeight > rules.singleSectorCap + 2 ? "reject" : "pass_with_limit";
      alerts.push(`${industryId} 预计行业权重 ${round(totalWeight)}% 超过上限 ${rules.singleSectorCap}%`);
      notToDo.push(`不要让 ${industryId} 行业仓位突破上限`);
    }
  }

  if (alerts.length === 0) {
    alerts.push("当前组合调整方案未触发硬性风险否决。");
  }
  if (notToDo.length === 0) {
    notToDo.push("不要在缺乏新增催化的标的上做无效交易。");
  }

  return { decision, alerts, notToDo };
}

export function renderUpdateCard(runDate: string, update: PositionUpdateCard): string {
  // Position Update Card 是最适合人工逐票复核的中间文档，所以单独写文件。
  return stringifyMarkdownDocument(
    {
      kind: "position_update_card",
      run_date: runDate,
      ticker: update.ticker,
      thesis_status: update.thesisStatus,
      today_view: update.todayView,
      suggested_weight_change: update.suggestedWeightChange,
      confidence: update.confidence,
      action: update.action,
      priority: update.priority,
    },
    [
      "## Why Now",
      update.whyNow,
      "",
      "## Risk Flags",
      ...update.riskFlags.map((flag) => `- ${flag}`),
    ].join("\n"),
  );
}

export function renderOperationSheet(result: Omit<DailyRunResult, "outputMarkdownPath" | "outputJsonPath">): string {
  // 最终操作单保持“人读优先”，因此直接渲染成接近投委会摘要的 Markdown。
  const requiredBlock =
    result.requiredActions.length === 0
      ? "- 暂无必须动作"
      : result.requiredActions.map((item) => `- ${item.name}(${item.ticker}): ${item.todayView}，建议变动 ${item.suggestedWeightChange}% ，置信度 ${item.confidence}`).join("\n");

  const optionalBlock =
    result.optionalActions.length === 0
      ? "- 暂无可选动作"
      : result.optionalActions
          .map((item) =>
            "todayView" in item
              ? `- ${item.name}(${item.ticker}): ${item.todayView}，置信度 ${item.confidence}`
              : `- ${item.name}(${item.ticker}): ${item.whyNow}，置信度 ${item.confidence}`,
          )
          .join("\n");

  const holdBlock =
    result.continueHolding.length === 0
      ? "- 暂无默认持有项"
      : result.continueHolding.map((item) => `- ${item.name}(${item.ticker}): ${item.todayView}`).join("\n");

  return stringifyMarkdownDocument(
    {
      kind: "daily_operation_sheet",
      run_date: result.runDate,
      status: "draft",
      risk_gate: result.riskGate.decision,
      market_attitude: result.marketAttitude,
    },
    [
      "## 今日市场态度",
      result.marketAttitude,
      "",
      "## 必须动作",
      requiredBlock,
      "",
      "## 可选动作",
      optionalBlock,
      "",
      "## 继续持有",
      holdBlock,
      "",
      "## 风险提示",
      ...result.riskGate.alerts.map((alert) => `- ${alert}`),
      "",
      "## 重点观察名单",
      ...result.focusWatchlist.map((item) => `- ${item}`),
      "",
      "## 今日不要做的事",
      ...result.riskGate.notToDo.map((item) => `- ${item}`),
    ].join("\n"),
  );
}

export async function runDailyWorkflow(root: string, runDate: string): Promise<DailyRunResult> {
  // 每日流先把状态、知识和规则一次性加载完，后续节点都基于同一份快照运行。
  const [positions, candidates, theses, industries, rules, marketContext, pendingItems] = await Promise.all([
    loadPositions(root),
    loadCandidates(root),
    loadTheses(root),
    loadIndustries(root),
    loadRules(root),
    loadMarketContext(root),
    loadPendingItems(root),
  ]);

  const thesisMap = indexBy(theses, (item) => item.thesisId);
  const industryMap = indexBy(industries, (item) => item.industryId);

  // 节点 3：持仓逐票重评。
  const positionUpdates = positions.map((position) => {
    const thesis = thesisMap.get(position.thesisId);
    const industry = industryMap.get(position.industryId);
    if (!thesis || !industry) {
      throw new Error(`Missing thesis or industry for position ${position.ticker}`);
    }
    return evaluatePosition(position, thesis, industry, rules);
  });

  // 节点 4：候选池替代评估。
  const candidateAssessments = candidates.map((candidate) => {
    const thesis = thesisMap.get(candidate.thesisId);
    const industry = industryMap.get(candidate.industryId);
    if (!thesis || !industry) {
      throw new Error(`Missing thesis or industry for candidate ${candidate.ticker}`);
    }
    return evaluateCandidate(candidate, thesis, industry);
  });

  // v1 的替代逻辑很直接：
  // 找出当前最弱持仓，再看候选池里是否存在显著更优的替代对象。
  const weakestPosition = [...positionUpdates].sort((left, right) => left.score - right.score)[0];
  const optionalCandidateSwaps = candidateAssessments.filter(
    (candidate) => Boolean(weakestPosition && candidate.score - weakestPosition.score >= rules.replacementScoreGap),
  );

  // 节点 5 到 7：风险闸门、动作分层、市场态度汇总。
  const riskGate = evaluateRiskGate(positions, positionUpdates, rules);
  const requiredActions = positionUpdates.filter(
    (item) => ["add", "reduce", "exit"].includes(item.action) && item.confidence >= rules.clearActionThreshold,
  );
  const optionalActions = [
    ...positionUpdates.filter((item) => item.action === "conditional_add" || item.action === "observe"),
    ...optionalCandidateSwaps,
  ];
  const continueHolding = positionUpdates.filter((item) => item.action === "hold");
  const focusWatchlist = [...new Set([...pendingItems, ...candidateAssessments.map((item) => item.name)])];

  const marketAttitude = `市场态度为 ${marketContext.marketTone}；政策倾向 ${marketContext.policyBias}，流动性视角 ${marketContext.liquidityView}， headline risk 为 ${marketContext.headlineRisk}。`;

  const dailyDir = path.join(root, "output/daily", runDate);
  const cardsDir = path.join(dailyDir, "position-update-cards");
  await ensureDir(cardsDir);

  // 中间卡和最终操作单都落盘，便于人工审阅和后续状态写回。
  for (const update of positionUpdates) {
    await writeText(path.join(cardsDir, `${update.ticker}.md`), renderUpdateCard(runDate, update));
  }

  const partialResult = {
    runDate,
    marketAttitude,
    positionUpdates,
    candidateAssessments,
    requiredActions,
    optionalActions,
    continueHolding,
    focusWatchlist,
    riskGate,
  };

  const outputMarkdownPath = path.join(dailyDir, `${runDate}-daily-operation-sheet.md`);
  const outputJsonPath = path.join(dailyDir, `${runDate}-daily-operation-sheet.json`);

  await writeText(outputMarkdownPath, renderOperationSheet(partialResult));
  await writeJson(outputJsonPath, partialResult);

  return {
    ...partialResult,
    outputMarkdownPath,
    outputJsonPath,
  };
}
