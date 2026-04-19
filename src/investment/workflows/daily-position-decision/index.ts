import type { DailyRunGraphResult, ResumeDailyRunInput, StartDailyRunInput } from "./types.js";
import type {
  WorkflowDefinition,
  WorkflowExecutionResult,
  WorkflowRuntimeContext,
} from "../types.js";

function toWorkflowExecutionResult(
  result: DailyRunGraphResult,
): WorkflowExecutionResult {
  return {
    workflowId: "daily-position-decision",
    status: result.status,
    threadId: result.threadId,
    runDate: result.runDate,
    artifacts: {
      outputMarkdownPath: result.outputMarkdownPath,
      actionLogPath: result.actionLogPath,
      portfolioMemoryPath: result.portfolioMemoryPath,
    },
    interrupts: result.interrupts,
    approvalDecision: result.approvalDecision,
    summaryJson: {
      outputMarkdownPath: result.outputMarkdownPath,
      actionLogPath: result.actionLogPath,
      portfolioMemoryPath: result.portfolioMemoryPath,
    },
  };
}

export function buildDailyRunThreadId(runDate: string): string {
  return `daily-position-decision:${runDate}`;
}

export async function startDailyRunGraph(
  input: StartDailyRunInput,
  ctx: WorkflowRuntimeContext,
): Promise<DailyRunGraphResult> {
  const { startDailyRunGraph: run } = await import("./graph.js");
  return run(input, ctx);
}

export async function resumeDailyRunApproval(
  input: ResumeDailyRunInput,
  ctx: WorkflowRuntimeContext,
): Promise<DailyRunGraphResult> {
  const { resumeDailyRunApproval: resume } = await import("./graph.js");
  return resume(input, ctx);
}

export const dailyPositionDecisionWorkflow: WorkflowDefinition<
  StartDailyRunInput,
  ResumeDailyRunInput,
  WorkflowExecutionResult
> = {
  id: "daily-position-decision",
  name: "每日持仓决策流",
  outputName: "今日持仓操作单",
  implementationStatus: "active",
  priority: "P0",
  primaryTrigger: "07:45",
  rerunTrigger: "08:55",
  objective: "在每个交易日盘前形成一份统一口径的《今日持仓操作单》，覆盖市场态度、组合总动作、个股动作清单、风险提示和重点观察名单。",
  steps: [
    "交易日与系统可运行检查",
    "状态快照加载",
    "隔夜信息扫描",
    "持仓逐票重评",
    "候选池替代评估",
    "组合级风险闸门",
    "CIO 汇总与冲突消解",
    "生成今日持仓操作单",
    "人工确认",
    "执行结果写回",
  ],
  agentDependencies: [
    "information-collector",
    "macro-policy-analyst",
    "industry-analyst",
    "company-analyst",
    "bear-case-analyst",
    "portfolio-manager",
    "risk-officer",
    "chief-investment-officer",
  ],
  supportsResume: true,
  buildThreadId(input): string {
    return buildDailyRunThreadId(input.runDate);
  },
  async start(input: StartDailyRunInput, ctx: WorkflowRuntimeContext): Promise<WorkflowExecutionResult> {
    return toWorkflowExecutionResult(await startDailyRunGraph(input, ctx));
  },
  async resume(input: ResumeDailyRunInput, ctx: WorkflowRuntimeContext): Promise<WorkflowExecutionResult> {
    return toWorkflowExecutionResult(await resumeDailyRunApproval(input, ctx));
  },
};
