import path from "node:path";
import {
  Annotation,
  Command,
  END,
  START,
  StateGraph,
  interrupt,
} from "@langchain/langgraph";
import { SqliteSaver } from "@langchain/langgraph-checkpoint-sqlite";
import { createAgentExecutionContext } from "../../agents/runtime.js";
import { runRegisteredAgent } from "../../agents/registry.js";
import { applyApprovalWriteback, persistDailyDraft } from "../../lib/state-manager.js";
import { resolveLangGraphCheckpointPath } from "../../graph/checkpoint-config.js";
import {
  DEFAULT_PORTFOLIO_ID,
  loadRuntimeCandidates,
  loadRuntimeIndustries,
  loadRuntimeMarketContext,
  loadRuntimePendingItems,
  loadRuntimePositions,
  loadRuntimeRules,
  loadRuntimeTheses,
} from "../../storage/runtime-state.js";
import type { WorkflowRuntimeContext } from "../types.js";
import type {
  ApprovalDecision,
  ApprovalPacket,
  CollectionScopeType,
  CollectionSubject,
  DailyPrivateState,
  DailyRunArtifacts,
  DailyRunAnalysis,
  DailyRunCollected,
  DailyRunDecision,
  DailyRunGraphContext,
  DailyRunGraphResult,
  DailyRunGraphState,
  DailyRunNodeStatus,
  DailyRunRuntimeState,
  DailySharedState,
  ResumeDailyRunInput,
  SourceType,
  StartDailyRunInput,
} from "./types.js";

const DailyRunGraphAnnotation = Annotation.Root({
  context: Annotation<DailyRunGraphContext>(),
  shared: Annotation<DailySharedState>(),
  privateState: Annotation<DailyPrivateState>(),
});

function nowIso(): string {
  return new Date().toISOString();
}

function previousTradingWindow(runDate: string): { start: string; end: string } {
  const end = `${runDate}T09:00:00+08:00`;
  const base = new Date(`${runDate}T00:00:00+08:00`);
  base.setUTCDate(base.getUTCDate() - 1);
  const year = base.getUTCFullYear();
  const month = String(base.getUTCMonth() + 1).padStart(2, "0");
  const day = String(base.getUTCDate()).padStart(2, "0");
  return {
    start: `${year}-${month}-${day}T15:00:00+08:00`,
    end,
  };
}

function buildCollectionSubjects(sharedState: Omit<DailySharedState, "collectionScope">): CollectionSubject[] {
  const marketSubjects: CollectionSubject[] = [
    {
      id: "market-overview",
      label: "A股市场",
      level: "market",
      keywords: ["A股", "沪深股市", "中国市场", ...sharedState.marketContext.priorityWatchpoints],
    },
  ];

  const industrySubjects = sharedState.industries.map((industry) => ({
    id: `industry:${industry.industryId}`,
    label: industry.name,
    level: "industry" as const,
    keywords: [industry.name, ...industry.keySignals.slice(0, 2)],
    industryId: industry.industryId,
  }));

  const positionSubjects = sharedState.positions.map((position) => ({
    id: `position:${position.ticker}`,
    label: position.name,
    level: "company" as const,
    keywords: [position.name, position.ticker],
    ticker: position.ticker,
    industryId: position.industryId,
  }));

  const candidateSubjects = sharedState.candidates.map((candidate) => ({
    id: `candidate:${candidate.ticker}`,
    label: candidate.name,
    level: "company" as const,
    keywords: [candidate.name, candidate.ticker],
    ticker: candidate.ticker,
    industryId: candidate.industryId,
  }));

  return [...marketSubjects, ...industrySubjects, ...positionSubjects, ...candidateSubjects];
}

function emptySharedState(): DailySharedState {
  return {
    positions: [],
    candidates: [],
    theses: [],
    industries: [],
    rules: {
      clearActionThreshold: 0,
      conditionalActionThreshold: 0,
      singleNameRegularCap: 0,
      singleNameCoreCap: 0,
      singleSectorCap: 0,
      largeTradeThreshold: 0,
      replacementScoreGap: 0,
    },
    marketContext: {
      asOf: "",
      marketTone: "neutral",
      policyBias: "neutral",
      liquidityView: "balanced",
      headlineRisk: "medium",
      priorityWatchpoints: [],
      notes: "",
    },
    pendingItems: [],
    collectionScope: {
      timeWindow: { start: "", end: "" },
      scopes: ["market", "positions", "candidates"],
      subjects: [],
      sourceTypes: ["news", "announcements"],
    },
  };
}

