import { runAgentDefinition } from "../agents/runtime.js";
import type {
  AgentDefinition,
  AgentExecutionContext,
  AgentExecutionResult,
  AgentSelectedInput,
} from "../agents/types.js";
import { stringifyMarkdownDocument } from "../lib/frontmatter.js";
import type {
  CandidateAssessment,
  IndustryRecord,
  PositionUpdateCard,
  RiskGateResult,
  ThesisRecord,
} from "../types.js";
import type {
  BearCaseView,
  CollectionSubject,
  DailyPrivateState,
  DailyRunGraphState,
  DailySharedState,
  IndustryView,
  InformationEvent,
  PortfolioActionProposal,
  ReplacementRankingItem,
  SourceLogItem,
  ThesisDelta,
} from "../workflows/daily-position-decision/types.js";
import {
  buildBearCaseContract,
  buildCioContract,
  buildCompanyContract,
  buildIndustryContract,
  buildInformationCollectorContract,
  buildMacroContract,
  buildPortfolioContract,
  buildRiskContract,
} from "./contracts.js";
import {
  extractHandoff,
  extractLinesAsBullets,
  extractNamedSection,
  extractRepeatedBlocks,
  expectArray,
  expectEnum,
  expectString,
  optionalArray,
  parseConfidence,
  parseFieldBlock,
  parseNumber,
  stableEventId,
} from "./handoff-parser.js";
import { industryDigest, nowIso, runAgent, stringifyPromptContext, thesisDigest } from "./prompting.js";

interface DailyAgentSelectedInput extends AgentSelectedInput {
  contextBlocks: string[];
}

function createCompatAgentExecutionContext(
  state: DailyRunGraphState,
  agentId: AgentExecutionContext["agentId"],
): AgentExecutionContext {
  return {
    agentId,
    investmentRoot: state.context.investmentRoot,
    workflowId: state.context.workflowId,
    workflowRunId: "compat",
    runDate: state.context.runDate,
    threadId: state.context.threadId,
    onAgentRunStart: async () => undefined,
    onAgentRunFinish: async () => undefined,
  };
}

async function executeStructuredAgent<TResult>(
  agentId: AgentExecutionContext["agentId"],
  contract: string,
  input: DailyAgentSelectedInput,
  ctx: AgentExecutionContext,
  parse: (finalText: string) => TResult,
  buildOutputSummary?: (parsed: TResult) => unknown,
): Promise<AgentExecutionResult<TResult>> {
  const finalText = await runAgent(
    agentId,
    ctx.investmentRoot,
    contract,
    input.contextBlocks,
  );
  const parsedResult = parse(finalText);
  return {
    rawOutput: finalText,
    parsedResult,
    outputSummaryJson: buildOutputSummary ? buildOutputSummary(parsedResult) : undefined,
  };
}

async function executeDefinitionForParsedResult<TResult>(
  definition: AgentDefinition<DailySharedState, DailyPrivateState, TResult, DailyAgentSelectedInput>,
  state: DailyRunGraphState,
): Promise<TResult> {
  const input = definition.selectInput(state.shared, state.privateState);
  const result = await definition.execute(
    input,
    createCompatAgentExecutionContext(state, definition.id),
  );
  return result.parsedResult;
}

const informationCollectorDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    informationEvents: InformationEvent[];
    coverageSummary: string[];
    sourceLog: SourceLogItem[];
  },
  DailyAgentSelectedInput
