import type {
  AgentDefinition,
  AgentExecutionContext,
  AgentId,
} from "./types.js";

// 统一的 agent 执行入口放在平台层，
// 这样 workflow 节点不需要再关心审计、错误兜底和 applyResult 细节。
export async function runAgentDefinition<
  TSharedState,
  TPrivateState,
  TResult,
>(
  definition: AgentDefinition<TSharedState, TPrivateState, TResult>,
  sharedState: TSharedState,
  privateState: TPrivateState,
  ctx: AgentExecutionContext,
): Promise<TPrivateState> {
  const selectedInput = definition.selectInput(sharedState, privateState);
  const agentRunId = await ctx.onAgentRunStart?.({
    workflowRunId: ctx.workflowRunId,
    agentId: definition.id,
    scopeType: selectedInput.scopeType,
    scopeKey: selectedInput.scopeKey,
    inputSummaryJson: selectedInput.inputSummaryJson,
  });

  try {
    const executionResult = await definition.execute(selectedInput, ctx);
    const nextPrivateState = definition.applyResult(executionResult.parsedResult, privateState);
    await ctx.onAgentRunFinish?.({
      agentRunId: typeof agentRunId === "string" ? agentRunId : undefined,
      workflowRunId: ctx.workflowRunId,
      agentId: definition.id,
      status: "completed",
      outputSummaryJson: executionResult.outputSummaryJson,
    });
    return nextPrivateState;
  } catch (error) {
    await ctx.onAgentRunFinish?.({
      agentRunId: typeof agentRunId === "string" ? agentRunId : undefined,
      workflowRunId: ctx.workflowRunId,
      agentId: definition.id,
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

export function createAgentExecutionContext(args: {
  agentId: AgentId;
  investmentRoot: string;
  workflowId: AgentExecutionContext["workflowId"];
  workflowRunId: string;
  runDate: string;
  threadId: string;
  onAgentRunStart?: AgentExecutionContext["onAgentRunStart"];
  onAgentRunFinish?: AgentExecutionContext["onAgentRunFinish"];
}): AgentExecutionContext {
  return {
    ...args,
  };
}