function emptyCollected(): DailyRunCollected {
  return {
    informationEvents: [],
    coverageSummary: [],
    sourceLog: [],
  };
}

function emptyAnalysis(): DailyRunAnalysis {
  return {
    macroRiskFlags: [],
    industryViews: [],
    industryRiskFlags: [],
    companyViews: [],
    positionUpdates: [],
    thesisDeltas: [],
    bearCaseViews: [],
    errorConditions: [],
    disconfirmingSignals: [],
    candidateAssessments: [],
    replacementRanking: [],
    portfolioActionProposals: [],
    riskAlerts: [],
    riskLimits: [],
    requiredActions: [],
    optionalActions: [],
    continueHolding: [],
    focusWatchlist: [],
  };
}

function emptyDecision(): DailyRunDecision {
  return {};
}

function emptyArtifacts(): DailyRunArtifacts {
  return {};
}

function emptyRuntime(): DailyRunRuntimeState {
  return {
    nodeStatus: "initialized",
    errors: [],
  };
}

function emptyPrivateState(): DailyPrivateState {
  return {
    collected: emptyCollected(),
    analysis: emptyAnalysis(),
    decision: emptyDecision(),
    artifacts: emptyArtifacts(),
    runtime: emptyRuntime(),
  };
}

function withNodeStatus(
  privateState: DailyPrivateState,
  nodeStatus: DailyRunNodeStatus,
): DailyPrivateState {
  return {
    ...privateState,
    runtime: {
      ...privateState.runtime,
      nodeStatus,
    },
  };
}

function buildApprovalPacket(state: DailyRunGraphState): ApprovalPacket {
  return {
    runDate: state.context.runDate,
    threadId: state.context.threadId,
    marketAttitude: state.privateState.analysis.marketAttitude ?? "",
    riskGateDecision: state.privateState.analysis.riskGate?.decision ?? "pass",
    requiredActionsSummary: state.privateState.analysis.requiredActions.map(
      (item) => `${item.name}(${item.ticker}) ${item.action} ${item.suggestedWeightChange}%`,
    ),
    optionalActionsSummary: state.privateState.analysis.optionalActions.map((item) =>
      "todayView" in item
        ? `${item.name}(${item.ticker}) ${item.action}`
        : `${item.name}(${item.ticker}) ${item.action}`,
    ),
    riskAlerts: state.privateState.analysis.riskAlerts,
    operationSheetPath: state.privateState.artifacts.outputMarkdownPath,
  };
}

function buildFinalResult(
  state: DailyRunGraphState,
  interrupts?: Array<{ id: string; value: unknown }>,
): DailyRunGraphResult {
  return {
    status: interrupts && interrupts.length > 0 ? "awaiting_approval" : "completed",
    threadId: state.context.threadId,
    runDate: state.context.runDate,
    outputMarkdownPath: state.privateState.artifacts.outputMarkdownPath,
    outputJsonPath: state.privateState.artifacts.outputJsonPath,
    approvalDecision: state.privateState.decision.approvalDecision,
    portfolioMemoryPath: state.privateState.artifacts.portfolioMemoryPath,
    interrupts,
  };
}

function createInitialState(input: StartDailyRunInput): DailyRunGraphState {
  return {
    context: {
      investmentRoot: input.investmentRoot,
      runDate: input.runDate,
      threadId: input.threadId,
      workflowId: "daily-position-decision",
      startedAt: nowIso(),
    },
    shared: emptySharedState(),
    privateState: emptyPrivateState(),
  };
}

function createGraphConfig(threadId: string) {
  return {
    configurable: {
      thread_id: threadId,
    },
  };
}

function buildAgentContext(
  runtimeContext: WorkflowRuntimeContext | undefined,
  state: DailyRunGraphState,
  agentId: Parameters<typeof createAgentExecutionContext>[0]["agentId"],
) {
  return createAgentExecutionContext({
    agentId,
    investmentRoot: state.context.investmentRoot,
    workflowId: state.context.workflowId,
    workflowRunId: runtimeContext?.workflowRunId ?? "compat",
    runDate: state.context.runDate,
    threadId: state.context.threadId,
    onAgentRunStart: runtimeContext?.onAgentRunStart,
    onAgentRunFinish: runtimeContext?.onAgentRunFinish,
  });
}

