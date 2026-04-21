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
import type { AgentId } from "../../agents/types.js";
import { createAgentExecutionContext } from "../../agents/runtime.js";
import { runRegisteredAgent } from "../../agents/registry.js";
import { applyApprovalWriteback, persistDailyDraft } from "../../lib/state-manager.js";
import { resolveLangGraphCheckpointPath } from "../../graph/checkpoint-config.js";
import {
  createDefaultMarketContext,
  DEFAULT_PORTFOLIO_ID,
  loadRuntimeIndustries,
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
  DailyRunCollected,
  DailyRunDecision,
  DailyRunDerivedState,
  DailyRunGraphContext,
  DailyRunGraphResult,
  DailyRunGraphState,
  DailyRunNodeStatus,
  DailyRunReports,
  DailyRunRuntimeState,
  DailySharedState,
  OperationSheetItem,
  ResumeDailyRunInput,
  SourceType,
  StartDailyRunInput,
} from "./types.js";

type DailyNodeId =
  | "start"
  | AgentId
  | "human_approval"
  | "state_writeback"
  | "end";

type GraphNodeRef = "__start__" | "__end__" | DailyNodeId;

const DAILY_AGENT_STAGES: Array<{
  agentId: AgentId;
  status: DailyRunNodeStatus;
}> = [
  { agentId: "information-collector", status: "information_collected" },
  { agentId: "macro-policy-analyst", status: "macro_analyzed" },
  { agentId: "industry-analyst", status: "industry_analyzed" },
  { agentId: "company-analyst", status: "company_analyzed" },
  { agentId: "bear-case-analyst", status: "bear_case_analyzed" },
  { agentId: "portfolio-manager", status: "portfolio_built" },
  { agentId: "risk-officer", status: "risk_checked" },
];

const DAILY_GRAPH_EDGES: Array<[GraphNodeRef, GraphNodeRef]> = [
  ["__start__", "start"],
  ["start", "information-collector"],
  ["information-collector", "macro-policy-analyst"],
  ["macro-policy-analyst", "industry-analyst"],
  ["industry-analyst", "company-analyst"],
  ["company-analyst", "bear-case-analyst"],
  ["bear-case-analyst", "portfolio-manager"],
  ["portfolio-manager", "risk-officer"],
  ["risk-officer", "chief-investment-officer"],
  ["chief-investment-officer", "human_approval"],
  ["human_approval", "state_writeback"],
  ["state_writeback", "end"],
  ["end", "__end__"],
];

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

  return [...marketSubjects, ...industrySubjects, ...positionSubjects];
}