> = {
  id: "information-collector",
  markdownPath: "agents/information-collector.md",
  buildContract: buildInformationCollectorContract,
  selectInput(sharedState): DailyAgentSelectedInput {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        subjectCount: sharedState.collectionScope.subjects.length,
        sourceTypes: sharedState.collectionScope.sourceTypes,
        timeWindow: sharedState.collectionScope.timeWindow,
      },
      contextBlocks: [
        stringifyPromptContext("Collection Scope", sharedState.collectionScope),
        stringifyPromptContext("Market Context", sharedState.marketContext),
        stringifyPromptContext(
          "Subjects",
          sharedState.collectionScope.subjects.map((subject: CollectionSubject) => ({
            id: subject.id,
            label: subject.label,
            level: subject.level,
            keywords: subject.keywords,
            ticker: subject.ticker,
            industryId: subject.industryId,
          })),
        ),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "information-collector",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const handoff = extractHandoff(finalText);
        const eventBlocks = extractRepeatedBlocks(handoff, "Event");
        const sourceLogBlocks = extractRepeatedBlocks(handoff, "Source Log");
        const coverageBlock = extractNamedSection(handoff, "Coverage Summary");
        const informationEvents = eventBlocks.map((block) => {
          const fields = parseFieldBlock(block);
          const level = expectEnum(expectString(fields, "level"), ["market", "industry", "company"], "level");
          const sourceType = expectEnum(expectString(fields, "source_type"), ["news", "announcements"], "source_type");
          const ticker = typeof fields.ticker === "string" ? fields.ticker.trim() : undefined;
          const industryId = typeof fields.industry_id === "string" ? fields.industry_id.trim() : undefined;
          const url = expectString(fields, "url");
          const title = expectString(fields, "title");
          return {
            eventId: stableEventId([level, expectString(fields, "source"), url, title]),
            level,
            publishedAt: expectString(fields, "published_at"),
            source: expectString(fields, "source"),
            sourceType,
            title,
            summary: expectString(fields, "summary"),
            url,
            ticker,
            industryId,
            marketTags: optionalArray(fields, "market_tags"),
            impactHint: expectEnum(expectString(fields, "impact_hint"), ["positive", "negative", "mixed", "neutral"], "impact_hint"),
            confidence: parseConfidence(expectString(fields, "confidence"), "confidence"),
          } satisfies InformationEvent;
        });
        const coverageSummary = coverageBlock ? extractLinesAsBullets(coverageBlock) : [];
        const sourceLog = sourceLogBlocks.map((block) => {
          const fields = parseFieldBlock(block);
          return {
            source: expectString(fields, "source"),
            sourceType: expectEnum(expectString(fields, "source_type"), ["news", "announcements"], "source_type"),
            query: expectString(fields, "query"),
            fetchedAt: typeof fields.fetched_at === "string" && fields.fetched_at.trim() ? fields.fetched_at.trim() : nowIso(),
            itemCount: parseNumber(expectString(fields, "item_count"), "item_count"),
          } satisfies SourceLogItem;
        });
        if (informationEvents.length === 0) {
          throw new Error("information-collector returned no events.");
        }
        return { informationEvents, coverageSummary, sourceLog };
      },
      (parsed) => ({
        eventCount: parsed.informationEvents.length,
        sourceLogCount: parsed.sourceLog.length,
        coverageSummaryCount: parsed.coverageSummary.length,
      }),
    );
  },
  applyResult(result, privateState) {
    return {
      ...privateState,
      collected: {
        ...privateState.collected,
        ...result,
      },
    };
  },
};

const macroPolicyDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    marketAttitude: string;
    macroRiskFlags: string[];
    macroTransmissionView: string;
  },
  DailyAgentSelectedInput
> = {
  id: "macro-policy-analyst",
  markdownPath: "agents/macro-policy-analyst.md",
  buildContract: buildMacroContract,
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        marketEventCount: privateState.collected.informationEvents.filter((event) => event.level === "market").length,
        coverageSummaryCount: privateState.collected.coverageSummary.length,
      },
      contextBlocks: [
        stringifyPromptContext("Market Context", sharedState.marketContext),
        stringifyPromptContext(
          "Market Events",
          privateState.collected.informationEvents.filter((event) => event.level === "market"),
        ),
        stringifyPromptContext("Coverage Summary", privateState.collected.coverageSummary),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "macro-policy-analyst",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const fields = parseFieldBlock(extractHandoff(finalText));
        return {
          marketAttitude: expectString(fields, "market_attitude"),
          macroRiskFlags: expectArray(fields, "macro_risk_flags"),
          macroTransmissionView: expectString(fields, "macro_transmission_view"),
        };
      },
      (parsed) => ({
        macroRiskFlagCount: parsed.macroRiskFlags.length,
        marketAttitude: parsed.marketAttitude,
      }),
    );
  },
  applyResult(result, privateState) {
    return {
      ...privateState,
      analysis: {
        ...privateState.analysis,
        marketAttitude: result.marketAttitude,
        macroRiskFlags: result.macroRiskFlags,
        macroTransmissionView: result.macroTransmissionView,
      },
    };
  },
};

const industryAnalystDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    industryViews: IndustryView[];
    industryRiskFlags: string[];
  },
  DailyAgentSelectedInput
> = {
  id: "industry-analyst",
  markdownPath: "agents/industry-analyst.md",
  buildContract: buildIndustryContract,
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        industryCount: sharedState.industries.length,
        industryEventCount: privateState.collected.informationEvents.filter((event) => event.level === "industry").length,
      },
      contextBlocks: [
        stringifyPromptContext("Industry Knowledge Base", sharedState.industries.map(industryDigest)),
        stringifyPromptContext(
          "Industry Events",
          privateState.collected.informationEvents.filter((event) => event.level === "industry"),
        ),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "industry-analyst",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const industryMap = new Map(
          input.contextBlocks ? [] : [],
        );
        void industryMap;
        const handoff = extractHandoff(finalText);
        const blocks = extractRepeatedBlocks(handoff, "Industry View");
        const parsedIndustryViews = blocks.map((block) => {
          const fields = parseFieldBlock(block);
          return {
            industryId: expectString(fields, "industry_id"),
            name: expectString(fields, "name"),
            stance: expectEnum(expectString(fields, "stance"), ["positive", "neutral", "negative"], "stance"),
            summary: expectString(fields, "summary"),
            keyChanges: expectArray(fields, "key_changes"),
            riskFlags: expectArray(fields, "risk_flags"),
            affectedTickers: optionalArray(fields, "affected_tickers"),
          } satisfies IndustryView;
        });
        return {
          industryViews: parsedIndustryViews,
          industryRiskFlags: [...new Set(parsedIndustryViews.flatMap((item) => item.riskFlags))],
        };
      },
      (parsed) => ({
        industryViewCount: parsed.industryViews.length,
        industryRiskFlagCount: parsed.industryRiskFlags.length,
      }),
    );
  },
  applyResult(result, privateState) {
    return {
      ...privateState,
      analysis: {
        ...privateState.analysis,
        industryViews: result.industryViews,
        industryRiskFlags: result.industryRiskFlags,
      },
    };
  },
};

const companyAnalystDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    companyViews: DailyPrivateState["analysis"]["companyViews"];
    positionUpdates: PositionUpdateCard[];
    thesisDeltas: ThesisDelta[];
    candidateAssessments: CandidateAssessment[];
  },
  DailyAgentSelectedInput