function createDailyRunGraph(repoRoot: string, runtimeContext?: WorkflowRuntimeContext) {
  async function startNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const root = state.context.investmentRoot;
    const [positions, candidates, theses, industries, rules, marketContext, pendingItems] = await Promise.all([
      loadRuntimePositions(root, state.context.runDate, DEFAULT_PORTFOLIO_ID),
      loadRuntimeCandidates(root, DEFAULT_PORTFOLIO_ID),
      loadRuntimeTheses(root),
      loadRuntimeIndustries(root),
      loadRuntimeRules(root),
      loadRuntimeMarketContext(root),
      loadRuntimePendingItems(root, DEFAULT_PORTFOLIO_ID),
    ]);
    const baseSharedState = {
      positions,
      candidates,
      theses,
      industries,
      rules,
      marketContext,
      pendingItems,
    };
    const shared: DailySharedState = {
      ...baseSharedState,
      collectionScope: {
        timeWindow: previousTradingWindow(state.context.runDate),
        scopes: ["market", "positions", "candidates"] as CollectionScopeType[],
        subjects: buildCollectionSubjects(baseSharedState),
        sourceTypes: ["news", "announcements"] as SourceType[],
      },
    };
    return {
      shared,
      privateState: withNodeStatus(state.privateState, "initialized"),
    };
  }

  async function informationCollectorNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "information-collector",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "information-collector"),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, "information_collected"),
    };
  }

  async function macroPolicyAnalystNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "macro-policy-analyst",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "macro-policy-analyst"),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, "macro_analyzed"),
    };
  }

  async function industryAnalystNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "industry-analyst",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "industry-analyst"),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, "industry_analyzed"),
    };
  }

  async function companyAnalystNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "company-analyst",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "company-analyst"),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, "company_analyzed"),
    };
  }

  async function bearCaseAnalystNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "bear-case-analyst",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "bear-case-analyst"),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, "bear_case_analyzed"),
    };
  }

  async function portfolioManagerNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "portfolio-manager",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "portfolio-manager"),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, "portfolio_built"),
    };
  }

  async function riskOfficerNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "risk-officer",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "risk-officer"),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, "risk_checked"),
    };
  }

  async function chiefInvestmentOfficerNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "chief-investment-officer",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "chief-investment-officer"),
    );

    const riskGate = nextPrivateState.analysis.riskGate ?? { decision: "pass", alerts: [], notToDo: [] };
    const draftResult = await persistDailyDraft(state.context.investmentRoot, {
      workflowRunId: runtimeContext?.workflowRunId ?? "compat",
      runDate: state.context.runDate,
      portfolioId: DEFAULT_PORTFOLIO_ID,
      marketAttitude: nextPrivateState.analysis.marketAttitude ?? "",
      riskGate,
      positionUpdates: nextPrivateState.analysis.positionUpdates,
      candidateAssessments: nextPrivateState.analysis.candidateAssessments,
      requiredActions: nextPrivateState.analysis.requiredActions,
      optionalActions: nextPrivateState.analysis.optionalActions,
      continueHolding: nextPrivateState.analysis.continueHolding,
      focusWatchlist: nextPrivateState.analysis.focusWatchlist,
      dailyOperationSheetBody: nextPrivateState.decision.dailyOperationSheet ?? "",
    });

    const nextState: DailyRunGraphState = {
      ...state,
      shared: state.shared,
      privateState: {
        ...nextPrivateState,
        artifacts: {
          ...nextPrivateState.artifacts,
          outputMarkdownPath: draftResult.outputMarkdownPath,
          outputJsonPath: undefined,
        },
      },
    };

    return {
      privateState: withNodeStatus(
        {
          ...nextState.privateState,
          decision: {
            ...nextState.privateState.decision,
            approvalPacket: buildApprovalPacket(nextState),
          },
        },
        "sheet_prepared",
      ),
    };
  }

  async function humanApprovalNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const packet = state.privateState.decision.approvalPacket;
    if (!packet) {
      throw new Error("Missing approval packet before human approval.");
    }
    const approvalDecision = interrupt<ApprovalPacket, ApprovalDecision>(packet);
    return {
      privateState: withNodeStatus(
        {
          ...state.privateState,
          decision: {
            ...state.privateState.decision,
            approvalDecision,
          },
        },
        "awaiting_approval",
      ),
    };
  }

  async function stateWritebackNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const approvalDecision = state.privateState.decision.approvalDecision;
    if (!approvalDecision) {
      throw new Error("Missing approval decision for state writeback.");
    }
    const result = await applyApprovalWriteback(state.context.investmentRoot, {
      workflowRunId: runtimeContext?.workflowRunId ?? "compat",
      runDate: state.context.runDate,
      decision: approvalDecision.decision,
      reviewer: approvalDecision.reviewer,
      notes: approvalDecision.notes,
      portfolioId: DEFAULT_PORTFOLIO_ID,
      marketAttitude: state.privateState.analysis.marketAttitude ?? "",
      riskGate: state.privateState.analysis.riskGate ?? { decision: "pass", alerts: [], notToDo: [] },
      dailyOperationSheetBody: state.privateState.decision.dailyOperationSheet ?? "",
      requiredActions: state.privateState.analysis.requiredActions,
    });
    return {
      privateState: withNodeStatus(
        {
          ...state.privateState,
          artifacts: {
            ...state.privateState.artifacts,
            actionLogPath: result.actionLogPath,
            portfolioMemoryPath: result.portfolioMemoryPath,
          },
        },
        "writeback_completed",
      ),
    };
  }

  async function endNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    return {
      privateState: withNodeStatus(state.privateState, "completed"),
    };
  }

  const checkpointer = SqliteSaver.fromConnString(resolveLangGraphCheckpointPath(repoRoot));
  const graph = new StateGraph(DailyRunGraphAnnotation)
    .addNode("start", startNode)
    .addNode("information-collector", informationCollectorNode)
    .addNode("macro-policy-analyst", macroPolicyAnalystNode)
    .addNode("industry-analyst", industryAnalystNode)
    .addNode("company-analyst", companyAnalystNode)
    .addNode("bear-case-analyst", bearCaseAnalystNode)
    .addNode("portfolio-manager", portfolioManagerNode)
    .addNode("risk-officer", riskOfficerNode)
    .addNode("chief-investment-officer", chiefInvestmentOfficerNode)
    .addNode("human_approval", humanApprovalNode)
    .addNode("state_writeback", stateWritebackNode)
    .addNode("end", endNode)
    .addEdge(START, "start")
    .addEdge("start", "information-collector")
    .addEdge("information-collector", "macro-policy-analyst")
    .addEdge("macro-policy-analyst", "industry-analyst")
    .addEdge("industry-analyst", "company-analyst")
    .addEdge("company-analyst", "bear-case-analyst")
    .addEdge("bear-case-analyst", "portfolio-manager")
    .addEdge("portfolio-manager", "risk-officer")
    .addEdge("risk-officer", "chief-investment-officer")
    .addEdge("chief-investment-officer", "human_approval")
    .addEdge("human_approval", "state_writeback")
    .addEdge("state_writeback", "end")
    .addEdge("end", END)
    .compile({ checkpointer });
  return { graph, checkpointer };
}