function emptySharedState(): DailySharedState {
  return {
    positions: [],
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
    collectionScope: {
      timeWindow: { start: "", end: "" },
      scopes: ["market", "positions"],
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

function emptyDerived(): DailyRunDerivedState {
  return {
    macroRiskFlags: [],
    industryStances: [],
    securityUpdates: [],
    portfolioActions: [],
    sheetItems: [],
  };
}

function emptyReports(): DailyRunReports {
  return {
    byAgent: {},
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
    derived: emptyDerived(),
    reports: emptyReports(),
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

function findSecurityName(sharedState: DailySharedState, ticker: string | undefined): string | undefined {
  if (!ticker) {
    return undefined;
  }
  const position = sharedState.positions.find((item) => item.ticker === ticker);
  return position?.name;
}

function normalizeSheetRef(ref: string | undefined): string {
  if (!ref) {
    return "";
  }
  return ref.replace(/^(?:watch|position|ticker|industry):/, "").trim();
}

function extractSheetTicker(item: OperationSheetItem): string | undefined {
  if (!item.ref) {
    return undefined;
  }
  const match = item.ref.match(/^(?:position|ticker):(.+)$/);
  return match?.[1];
}

function formatWeightChange(weightChange: number | undefined): string {
  if (typeof weightChange !== "number" || Number.isNaN(weightChange) || weightChange === 0) {
    return "";
  }
  return ` ${weightChange > 0 ? "+" : ""}${weightChange}%`;
}

function summarizeSheetItem(sharedState: DailySharedState, item: OperationSheetItem): string {
  const ticker = extractSheetTicker(item);
  const name = findSecurityName(sharedState, ticker);
  const refLabel = normalizeSheetRef(item.ref);

  if (item.bucket === "watch") {
    return refLabel || "关注后续变化";
  }

  const label = ticker
    ? `${name ?? ticker}(${ticker})`
    : refLabel || "未命名动作";
  const action = item.action ?? "watch";
  return `${label} ${action}${formatWeightChange(item.weightChange)}`.trim();
}

function buildApprovalPacket(state: DailyRunGraphState): ApprovalPacket {
  const requiredActions = state.privateState.derived.sheetItems
    .filter((item) => item.bucket === "required")
    .map((item) => summarizeSheetItem(state.shared, item));
  const optionalActions = state.privateState.derived.sheetItems
    .filter((item) => item.bucket === "optional" || item.bucket === "hold")
    .map((item) => summarizeSheetItem(state.shared, item));

  return {
    runDate: state.context.runDate,
    threadId: state.context.threadId,
    marketAttitude: state.privateState.derived.marketAttitude ?? "",
    riskGateDecision: state.privateState.derived.riskGate?.decision ?? "pass",
    requiredActionsSummary: requiredActions,
    optionalActionsSummary: optionalActions,
    riskAlerts: state.privateState.derived.riskGate?.alerts ?? [],
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
    actionLogPath: state.privateState.artifacts.actionLogPath,
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
  runtimeContext: WorkflowRuntimeContext,
  state: DailyRunGraphState,
  agentId: AgentId,
) {
  return createAgentExecutionContext({
    agentId,
    investmentRoot: state.context.investmentRoot,
    workflowId: state.context.workflowId,
    workflowRunId: runtimeContext.workflowRunId,
    runDate: state.context.runDate,
    threadId: state.context.threadId,
    onAgentRunStart: runtimeContext.onAgentRunStart,
    onAgentRunFinish: runtimeContext.onAgentRunFinish,
    onAgentArtifact: runtimeContext.onAgentArtifact,
  });
}

function createDailyRunGraph(repoRoot: string, runtimeContext: WorkflowRuntimeContext) {
  async function startNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const root = state.context.investmentRoot;
    const [positions, theses, industries, rules] = await Promise.all([
      loadRuntimePositions(root, state.context.runDate, DEFAULT_PORTFOLIO_ID),
      loadRuntimeTheses(root),
      loadRuntimeIndustries(root),
      loadRuntimeRules(root),
    ]);
    const marketContext = createDefaultMarketContext(state.context.runDate);

    const baseSharedState = {
      positions,
      theses,
      industries,
      rules,
      marketContext,
    };

    const shared: DailySharedState = {
      ...baseSharedState,
      collectionScope: {
        timeWindow: previousTradingWindow(state.context.runDate),
        scopes: ["market", "positions"] as CollectionScopeType[],
        subjects: buildCollectionSubjects(baseSharedState),
        sourceTypes: ["news", "announcements"] as SourceType[],
      },
    };

    return {
      shared,
      privateState: withNodeStatus(state.privateState, "initialized"),
    };
  }

  async function createStandardAgentNode(
    state: DailyRunGraphState,
    agentId: AgentId,
    nextStatus: DailyRunNodeStatus,
  ): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      agentId,
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, agentId),
    );
    return {
      privateState: withNodeStatus(nextPrivateState, nextStatus),
    };
  }

  async function chiefInvestmentOfficerNode(state: DailyRunGraphState): Promise<Partial<DailyRunGraphState>> {
    const nextPrivateState = await runRegisteredAgent(
      "chief-investment-officer",
      state.shared,
      state.privateState,
      buildAgentContext(runtimeContext, state, "chief-investment-officer"),
    );

    const riskGate = nextPrivateState.derived.riskGate ?? {
      decision: "pass",
      alerts: [],
      notToDo: [],
    };

    const draftResult = await persistDailyDraft(state.context.investmentRoot, {
      workflowRunId: runtimeContext.workflowRunId,
      runDate: state.context.runDate,
      portfolioId: DEFAULT_PORTFOLIO_ID,
      marketAttitude: nextPrivateState.derived.marketAttitude ?? "",
      riskGate,
      sheetItems: nextPrivateState.derived.sheetItems,
      dailyOperationSheetBody: nextPrivateState.decision.dailyOperationSheet ?? "",
    });

    const nextState: DailyRunGraphState = {
      ...state,
      privateState: {
        ...nextPrivateState,
        artifacts: {
          ...nextPrivateState.artifacts,
          outputMarkdownPath: draftResult.outputMarkdownPath,
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
      workflowRunId: runtimeContext.workflowRunId,
      runDate: state.context.runDate,
      decision: approvalDecision.decision,
      reviewer: approvalDecision.reviewer,
      notes: approvalDecision.notes,
      portfolioId: DEFAULT_PORTFOLIO_ID,
      marketAttitude: state.privateState.derived.marketAttitude ?? "",
      riskGate: state.privateState.derived.riskGate ?? {
        decision: "pass",
        alerts: [],
        notToDo: [],
      },
      dailyOperationSheetBody: state.privateState.decision.dailyOperationSheet ?? "",
      sheetItems: state.privateState.derived.sheetItems,
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
  const graphBuilder = new StateGraph(DailyRunGraphAnnotation)
    .addNode("start", startNode)
    .addNode("chief-investment-officer", chiefInvestmentOfficerNode)
    .addNode("human_approval", humanApprovalNode)
    .addNode("state_writeback", stateWritebackNode)
    .addNode("end", endNode);

  for (const stage of DAILY_AGENT_STAGES) {
    (graphBuilder as any).addNode(stage.agentId, (state: DailyRunGraphState) =>
      createStandardAgentNode(state, stage.agentId, stage.status),
    );
  }

  for (const [from, to] of DAILY_GRAPH_EDGES) {
    const normalizedFrom = from === "__start__" ? START : from;
    const normalizedTo = to === "__end__" ? END : to;
    (graphBuilder as any).addEdge(normalizedFrom, normalizedTo);
  }

  const graph = graphBuilder.compile({ checkpointer });
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
  runtimeContext: WorkflowRuntimeContext,
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
  runtimeContext: WorkflowRuntimeContext,
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
