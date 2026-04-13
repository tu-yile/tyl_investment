import type {
  CandidateAssessment,
  CandidateRecord,
  IndustryRecord,
  MarketContext,
  PositionRecord,
  PositionUpdateCard,
  RiskGateResult,
  RulesConfig,
  ThesisRecord,
} from "../../types.js";

export type CollectionScopeType = "market" | "positions" | "candidates";
export type SourceType = "news" | "announcements";
export type EventLevel = "market" | "industry" | "company";
export type ImpactHint = "positive" | "negative" | "mixed" | "neutral";

// 这些状态只服务于 daily-position-decision 内部图节点推进，
// 不对 workflow 平台层暴露，避免后续其他流程被迫继承这套中间状态。
export type DailyRunNodeStatus =
  | "initialized"
  | "information_collected"
  | "macro_analyzed"
  | "industry_analyzed"
  | "company_analyzed"
  | "bear_case_analyzed"
  | "portfolio_built"
  | "risk_checked"
  | "sheet_prepared"
  | "awaiting_approval"
  | "writeback_completed"
  | "completed"
  | "failed";

export interface TimeWindow {
  start: string;
  end: string;
}

export interface CollectionSubject {
  id: string;
  label: string;
  level: EventLevel;
  keywords: string[];
  ticker?: string;
  industryId?: string;
}

export interface SourceLogItem {
  source: string;
  sourceType: SourceType;
  query: string;
  fetchedAt: string;
  itemCount: number;
}

export interface InformationEvent {
  eventId: string;
  level: EventLevel;
  publishedAt: string;
  source: string;
  sourceType: SourceType;
  title: string;
  summary: string;
  url: string;
  ticker?: string;
  industryId?: string;
  marketTags: string[];
  impactHint: ImpactHint;
  confidence: number;
}

export interface IndustryView {
  industryId: string;
  name: string;
  stance: "positive" | "neutral" | "negative";
  summary: string;
  keyChanges: string[];
  riskFlags: string[];
  affectedTickers: string[];
}

export interface CompanyView {
  ticker: string;
  name: string;
  thesisStatus: string;
  summary: string;
  whyNow: string;
  supportingSignals: string[];
  warningSignals: string[];
  actionBias: "add" | "hold" | "reduce" | "exit" | "watch";
  confidence: number;
}

export interface ThesisDelta {
  thesisId: string;
  ticker: string;
  previousStatus?: string;
  nextStatus: string;
  changeSummary: string;
}

export interface BearCaseView {
  ticker: string;
  coreChallenge: string;
  errorConditions: string[];
  disconfirmingSignals: string[];
  severity: "medium" | "high" | "critical";
}

export interface ReplacementRankingItem {
  ticker: string;
  name: string;
  action: "keep" | "watch_for_swap" | "swap_candidate";
  score: number;
  reason: string;
}

export interface PortfolioActionProposal {
  ticker: string;
  name: string;
  action: "add" | "hold" | "reduce" | "exit" | "watch" | "swap";
  weightChange: number;
  rationale: string;
  confidence: number;
  fundingSource?: string;
  constraints: string[];
}

export interface ApprovalPacket {
  runDate: string;
  threadId: string;
  marketAttitude: string;
  riskGateDecision: RiskGateResult["decision"];
  requiredActionsSummary: string[];
  optionalActionsSummary: string[];
  riskAlerts: string[];
  operationSheetPath?: string;
}

export interface ApprovalDecision {
  decision: "approve" | "reject";
  reviewer: string;
  notes: string;
  reviewedAt: string;
}

export interface DailyRunGraphContext {
  investmentRoot: string;
  runDate: string;
  threadId: string;
  workflowId: "daily-position-decision";
  startedAt: string;
}

// shared state 只承载跨业务 agent 复用的输入快照。
// 它在 workflow 启动后基本保持只读，避免某个 agent 输出污染基础上下文。
export interface DailySharedState {
  positions: PositionRecord[];
  candidates: CandidateRecord[];
  theses: ThesisRecord[];
  industries: IndustryRecord[];
  rules: RulesConfig;
  marketContext: MarketContext;
  pendingItems: string[];
  collectionScope: {
    timeWindow: TimeWindow;
    scopes: CollectionScopeType[];
    subjects: CollectionSubject[];
    sourceTypes: SourceType[];
  };
}

export interface DailyRunCollected {
  informationEvents: InformationEvent[];
  coverageSummary: string[];
  sourceLog: SourceLogItem[];
}

export interface DailyRunAnalysis {
  marketAttitude?: string;
  macroRiskFlags: string[];
  macroTransmissionView?: string;
  industryViews: IndustryView[];
  industryRiskFlags: string[];
  companyViews: CompanyView[];
  positionUpdates: PositionUpdateCard[];
  thesisDeltas: ThesisDelta[];
  bearCaseViews: BearCaseView[];
  errorConditions: string[];
  disconfirmingSignals: string[];
  candidateAssessments: CandidateAssessment[];
  replacementRanking: ReplacementRankingItem[];
  capitalAllocationView?: string;
  portfolioActionProposals: PortfolioActionProposal[];
  riskGate?: RiskGateResult;
  riskAlerts: string[];
  riskLimits: string[];
  requiredActions: PositionUpdateCard[];
  optionalActions: Array<PositionUpdateCard | CandidateAssessment>;
  continueHolding: PositionUpdateCard[];
  focusWatchlist: string[];
}

export interface DailyRunDecision {
  finalActionFramework?: string;
  dailyOperationSheet?: string;
  approvalPacket?: ApprovalPacket;
  approvalDecision?: ApprovalDecision;
}

export interface DailyRunArtifacts {
  outputMarkdownPath?: string;
  outputJsonPath?: string;
  actionLogPath?: string;
  portfolioMemoryPath?: string;
}

export interface DailyRunRuntimeState {
  nodeStatus: DailyRunNodeStatus;
  errors: string[];
}

// private state 只承载 daily workflow 自己的中间结果和最终产物，
// 其他 workflow 不需要知道这些字段，更不应该被迫继承它们。
export interface DailyPrivateState {
  collected: DailyRunCollected;
  analysis: DailyRunAnalysis;
  decision: DailyRunDecision;
  artifacts: DailyRunArtifacts;
  runtime: DailyRunRuntimeState;
}

export interface DailyRunGraphState {
  context: DailyRunGraphContext;
  shared: DailySharedState;
  privateState: DailyPrivateState;
}

export interface DailyRunGraphResult {
  status: "awaiting_approval" | "completed";
  threadId: string;
  runDate: string;
  outputMarkdownPath?: string;
  outputJsonPath?: string;
  approvalDecision?: ApprovalDecision;
  portfolioMemoryPath?: string;
  interrupts?: Array<{ id: string; value: unknown }>;
}

export interface StartDailyRunInput {
  investmentRoot: string;
  runDate: string;
  threadId: string;
}

export interface ResumeDailyRunInput {
  investmentRoot: string;
  runDate: string;
  threadId: string;
  decision: "approve" | "reject";
  reviewer: string;
  notes: string;
}