async function assertAwaitingApproval(
  graph: ReturnType<typeof createDailyRunGraph>["graph"],
  threadId: string,
) {
  const state = await graph.getState(createGraphConfig(threadId));
  const isAwaiting = state.tasks.some((task) => (task.interrupts?.length ?? 0) > 0);
  if (!isAwaiting) {
    throw new Error(`Thread ${threadId} is not waiting for approval.`);
  }
}

export function buildDailyRunThreadId(runDate: string): string {
  return `daily-position-decision:${runDate}`;
}

export async function startDailyRunGraph(
  input: StartDailyRunInput,
  runtimeContext?: WorkflowRuntimeContext,
): Promise<DailyRunGraphResult> {
  const repoRoot = path.dirname(input.investmentRoot);
  const { graph, checkpointer } = createDailyRunGraph(repoRoot, runtimeContext);
  await checkpointer.getTuple(createGraphConfig(input.threadId)).catch(() => undefined);
  try {
    await checkpointer.deleteThread(input.threadId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("no such table")) {
      throw error;
    }
  }
  const result = (await graph.invoke(createInitialState(input), createGraphConfig(input.threadId))) as
    | (DailyRunGraphState & { __interrupt__?: Array<{ id: string; value: unknown }> })
    | undefined;
  const interrupts = result && "__interrupt__" in result ? result.__interrupt__ : undefined;
  const finalState = await graph.getState(createGraphConfig(input.threadId));
  return buildFinalResult(finalState.values as DailyRunGraphState, interrupts);
}

export async function resumeDailyRunApproval(
  input: ResumeDailyRunInput,
  runtimeContext?: WorkflowRuntimeContext,
): Promise<DailyRunGraphResult> {
  const repoRoot = path.dirname(input.investmentRoot);
  const { graph } = createDailyRunGraph(repoRoot, runtimeContext);
  await assertAwaitingApproval(graph, input.threadId);
  const approvalDecision: ApprovalDecision = {
    decision: input.decision === "reject" ? "reject" : "approve",
    reviewer: input.reviewer,
    notes: input.notes,
    reviewedAt: nowIso(),
  };
  const result = (await graph.invoke(
    new Command({ resume: approvalDecision }),
    createGraphConfig(input.threadId),
  )) as DailyRunGraphState;
  return buildFinalResult(result);
}
