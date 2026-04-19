import type { AgentId, ArtifactScopeType, ArtifactType } from "../agents/types.js";

export type WorkflowId =
  | "daily-position-decision"
  | "emergency-reassessment"
  | "post-close-update";

export type WorkflowImplementationStatus = "active" | "planned";

export type WorkflowExecutionStatus = "running" | "awaiting_approval" | "completed" | "failed";

export type WorkflowTriggerType = "manual" | "scheduled" | "event_driven";

export interface WorkflowMetadata {
  workflowId: WorkflowId;
  name: string;
  outputName: string;
  priority: string;
  primaryTrigger?: string;
  rerunTrigger?: string;
  trigger?: string;
  objective: string;
  steps: string[];
}

export interface WorkflowExecutionArtifacts {
  outputMarkdownPath?: string;
  actionLogPath?: string;
  portfolioMemoryPath?: string;
}

export interface WorkflowApprovalDecision {
  decision: string;
  reviewer: string;
  notes: string;
  reviewedAt: string;
}

export interface WorkflowExecutionResult {
  workflowId: WorkflowId;
  status: WorkflowExecutionStatus;
  threadId: string;
  runDate: string;
  artifacts: WorkflowExecutionArtifacts;
  interrupts?: Array<{ id: string; value: unknown }>;
  approvalDecision?: WorkflowApprovalDecision;
  summaryJson?: unknown;
}

export interface WorkflowAgentRunHooks {
  onAgentRunStart?: (args: {
    workflowRunId: string;
    agentId: string;
    scopeType?: string;
    scopeKey?: string;
    inputSummaryJson?: unknown;
  }) => Promise<string | void>;
  onAgentRunFinish?: (args: {
    agentRunId?: string;
    workflowRunId: string;
    agentId: string;
    status: string;
    outputSummaryJson?: unknown;
    errorMessage?: string | null;
  }) => Promise<void>;
  onAgentArtifact?: (args: {
    agentRunId?: string;
    workflowRunId: string;
    agentId: string;
    artifactType: ArtifactType;
    scopeType?: ArtifactScopeType;
    scopeKey?: string;
    reportMd: string;
    signalsJson?: unknown;
    summaryJson?: unknown;
  }) => Promise<{ artifactId: string; reportPath: string } | void>;
}

export interface WorkflowRuntimeContext extends WorkflowAgentRunHooks {
  repoRoot: string;
  investmentRoot: string;
  workflowId: WorkflowId;
  workflowRunId: string;
  runDate: string;
  threadId: string;
  triggerType: WorkflowTriggerType;
  startedAt: string;
  workflowMetadata: WorkflowMetadata;
}

export interface WorkflowStartInput {
  investmentRoot: string;
  runDate: string;
  threadId?: string;
  triggerType?: WorkflowTriggerType;
}

export interface WorkflowResumeInput {
  investmentRoot: string;
  threadId: string;
  runDate?: string;
}

export interface WorkflowDefinition<
  TStartInput extends WorkflowStartInput = WorkflowStartInput,
  TResumeInput extends WorkflowResumeInput = WorkflowResumeInput,
  TResult extends WorkflowExecutionResult = WorkflowExecutionResult,
> {
  id: WorkflowId;
  name: string;
  outputName: string;
  implementationStatus: WorkflowImplementationStatus;
  priority: string;
  primaryTrigger?: string;
  rerunTrigger?: string;
  trigger?: string;
  objective: string;
  steps: string[];
  agentDependencies: AgentId[];
  supportsResume: boolean;
  buildThreadId(input: TStartInput): string;
  start(input: TStartInput & { threadId: string }, ctx: WorkflowRuntimeContext): Promise<TResult>;
  resume?(input: TResumeInput & { runDate: string }, ctx: WorkflowRuntimeContext): Promise<TResult>;
}

export interface WorkflowCatalogItem {
  id: WorkflowId;
  implementationStatus: WorkflowImplementationStatus;
  supportsResume: boolean;
  metadata: WorkflowMetadata;
}

export type StartWorkflowRequest<
  TStartInput extends WorkflowStartInput = WorkflowStartInput,
> = TStartInput & {
  workflowId: WorkflowId;
};

export type ResumeWorkflowRequest<
  TResumeInput extends WorkflowResumeInput = WorkflowResumeInput,
> = TResumeInput & {
  workflowId: WorkflowId;
};
