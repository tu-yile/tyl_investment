import path from "node:path";
import type { AgentId } from "../agents/types.js";
import { validateRegisteredAgents } from "../agents/registry.js";
import { loadMarkdown } from "../lib/loaders.js";
import { dailyPositionDecisionWorkflow } from "./daily-position-decision/index.js";
import type {
  ResumeWorkflowRequest,
  StartWorkflowRequest,
  WorkflowCatalogItem,
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowId,
  WorkflowMetadata,
  WorkflowRuntimeContext,
  WorkflowStartInput,
  WorkflowResumeInput,
  WorkflowTriggerType,
} from "./types.js";

const workflowRegistry = new Map<WorkflowId, WorkflowDefinition<any, any, any>>();

function nowIso(): string {
  return new Date().toISOString();
}

function createPlannedWorkflowDefinition(args: {
  id: WorkflowId;
  name: string;
  outputName: string;
  markdownPath: string;
  agentDependencies?: AgentId[];
}): WorkflowDefinition {
  // planned workflow 先注册到平台里，让 CLI、validate、文档校验和后续接入路径都稳定下来。
  return {
    id: args.id,
    name: args.name,
    outputName: args.outputName,
    implementationStatus: "planned",
    markdownPath: args.markdownPath,
    agentDependencies: args.agentDependencies ?? [],
    supportsResume: false,
    buildThreadId(input) {
      return `${args.id}:${input.runDate}`;
    },
    async start() {
      throw new Error(`workflow is registered but not implemented: ${args.id}`);
    },
  };
}

function registerBuiltinWorkflows(): void {
  registerWorkflow(dailyPositionDecisionWorkflow);
  registerWorkflow(
    createPlannedWorkflowDefinition({
      id: "emergency-reassessment",
      name: "持仓事件应急流",
      outputName: "应急重评单",
      markdownPath: "workflows/emergency-reassessment.md",
      agentDependencies: [
        "information-collector",
        "industry-analyst",
        "company-analyst",
        "bear-case-analyst",
        "risk-officer",
        "chief-investment-officer",
      ],
    }),
  );
  registerWorkflow(
    createPlannedWorkflowDefinition({
      id: "post-close-update",
      name: "盘后状态更新流",
      outputName: "盘后状态更新摘要",
      markdownPath: "workflows/post-close-update.md",
      agentDependencies: [],
    }),
  );
}

