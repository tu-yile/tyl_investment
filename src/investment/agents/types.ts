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

export interface AgentSelectedInput {
  // contextBlocks 继续沿用当前 prompting 层的输入形态，
  // 这样本轮重构不需要改 app-server 协议和 prompt 拼装方式。
  contextBlocks: string[];
  inputSummaryJson?: unknown;
  scopeType?: string;
  scopeKey?: string;
}

export interface AgentExecutionResult<TResult> {
  rawOutput?: string;
  parsedResult: TResult;
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
  TResult,
  TSelectedInput extends AgentSelectedInput = AgentSelectedInput,
> {
  id: AgentId;
  markdownPath: string;
  buildContract(): string;
  selectInput(sharedState: TSharedState, privateState: TPrivateState): TSelectedInput;
  execute(input: TSelectedInput, ctx: AgentExecutionContext): Promise<AgentExecutionResult<TResult>>;
  applyResult(result: TResult, privateState: TPrivateState): TPrivateState;
}

export interface RegisteredAgentDescriptor {
  id: AgentId;
  markdownPath: string;
}
