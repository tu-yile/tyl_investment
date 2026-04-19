import type { AgentId } from "../../agents/types.js";
import type {
  CandidateRecord,
  IndustryRecord,
  MarketContext,
  PositionRecord,
  RiskGateResult,
  RulesConfig,
  ThesisRecord,
} from "../../types.js";

export type CollectionScopeType = "market" | "positions" | "candidates";
export type SourceType = "news" | "announcements";
export type EventLevel = "market" | "industry" | "company";
export type ImpactHint = "positive" | "negative" | "mixed" | "neutral";
export type IndustryStance = "positive" | "neutral" | "negative";
export type SecurityAction = "add" | "hold" | "reduce" | "exit" | "watch";
export type PortfolioAction = "add" | "hold" | "reduce" | "exit" | "watch" | "swap";
export type SheetBucket = "required" | "optional" | "hold" | "watch";

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
  subjectRef: string;
  publishedAt: string;
  source: string;
  title: string;
  summary: string;
  url: string;
  impact: ImpactHint;
  eventId?: string;
  level?: EventLevel;
  sourceType?: SourceType;
  ticker?: string;
  industryId?: string;
  marketTags?: string[];
  impactHint?: ImpactHint;
  confidence?: number;
}

export interface IndustryStanceUpdate {
  industryId: string;
  stance: IndustryStance;
}

export interface SecurityUpdate {
  ticker: string;
  thesisStatus: string;
  action: SecurityAction;
  suggestedWeightChange: number;
  confidence: number;
}

export interface PortfolioActionPlan {
  ticker: string;
  action: PortfolioAction;
  weightChange: number;
  fundingSource?: string;
  confidence: number;
}

export interface OperationSheetItem {
  bucket: SheetBucket;
  ref?: string;
  action?: string;
  weightChange?: number;
  confidence?: number;
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

export interface DailyRunDerivedState {
  marketAttitude?: string;
  macroRiskFlags: string[];
  industryStances: IndustryStanceUpdate[];
  securityUpdates: SecurityUpdate[];
  portfolioActions: PortfolioActionPlan[];
  riskGate?: RiskGateResult;
  sheetItems: OperationSheetItem[];
}

export interface DailyRunReports {
  byAgent: Partial<Record<AgentId, string>>;
}

export interface DailyRunDecision {
  dailyOperationSheet?: string;
  approvalPacket?: ApprovalPacket;
  approvalDecision?: ApprovalDecision;
}

export interface DailyRunArtifacts {
  outputMarkdownPath?: string;
  actionLogPath?: string;
  portfolioMemoryPath?: string;
}

export interface DailyRunRuntimeState {
  nodeStatus: DailyRunNodeStatus;
  errors: string[];
}

export interface DailyPrivateState {
  collected: DailyRunCollected;
  derived: DailyRunDerivedState;
  reports: DailyRunReports;
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
  actionLogPath?: string;
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
