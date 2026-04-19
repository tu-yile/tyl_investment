import type { WorkflowAgentRunHooks, WorkflowId } from "../workflows/types.js";

export type AgentId =
  | "information-collector"
  | "macro-policy-analyst"
  | "industry-analyst"
  | "company-analyst"
  | "bear-case-analyst"
  | "portfolio-manager"
  | "risk-officer"
  | "chief-investment-officer";

export type ArtifactType =
  | "report"
  | "assessment"
  | "decision_packet"
  | "knowledge_proposal";

export type ArtifactScopeType =
  | "workflow"
  | "portfolio"
  | "ticker"
  | "industry"
  | "thesis";

export interface AgentSelectedInput {
  // contextBlocks 继续沿用当前 prompting 层的输入形态，
  // 这样本轮重构不需要改 app-server 协议和 prompt 拼装方式。
  contextBlocks: string[];
  inputSummaryJson?: unknown;
  scopeType?: string;
  scopeKey?: string;
}

export interface AgentArtifact<TSignals = undefined> {
  reportMd: string;
  signals?: TSignals;
  artifactType?: ArtifactType;
  scopeType?: ArtifactScopeType;
  scopeKey?: string;
  summaryJson?: unknown;
}

export interface StoredArtifactRef {
  artifactId: string;
  agentId: AgentId;
  artifactType: ArtifactType;
  scopeType: ArtifactScopeType;
  scopeKey: string;
  reportPath: string;
}

export interface AgentExecutionResult<TSignals = undefined> {
  rawOutput?: string;
  artifact: AgentArtifact<TSignals>;
  outputSummaryJson?: unknown;
}

export interface AgentExecutionContext extends WorkflowAgentRunHooks {
  agentId: AgentId;
  investmentRoot: string;
  workflowId: WorkflowId;
  workflowRunId: string;
  runDate: string;
  threadId: string;
}

export interface AgentDefinition<
  TSharedState,
  TPrivateState,
  TSignals = undefined,
  TSelectedInput extends AgentSelectedInput = AgentSelectedInput,
> {
  id: AgentId;
  markdownPath: string;
  buildPromptGuide(): string;
  selectInput(sharedState: TSharedState, privateState: TPrivateState): TSelectedInput;
  execute(input: TSelectedInput, ctx: AgentExecutionContext): Promise<AgentExecutionResult<TSignals>>;
  applyArtifact(artifact: AgentArtifact<TSignals>, privateState: TPrivateState): TPrivateState;
}

export interface RegisteredAgentDescriptor {
  id: AgentId;
  markdownPath: string;
}