> = {
  id: "company-analyst",
  markdownPath: "agents/company-analyst.md",
  buildContract: buildCompanyContract,
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        positionCount: sharedState.positions.length,
        candidateCount: sharedState.candidates.length,
        companyEventCount: privateState.collected.informationEvents.filter((event) => event.level === "company").length,
      },
      contextBlocks: [
        stringifyPromptContext("Positions", sharedState.positions),
        stringifyPromptContext("Candidates", sharedState.candidates),
        stringifyPromptContext("Theses", sharedState.theses.map(thesisDigest)),
        stringifyPromptContext("Industry Views", privateState.analysis.industryViews),
        stringifyPromptContext(
          "Company Events",
          privateState.collected.informationEvents.filter((event) => event.level === "company"),
        ),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "company-analyst",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const handoff = extractHandoff(finalText);
        const companyViews = extractRepeatedBlocks(handoff, "Company View").map((block) => {
          const fields = parseFieldBlock(block);
          return {
            ticker: expectString(fields, "ticker"),
            name: expectString(fields, "name"),
            thesisStatus: expectString(fields, "thesis_status"),
            summary: expectString(fields, "summary"),
            whyNow: expectString(fields, "why_now"),
            supportingSignals: optionalArray(fields, "supporting_signals"),
            warningSignals: optionalArray(fields, "warning_signals"),
            actionBias: expectEnum(expectString(fields, "action_bias"), ["add", "hold", "reduce", "exit", "watch"], "action_bias"),
            confidence: parseConfidence(expectString(fields, "confidence"), "confidence"),
          };
        });
        const positionUpdates = extractRepeatedBlocks(handoff, "Position Update").map((block) => {
          const fields = parseFieldBlock(block);
          return {
            ticker: expectString(fields, "ticker"),
            name: expectString(fields, "name"),
            thesisStatus: expectString(fields, "thesis_status"),
            todayView: expectString(fields, "today_view"),
            suggestedWeightChange: parseNumber(expectString(fields, "suggested_weight_change"), "suggested_weight_change"),
            confidence: parseConfidence(expectString(fields, "confidence"), "confidence"),
            whyNow: expectString(fields, "why_now"),
            riskFlags: optionalArray(fields, "risk_flags"),
            action: expectEnum(expectString(fields, "action"), ["add", "hold", "reduce", "exit", "conditional_add", "observe"], "action"),
            priority: expectEnum(expectString(fields, "priority"), ["critical", "high", "medium", "low"], "priority"),
            score: fields.score ? parseConfidence(expectString(fields, "score"), "score") : parseConfidence(expectString(fields, "confidence"), "confidence"),
          } satisfies PositionUpdateCard;
        });
        const thesisDeltas = extractRepeatedBlocks(handoff, "Thesis Delta").map((block) => {
          const fields = parseFieldBlock(block);
          return {
            thesisId: expectString(fields, "thesis_id"),
            ticker: expectString(fields, "ticker"),
            previousStatus: typeof fields.previous_status === "string" ? fields.previous_status.trim() : undefined,
            nextStatus: expectString(fields, "next_status"),
            changeSummary: expectString(fields, "change_summary"),
          } satisfies ThesisDelta;
        });
        const candidateAssessments = extractRepeatedBlocks(handoff, "Candidate Assessment").map((block) => {
          const fields = parseFieldBlock(block);
          return {
            ticker: expectString(fields, "ticker"),
            name: expectString(fields, "name"),
            score: parseConfidence(expectString(fields, "score"), "score"),
            confidence: parseConfidence(expectString(fields, "confidence"), "confidence"),
            action: expectEnum(expectString(fields, "action"), ["watch_for_swap", "watch_only"], "action"),
            whyNow: expectString(fields, "why_now"),
          } satisfies CandidateAssessment;
        });
        return { companyViews, positionUpdates, thesisDeltas, candidateAssessments };
      },
      (parsed) => ({
        companyViewCount: parsed.companyViews.length,
        positionUpdateCount: parsed.positionUpdates.length,
        candidateAssessmentCount: parsed.candidateAssessments.length,
      }),
    );
  },
  applyResult(result, privateState) {
    return {
      ...privateState,
      analysis: {
        ...privateState.analysis,
        companyViews: result.companyViews,
        positionUpdates: result.positionUpdates,
        candidateAssessments: result.candidateAssessments,
        thesisDeltas: result.thesisDeltas,
      },
    };
  },
};

const bearCaseDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    bearCaseViews: BearCaseView[];
    errorConditions: string[];
    disconfirmingSignals: string[];
  },
  DailyAgentSelectedInput
