export type Frontmatter = Record<string, unknown>;

// MarkdownDocument 是整个 investment 子系统的基础载体：
// frontmatter 给机器读，body 和 sections 给人和 agent 模板读。
export interface MarkdownDocument<T extends Frontmatter = Frontmatter> {
  path: string;
  frontmatter: T;
  body: string;
  sections: Record<string, string>;
}

// PositionRecord 对应真实组合中的持仓快照，是每日决策流的核心输入。
export interface PositionRecord {
  ticker: string;
  name: string;
  weight: number;
  costBasis: number;
  holdingDays: number;
  sector: string;
  industryId: string;
  thesisId: string;
  path: string;
}

// CandidateRecord 表示候选池中的可替代标的，用于组合层的换仓排序。
export interface CandidateRecord {
  ticker: string;
  name: string;
  targetEntryWeight: number;
  industryId: string;
  thesisId: string;
  sourceFlow: string;
  status: string;
  path: string;
}

// ThesisRecord 把公司判断结构化，便于 workflow 在每日重评时直接消费。
export interface ThesisRecord {
  thesisId: string;
  ticker: string;
  companyName: string;
  industryId: string;
  status: string;
  catalystStrength: string;
  valuationView: string;
  riskLevel: string;
  confidenceBase: number;
  lastUpdated: string;
  monitoringFlags: string[];
  path: string;
  sections: Record<string, string>;
}

// IndustryRecord 是行业知识库的运行时视图，既保留核心标签，也保留正文 section。
export interface IndustryRecord {
  industryId: string;
  name: string;
  currentView: string;
  recentChange: string;
  keySignals: string[];
  watchpoints: string[];
  path: string;
  sections: Record<string, string>;
}

// MarketContext 代表当天的市场和政策背景，用来约束 CIO 和风险视角。
export interface MarketContext {
  asOf: string;
  marketTone: string;
  policyBias: string;
  liquidityView: string;
  headlineRisk: string;
  priorityWatchpoints: string[];
  notes: string;
}

// RulesConfig 聚合了多个 Markdown 配置里的关键阈值，方便执行层统一读取。
export interface RulesConfig {
  clearActionThreshold: number;
  conditionalActionThreshold: number;
  singleNameRegularCap: number;
  singleNameCoreCap: number;
  singleSectorCap: number;
  largeTradeThreshold: number;
  replacementScoreGap: number;
}

// PositionUpdateCard 是单票重评后的标准中间产物，也是后续人工复核的重要对象。
export interface PositionUpdateCard {
  ticker: string;
  name: string;
  thesisStatus: string;
  todayView: string;
  suggestedWeightChange: number;
  confidence: number;
  whyNow: string;
  riskFlags: string[];
  action: string;
  priority: string;
  score: number;
}

// CandidateAssessment 用于候选池替代评估，和 PositionUpdateCard 一起进入组合排序。
export interface CandidateAssessment {
  ticker: string;
  name: string;
  score: number;
  confidence: number;
  action: string;
  whyNow: string;
}

// RiskGateResult 是组合级风险闸门的唯一输出，明确给出放行、限行或否决。
export interface RiskGateResult {
  decision: "pass" | "pass_with_limit" | "reject";
  alerts: string[];
  notToDo: string[];
}

// DailyRunResult 汇总每日工作流的关键输出，既写 Markdown，也落 JSON 快照。
export interface DailyRunResult {
  runDate: string;
  marketAttitude: string;
  positionUpdates: PositionUpdateCard[];
  candidateAssessments: CandidateAssessment[];
  requiredActions: PositionUpdateCard[];
  optionalActions: Array<PositionUpdateCard | CandidateAssessment>;
  continueHolding: PositionUpdateCard[];
  focusWatchlist: string[];
  riskGate: RiskGateResult;
  outputMarkdownPath: string;
  outputJsonPath: string;
}
