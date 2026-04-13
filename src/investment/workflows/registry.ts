import path from "node:path";
import type { AgentId } from "../agents/types.js";
import { validateRegisteredAgents } from "../agents/registry.js";
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
  priority: string;
  trigger?: string;
  objective: string;
  steps: string[];
  agentDependencies?: AgentId[];
}): WorkflowDefinition {
  // planned workflow 先注册到平台里，让 CLI、validate 和后续接入路径都稳定下来。
  return {
    id: args.id,
    name: args.name,
    outputName: args.outputName,
    implementationStatus: "planned",
    priority: args.priority,
    trigger: args.trigger,
    objective: args.objective,
    steps: args.steps,
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
      priority: "P0",
      trigger: "event_driven",
      objective: "在重大公告、业绩暴雷、政策突变或异常波动出现时，不等待下一交易日，直接快速重评持仓与风险暴露。",
      steps: [
        "确认触发事件",
        "定位受影响持仓和行业",
        "快速重评 thesis 和风险",
        "输出应急建议",
      ],
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
      priority: "P0",
      trigger: "15:30",
      objective: "更新持仓状态、执行结果、thesis 状态与观察项，为下一交易日提供干净状态。",
      steps: [
        "读取当日执行结果",
        "更新 position 和 thesis",
        "记录新增观察项",
        "刷新组合记忆",
      ],
      agentDependencies: [],
    }),
  );
}

function createWorkflowMetadata(definition: WorkflowDefinition): WorkflowMetadata {
  return {
    workflowId: definition.id,
    name: definition.name,
    outputName: definition.outputName,
    priority: definition.priority,
    primaryTrigger: definition.primaryTrigger,
    rerunTrigger: definition.rerunTrigger,
    trigger: definition.trigger,
    objective: definition.objective,
    steps: definition.steps,
  };
}

function validateWorkflowDefinition(definition: WorkflowDefinition): void {
  if (!definition.id.trim()) {
    throw new Error("workflow id must be non-empty");
  }
  if (!definition.name.trim()) {
    throw new Error(`workflow name must be non-empty: ${definition.id}`);
  }
  if (!definition.outputName.trim()) {
    throw new Error(`workflow outputName must be non-empty: ${definition.id}`);
  }
  if (!definition.priority.trim()) {
    throw new Error(`workflow priority must be non-empty: ${definition.id}`);
  }
  if (!definition.objective.trim()) {
    throw new Error(`workflow objective must be non-empty: ${definition.id}`);
  }
  if (definition.steps.length === 0 || definition.steps.some((step) => !step.trim())) {
    throw new Error(`workflow steps must be non-empty: ${definition.id}`);
  }
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
  validateWorkflowDefinition(definition);
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

export async function listWorkflows(): Promise<WorkflowCatalogItem[]> {
  const workflows: WorkflowCatalogItem[] = [];
  for (const definition of workflowRegistry.values()) {
    workflows.push({
      id: definition.id,
      implementationStatus: definition.implementationStatus,
      supportsResume: definition.supportsResume,
      metadata: createWorkflowMetadata(definition),
    });
  }
  return workflows;
}

export async function validateRegisteredWorkflows(investmentRoot: string): Promise<void> {
  for (const definition of workflowRegistry.values()) {
    validateWorkflowDefinition(definition);
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
  const workflowMetadata = createWorkflowMetadata(definition);
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
  const workflowMetadata = createWorkflowMetadata(definition);
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