> = {
  id: "bear-case-analyst",
  markdownPath: "agents/bear-case-analyst.md",
  buildContract: buildBearCaseContract,
  selectInput(_sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        companyViewCount: privateState.analysis.companyViews.length,
        industryViewCount: privateState.analysis.industryViews.length,
      },
      contextBlocks: [
        stringifyPromptContext("Company Views", privateState.analysis.companyViews),
        stringifyPromptContext("Industry Views", privateState.analysis.industryViews),
        stringifyPromptContext("Market Attitude", privateState.analysis.marketAttitude ?? ""),
        stringifyPromptContext("Macro Risk Flags", privateState.analysis.macroRiskFlags),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "bear-case-analyst",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const handoff = extractHandoff(finalText);
        const bearCaseViews = extractRepeatedBlocks(handoff, "Bear Case").map((block) => {
          const fields = parseFieldBlock(block);
          return {
            ticker: expectString(fields, "ticker"),
            coreChallenge: expectString(fields, "core_challenge"),
            errorConditions: expectArray(fields, "error_conditions"),
            disconfirmingSignals: expectArray(fields, "disconfirming_signals"),
            severity: expectEnum(expectString(fields, "severity"), ["medium", "high", "critical"], "severity"),
          } satisfies BearCaseView;
        });
        return {
          bearCaseViews,
          errorConditions: [...new Set(bearCaseViews.flatMap((item) => item.errorConditions))].slice(0, 12),
          disconfirmingSignals: [...new Set(bearCaseViews.flatMap((item) => item.disconfirmingSignals))].slice(0, 12),
        };
      },
      (parsed) => ({
        bearCaseCount: parsed.bearCaseViews.length,
        errorConditionCount: parsed.errorConditions.length,
      }),
    );
  },
  applyResult(result, privateState) {
    return {
      ...privateState,
      analysis: {
        ...privateState.analysis,
        bearCaseViews: result.bearCaseViews,
        errorConditions: result.errorConditions,
        disconfirmingSignals: result.disconfirmingSignals,
      },
    };
  },
};

const portfolioManagerDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    replacementRanking: ReplacementRankingItem[];
    capitalAllocationView: string;
    portfolioActionProposals: PortfolioActionProposal[];
  },
  DailyAgentSelectedInput
> = {
  id: "portfolio-manager",
  markdownPath: "agents/portfolio-manager.md",
  buildContract: buildPortfolioContract,
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        positionCount: sharedState.positions.length,
        candidateCount: sharedState.candidates.length,
        positionUpdateCount: privateState.analysis.positionUpdates.length,
      },
      contextBlocks: [
        stringifyPromptContext("Positions", sharedState.positions),
        stringifyPromptContext("Candidates", sharedState.candidates),
        stringifyPromptContext("Position Updates", privateState.analysis.positionUpdates),
        stringifyPromptContext("Candidate Assessments", privateState.analysis.candidateAssessments),
        stringifyPromptContext("Bear Case Views", privateState.analysis.bearCaseViews),
        stringifyPromptContext("Rules", sharedState.rules),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "portfolio-manager",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const handoff = extractHandoff(finalText);
        const rootFields = parseFieldBlock(handoff);
        const replacementRanking = extractRepeatedBlocks(handoff, "Replacement Ranking").map((block) => {
          const fields = parseFieldBlock(block);
          return {
            ticker: expectString(fields, "ticker"),
            name: expectString(fields, "name"),
            action: expectEnum(expectString(fields, "action"), ["keep", "watch_for_swap", "swap_candidate"], "action"),
            score: parseConfidence(expectString(fields, "score"), "score"),
            reason: expectString(fields, "reason"),
          } satisfies ReplacementRankingItem;
        });
        const portfolioActionProposals = extractRepeatedBlocks(handoff, "Portfolio Action Proposal").map((block) => {
          const fields = parseFieldBlock(block);
          return {
            ticker: expectString(fields, "ticker"),
            name: expectString(fields, "name"),
            action: expectEnum(expectString(fields, "action"), ["add", "hold", "reduce", "exit", "watch", "swap"], "action"),
            weightChange: parseNumber(expectString(fields, "weight_change"), "weight_change"),
            rationale: expectString(fields, "rationale"),
            confidence: parseConfidence(expectString(fields, "confidence"), "confidence"),
            fundingSource: typeof fields.funding_source === "string" ? fields.funding_source.trim() : undefined,
            constraints: optionalArray(fields, "constraints"),
          } satisfies PortfolioActionProposal;
        });
        return {
          replacementRanking,
          capitalAllocationView: expectString(rootFields, "capital_allocation_view"),
          portfolioActionProposals,
        };
      },
      (parsed) => ({
        replacementRankingCount: parsed.replacementRanking.length,
        proposalCount: parsed.portfolioActionProposals.length,
      }),
    );
  },
  applyResult(result, privateState) {
    return {
      ...privateState,
      analysis: {
        ...privateState.analysis,
        replacementRanking: result.replacementRanking,
        capitalAllocationView: result.capitalAllocationView,
        portfolioActionProposals: result.portfolioActionProposals,
      },
    };
  },
};

const riskOfficerDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    riskGate: RiskGateResult;
    riskAlerts: string[];
    riskLimits: string[];
  },
  DailyAgentSelectedInput
> = {
  id: "risk-officer",
  markdownPath: "agents/risk-officer.md",
  buildContract: buildRiskContract,
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        portfolioActionProposalCount: privateState.analysis.portfolioActionProposals.length,
        macroRiskFlagCount: privateState.analysis.macroRiskFlags.length,
        industryRiskFlagCount: privateState.analysis.industryRiskFlags.length,
      },
      contextBlocks: [
        stringifyPromptContext("Portfolio Snapshot", sharedState.positions),
        stringifyPromptContext("Portfolio Action Proposals", privateState.analysis.portfolioActionProposals),
        stringifyPromptContext("Risk Rules", sharedState.rules),
        stringifyPromptContext("Macro Risk Flags", privateState.analysis.macroRiskFlags),
        stringifyPromptContext("Industry Risk Flags", privateState.analysis.industryRiskFlags),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "risk-officer",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const fields = parseFieldBlock(extractHandoff(finalText));
        const decision = expectEnum(expectString(fields, "risk_gate_decision"), ["pass", "pass_with_limit", "reject"], "risk_gate_decision");
        const rationale = expectString(fields, "risk_gate_rationale");
        const riskAlerts = expectArray(fields, "risk_alerts");
        const riskLimits = expectArray(fields, "risk_limits");
        return {
          riskGate: {
            decision,
            alerts: [rationale, ...riskAlerts],
            notToDo: riskLimits,
          },
          riskAlerts,
          riskLimits,
        };
      },
      (parsed) => ({
        riskGateDecision: parsed.riskGate.decision,
        riskAlertCount: parsed.riskAlerts.length,
      }),
    );
  },
  applyResult(result, privateState) {
    return {
      ...privateState,
      analysis: {
        ...privateState.analysis,
        riskGate: result.riskGate,
        riskAlerts: result.riskAlerts,
        riskLimits: result.riskLimits,
      },
    };
  },
};

const chiefInvestmentOfficerDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  {
    finalActionFramework: string;
    requiredActions: string[];
    optionalActions: string[];
    continueHolding: string[];
    focusWatchlist: string[];
    approvalPacketSummary: string;
    dailyOperationSheetBody: string;
  },
  DailyAgentSelectedInput
