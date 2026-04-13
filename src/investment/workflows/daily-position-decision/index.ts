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
      outputJsonPath: result.outputJsonPath,
      portfolioMemoryPath: result.portfolioMemoryPath,
    },
    interrupts: result.interrupts,
    approvalDecision: result.approvalDecision,
    summaryJson: {
      outputMarkdownPath: result.outputMarkdownPath,
      outputJsonPath: result.outputJsonPath,
      portfolioMemoryPath: result.portfolioMemoryPath,
    },
  };
}

export function buildDailyRunThreadId(runDate: string): string {
  return `daily-position-decision:${runDate}`;
}

export async function startDailyRunGraph(
  input: StartDailyRunInput,
  ctx?: WorkflowRuntimeContext,
): Promise<DailyRunGraphResult> {
  const { startDailyRunGraph: run } = await import("./graph.js");
  return run(input, ctx);
}

export async function resumeDailyRunApproval(
  input: ResumeDailyRunInput,
  ctx?: WorkflowRuntimeContext,
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
  markdownPath: "workflows/daily-position-decision.md",
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