function expectStringValue(value: unknown, key: string, markdownPath: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Expected non-empty string field "${key}" in ${markdownPath}`);
  }
  return value.trim();
}

function parseWorkflowSteps(sectionBody: string): string[] {
  return sectionBody
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^\d+\.\s+/, "").replace(/^-\s+/, "").trim())
    .filter(Boolean);
}

async function loadWorkflowMetadata(
  investmentRoot: string,
  definition: WorkflowDefinition,
): Promise<WorkflowMetadata> {
  const markdownPath = path.join(investmentRoot, definition.markdownPath);
  const doc = await loadMarkdown(markdownPath);
  const workflowId = expectStringValue(doc.frontmatter.workflow_id, "workflow_id", markdownPath);
  const name = expectStringValue(doc.frontmatter.name, "name", markdownPath);
  const outputName = expectStringValue(doc.frontmatter.output_name, "output_name", markdownPath);
  const priority = expectStringValue(doc.frontmatter.priority, "priority", markdownPath);

  if (doc.frontmatter.kind !== "workflow") {
    throw new Error(`Expected kind=workflow in ${markdownPath}`);
  }
  if (workflowId !== definition.id) {
    throw new Error(`Workflow id mismatch for ${markdownPath}: code=${definition.id} markdown=${workflowId}`);
  }
  if (name !== definition.name) {
    throw new Error(`Workflow name mismatch for ${markdownPath}: code=${definition.name} markdown=${name}`);
  }
  if (outputName !== definition.outputName) {
    throw new Error(`Workflow output_name mismatch for ${markdownPath}: code=${definition.outputName} markdown=${outputName}`);
  }

  return {
    workflowId: definition.id,
    name,
    outputName,
    priority,
    primaryTrigger: typeof doc.frontmatter.primary_trigger === "string" ? doc.frontmatter.primary_trigger : undefined,
    rerunTrigger: typeof doc.frontmatter.rerun_trigger === "string" ? doc.frontmatter.rerun_trigger : undefined,
    trigger: typeof doc.frontmatter.trigger === "string" ? doc.frontmatter.trigger : undefined,
    objective: doc.sections["Objective"] ?? "",
    steps: parseWorkflowSteps(doc.sections["Steps"] ?? ""),
    markdownPath,
  };
}

function buildWorkflowSummary(result: WorkflowExecutionResult): Record<string, unknown> {
  return {
    workflowId: result.workflowId,
    status: result.status,
    threadId: result.threadId,
    runDate: result.runDate,
    artifacts: result.artifacts,
    interrupts: result.interrupts?.length ?? 0,
    approvalDecision: result.approvalDecision,
  };
}

function normalizeTriggerType(value: string | undefined): WorkflowTriggerType {
  if (value === "scheduled" || value === "event_driven") {
    return value;
  }
  return "manual";
}

function createRuntimeContext(args: {
  repoRoot: string;
  investmentRoot: string;
  workflowId: WorkflowId;
  workflowRunId: string;
  runDate: string;
  threadId: string;
  triggerType: WorkflowTriggerType;
  startedAt: string;
  workflowMetadata: WorkflowMetadata;
  onAgentRunStart?: WorkflowRuntimeContext["onAgentRunStart"];
  onAgentRunFinish?: WorkflowRuntimeContext["onAgentRunFinish"];
}): WorkflowRuntimeContext {
  return {
    ...args,
    onAgentRunStart: args.onAgentRunStart ?? (async () => undefined),
    onAgentRunFinish: args.onAgentRunFinish ?? (async () => undefined),
  };
}

function persistWorkflowResult(
  store: {
    updateWorkflowRunStatus(workflowRunId: string, status: string, summaryJson?: unknown): void;
    finishWorkflowRun(args: {
      workflowRunId: string;
      status: string;
      errorMessage?: string | null;
      summaryJson?: unknown;
    }): void;
  },
  workflowRunId: string,
  result: WorkflowExecutionResult,
): void {
  const summaryJson = buildWorkflowSummary(result);
  if (result.status === "awaiting_approval" || result.status === "running") {
    store.updateWorkflowRunStatus(workflowRunId, result.status, summaryJson);
    return;
  }
  store.finishWorkflowRun({
    workflowRunId,
    status: result.status,
    summaryJson,
  });
}

export function registerWorkflow(definition: WorkflowDefinition): void {
  const existing = workflowRegistry.get(definition.id);
  if (existing) {
    throw new Error(`workflow already registered: ${definition.id}`);
  }
  workflowRegistry.set(definition.id, definition);
}

export function getWorkflowDefinition(workflowId: WorkflowId): WorkflowDefinition {
  const definition = workflowRegistry.get(workflowId);
  if (!definition) {
    throw new Error(`Unknown workflow: ${workflowId}`);
  }
  return definition;
}

export async function listWorkflows(investmentRoot: string): Promise<WorkflowCatalogItem[]> {
  const workflows: WorkflowCatalogItem[] = [];
  for (const definition of workflowRegistry.values()) {
    workflows.push({
      id: definition.id,
      implementationStatus: definition.implementationStatus,
      supportsResume: definition.supportsResume,
      markdownPath: definition.markdownPath,
      metadata: await loadWorkflowMetadata(investmentRoot, definition),
    });
  }
  return workflows;
}

export async function validateRegisteredWorkflowMetadata(investmentRoot: string): Promise<void> {
  for (const definition of workflowRegistry.values()) {
    await loadWorkflowMetadata(investmentRoot, definition);
  }
  await validateRegisteredAgents(investmentRoot);
}

export async function startWorkflow<TStartInput extends WorkflowStartInput>(
  request: StartWorkflowRequest<TStartInput>,
): Promise<WorkflowExecutionResult> {
  const definition = getWorkflowDefinition(request.workflowId) as WorkflowDefinition<
    WorkflowStartInput,
    WorkflowResumeInput,
    WorkflowExecutionResult
  >;

  if (definition.implementationStatus !== "active") {
    throw new Error(`workflow is registered but not implemented: ${definition.id}`);
  }

  const repoRoot = path.dirname(request.investmentRoot);
  const workflowMetadata = await loadWorkflowMetadata(request.investmentRoot, definition);
  const threadId = request.threadId ?? definition.buildThreadId(request);
  const triggerType = request.triggerType ?? "manual";
  const startedAt = nowIso();
  const { workflowId: _workflowId, ...workflowInput } = request;
  const [{ resolveInvestmentDbPath }, { InvestmentStore }] = await Promise.all([
    import("../storage/db-config.js"),
    import("../storage/investment-store.js"),
  ]);
  const store = new InvestmentStore({
    dbPath: resolveInvestmentDbPath(repoRoot),
  });

  try {
    const workflowRunId = store.createWorkflowRun({
      workflowId: request.workflowId,
      runDate: request.runDate,
      triggerType,
      status: "running",
      summaryJson: {
        workflowId: request.workflowId,
        threadId,
        runDate: request.runDate,
        status: "running",
      },
    });
    const onAgentRunStart: WorkflowRuntimeContext["onAgentRunStart"] = async (args) => {
      return store.createAgentRun({
        workflowRunId: args.workflowRunId,
        agentId: args.agentId,
        scopeType: args.scopeType ?? null,
        scopeKey: args.scopeKey ?? null,
        status: "running",
        inputSummaryJson: args.inputSummaryJson,
      });
    };
    const onAgentRunFinish: WorkflowRuntimeContext["onAgentRunFinish"] = async (args) => {
      if (!args.agentRunId) {
        return;
      }
      store.finishAgentRun({
        agentRunId: args.agentRunId,
        status: args.status,
        outputSummaryJson: args.outputSummaryJson,
        errorMessage: args.errorMessage ?? null,
      });
    };
    const runtimeContext = createRuntimeContext({
      repoRoot,
      investmentRoot: request.investmentRoot,
      workflowId: request.workflowId,
      workflowRunId,
      runDate: request.runDate,
      threadId,
      triggerType,
      startedAt,
      workflowMetadata,
      onAgentRunStart,
      onAgentRunFinish,
    });
    const result = await definition.start(
      {
        ...workflowInput,
        threadId,
      },
      runtimeContext,
    );
    persistWorkflowResult(store, workflowRunId, result);
    return result;
  } catch (error) {
    // workflow 层统一兜住运行失败，把错误写回 workflow_runs，后续排障时不需要从日志反推。
    const workflowRun = store.findWorkflowRunByThread({
      workflowId: request.workflowId,
      threadId,
      runDate: request.runDate,
    });
    if (workflowRun) {
      store.finishWorkflowRun({
        workflowRunId: workflowRun.workflowRunId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        summaryJson: {
          workflowId: request.workflowId,
          threadId,
          runDate: request.runDate,
          status: "failed",
        },
      });
    }
    throw error;
  } finally {
    store.close();
  }
}

export async function resumeWorkflow<TResumeInput extends WorkflowResumeInput>(
  request: ResumeWorkflowRequest<TResumeInput>,
): Promise<WorkflowExecutionResult> {
  const definition = getWorkflowDefinition(request.workflowId) as WorkflowDefinition<
    WorkflowStartInput,
    WorkflowResumeInput,
    WorkflowExecutionResult
  >;

  if (definition.implementationStatus !== "active") {
    throw new Error(`workflow is registered but not implemented: ${definition.id}`);
  }
  if (!definition.supportsResume || !definition.resume) {
    throw new Error(`workflow does not support resume: ${definition.id}`);
  }

  const repoRoot = path.dirname(request.investmentRoot);
  const workflowMetadata = await loadWorkflowMetadata(request.investmentRoot, definition);
  const [{ resolveInvestmentDbPath }, { InvestmentStore }] = await Promise.all([
    import("../storage/db-config.js"),
    import("../storage/investment-store.js"),
  ]);
  const store = new InvestmentStore({
    dbPath: resolveInvestmentDbPath(repoRoot),
  });
  const { workflowId: _workflowId, ...workflowInput } = request;

  try {
    const workflowRun = store.findWorkflowRunByThread({
      workflowId: request.workflowId,
      threadId: request.threadId,
      runDate: request.runDate,
    });
    if (!workflowRun) {
      throw new Error(`No workflow run found for ${request.workflowId} and thread ${request.threadId}`);
    }

    const runDate = request.runDate ?? workflowRun.runDate;
    store.updateWorkflowRunStatus(workflowRun.workflowRunId, "running", {
      workflowId: request.workflowId,
      threadId: request.threadId,
      runDate,
      status: "running",
      resumedAt: nowIso(),
    });
    const onAgentRunStart: WorkflowRuntimeContext["onAgentRunStart"] = async (args) => {
      return store.createAgentRun({
        workflowRunId: args.workflowRunId,
        agentId: args.agentId,
        scopeType: args.scopeType ?? null,
        scopeKey: args.scopeKey ?? null,
        status: "running",
        inputSummaryJson: args.inputSummaryJson,
      });
    };
    const onAgentRunFinish: WorkflowRuntimeContext["onAgentRunFinish"] = async (args) => {
      if (!args.agentRunId) {
        return;
      }
      store.finishAgentRun({
        agentRunId: args.agentRunId,
        status: args.status,
        outputSummaryJson: args.outputSummaryJson,
        errorMessage: args.errorMessage ?? null,
      });
    };

    const runtimeContext = createRuntimeContext({
      repoRoot,
      investmentRoot: request.investmentRoot,
      workflowId: request.workflowId,
      workflowRunId: workflowRun.workflowRunId,
      runDate,
      threadId: request.threadId,
      triggerType: normalizeTriggerType(workflowRun.triggerType),
      startedAt: workflowRun.startedAt,
      workflowMetadata,
      onAgentRunStart,
      onAgentRunFinish,
    });
    const result = await definition.resume(
      {
        ...workflowInput,
        runDate,
      },
      runtimeContext,
    );
    persistWorkflowResult(store, workflowRun.workflowRunId, result);
    return result;
  } catch (error) {
    const workflowRun = store.findWorkflowRunByThread({
      workflowId: request.workflowId,
      threadId: request.threadId,
      runDate: request.runDate,
    });
    if (workflowRun) {
      store.finishWorkflowRun({
        workflowRunId: workflowRun.workflowRunId,
        status: "failed",
        errorMessage: error instanceof Error ? error.message : String(error),
        summaryJson: {
          workflowId: request.workflowId,
          threadId: request.threadId,
          runDate: request.runDate ?? workflowRun.runDate,
          status: "failed",
        },
      });
    }
    throw error;
  } finally {
    store.close();
  }
}

registerBuiltinWorkflows();