> = {
  id: "chief-investment-officer",
  markdownPath: "agents/chief-investment-officer.md",
  buildContract: buildCioContract,
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        pendingItemCount: sharedState.pendingItems.length,
        positionUpdateCount: privateState.analysis.positionUpdates.length,
        candidateAssessmentCount: privateState.analysis.candidateAssessments.length,
      },
      contextBlocks: [
        stringifyPromptContext("Market Attitude", privateState.analysis.marketAttitude ?? ""),
        stringifyPromptContext("Industry Views", privateState.analysis.industryViews),
        stringifyPromptContext("Position Updates", privateState.analysis.positionUpdates),
        stringifyPromptContext("Candidate Assessments", privateState.analysis.candidateAssessments),
        stringifyPromptContext("Portfolio Action Proposals", privateState.analysis.portfolioActionProposals),
        stringifyPromptContext("Risk Gate", privateState.analysis.riskGate),
        stringifyPromptContext("Risk Alerts", privateState.analysis.riskAlerts),
        stringifyPromptContext("Pending Items", sharedState.pendingItems),
      ],
    };
  },
  async execute(input, ctx) {
    return executeStructuredAgent(
      "chief-investment-officer",
      this.buildContract(),
      input,
      ctx,
      (finalText) => {
        const fields = parseFieldBlock(extractHandoff(finalText));
        const contextBlocksText = input.contextBlocks.join("\n");
        void contextBlocksText;
        return {
          finalActionFramework: expectString(fields, "final_action_framework"),
          requiredActions: expectArray(fields, "required_actions"),
          optionalActions: expectArray(fields, "optional_actions"),
          continueHolding: expectArray(fields, "continue_holding"),
          focusWatchlist: expectArray(fields, "focus_watchlist"),
          approvalPacketSummary: expectString(fields, "approval_packet_summary"),
          dailyOperationSheetBody: expectString(fields, "daily_operation_sheet_body"),
        };
      },
      (parsed) => ({
        requiredActionCount: parsed.requiredActions.length,
        optionalActionCount: parsed.optionalActions.length,
        continueHoldingCount: parsed.continueHolding.length,
      }),
    );
  },
  applyResult(result, privateState) {
    const updateMap = new Map(privateState.analysis.positionUpdates.map((item) => [item.ticker, item]));
    const candidateMap = new Map(privateState.analysis.candidateAssessments.map((item) => [item.ticker, item]));
    const proposalMap = new Map(privateState.analysis.portfolioActionProposals.map((item) => [item.ticker, item]));

    function resolvePositionActionCard(ticker: string, fieldName: string): PositionUpdateCard {
      const existing = updateMap.get(ticker);
      if (existing) {
        return existing;
      }

      const proposal = proposalMap.get(ticker);
      if (proposal) {
        return {
          ticker: proposal.ticker,
          name: proposal.name,
          thesisStatus: "unchanged",
          todayView: proposal.rationale,
          suggestedWeightChange: proposal.weightChange,
          confidence: proposal.confidence,
          whyNow: proposal.rationale,
          riskFlags: proposal.constraints,
          action: proposal.action,
          priority: proposal.confidence >= 0.75 ? "high" : proposal.confidence >= 0.55 ? "medium" : "low",
          score: proposal.confidence,
        };
      }

      throw new Error(`chief-investment-officer returned unknown ${fieldName} ticker ${ticker}`);
    }

    const requiredActions = result.requiredActions.map((ticker) => {
      return resolvePositionActionCard(ticker, "required action");
    });
    const optionalActions = result.optionalActions.map((ref) => {
      if (ref.startsWith("position:")) {
        const ticker = ref.slice("position:".length);
        return resolvePositionActionCard(ticker, `optional position ${ref}`);
      }
      if (ref.startsWith("candidate:")) {
        const ticker = ref.slice("candidate:".length);
        const candidate = candidateMap.get(ticker);
        if (!candidate) {
          throw new Error(`chief-investment-officer returned unknown optional candidate ${ref}`);
        }
        return candidate;
      }
      throw new Error(`chief-investment-officer optional_actions must use position:<ticker> or candidate:<ticker>, got ${ref}`);
    });
    const continueHolding = result.continueHolding.map((ticker) => {
      return resolvePositionActionCard(ticker, "continue_holding");
    });

    return {
      ...privateState,
      analysis: {
        ...privateState.analysis,
        requiredActions,
        optionalActions,
        continueHolding,
        focusWatchlist: result.focusWatchlist,
      },
      decision: {
        ...privateState.decision,
        finalActionFramework: result.finalActionFramework,
        dailyOperationSheet: result.dailyOperationSheetBody,
      },
    };
  },
};

export const builtInAgentDefinitions: Array<
  AgentDefinition<DailySharedState, DailyPrivateState, unknown, DailyAgentSelectedInput>
> = [
  informationCollectorDefinition,
  macroPolicyDefinition,
  industryAnalystDefinition,
  companyAnalystDefinition,
  bearCaseDefinition,
  portfolioManagerDefinition,
  riskOfficerDefinition,
  chiefInvestmentOfficerDefinition,
];

export async function runInformationCollectorAgent(state: DailyRunGraphState): Promise<{
  informationEvents: InformationEvent[];
  coverageSummary: string[];
  sourceLog: SourceLogItem[];
}> {
  return executeDefinitionForParsedResult(informationCollectorDefinition, state);
}

export async function runMacroPolicyAgent(state: DailyRunGraphState): Promise<{
  marketAttitude: string;
  macroRiskFlags: string[];
  macroTransmissionView: string;
}> {
  return executeDefinitionForParsedResult(macroPolicyDefinition, state);
}

export async function runIndustryAnalystAgent(state: DailyRunGraphState): Promise<{
  industryViews: IndustryView[];
  industryRiskFlags: string[];
}> {
  return executeDefinitionForParsedResult(industryAnalystDefinition, state);
}

export async function runCompanyAnalystAgent(state: DailyRunGraphState): Promise<{
  companyViews: DailyPrivateState["analysis"]["companyViews"];
  positionUpdates: PositionUpdateCard[];
  thesisDeltas: ThesisDelta[];
  candidateAssessments: CandidateAssessment[];
}> {
  return executeDefinitionForParsedResult(companyAnalystDefinition, state);
}

export async function runBearCaseAgent(state: DailyRunGraphState): Promise<{
  bearCaseViews: BearCaseView[];
  errorConditions: string[];
  disconfirmingSignals: string[];
}> {
  return executeDefinitionForParsedResult(bearCaseDefinition, state);
}

export async function runPortfolioManagerAgent(state: DailyRunGraphState): Promise<{
  replacementRanking: ReplacementRankingItem[];
  capitalAllocationView: string;
  portfolioActionProposals: PortfolioActionProposal[];
}> {
  return executeDefinitionForParsedResult(portfolioManagerDefinition, state);
}

export async function runRiskOfficerAgent(state: DailyRunGraphState): Promise<{
  riskGate: RiskGateResult;
  riskAlerts: string[];
  riskLimits: string[];
}> {
  return executeDefinitionForParsedResult(riskOfficerDefinition, state);
}

export async function runChiefInvestmentOfficerAgent(state: DailyRunGraphState): Promise<{
  finalActionFramework: string;
  requiredActions: PositionUpdateCard[];
  optionalActions: Array<PositionUpdateCard | CandidateAssessment>;
  continueHolding: PositionUpdateCard[];
  focusWatchlist: string[];
  approvalPacketSummary: string;
  dailyOperationSheetBody: string;
}> {
  const nextPrivateState = await runAgentDefinition(
    chiefInvestmentOfficerDefinition,
    state.shared,
    state.privateState,
    createCompatAgentExecutionContext(state, "chief-investment-officer"),
  );
  return {
    finalActionFramework: nextPrivateState.decision.finalActionFramework ?? "",
    requiredActions: nextPrivateState.analysis.requiredActions,
    optionalActions: nextPrivateState.analysis.optionalActions,
    continueHolding: nextPrivateState.analysis.continueHolding,
    focusWatchlist: nextPrivateState.analysis.focusWatchlist,
    approvalPacketSummary: "",
    dailyOperationSheetBody: nextPrivateState.decision.dailyOperationSheet ?? "",
  };
}

export function renderOperationSheetFromBody(input: {
  runDate: string;
  marketAttitude: string;
  riskGate: RiskGateResult;
  body: string;
}): string {
  return stringifyMarkdownDocument(
    {
      kind: "daily_operation_sheet",
      run_date: input.runDate,
      status: "draft",
      risk_gate: input.riskGate.decision,
      market_attitude: input.marketAttitude,
    },
    input.body,
  );
}
