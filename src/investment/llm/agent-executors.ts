import { createHash } from "node:crypto";
import { z } from "zod";
import type {
  AgentDefinition,
  AgentExecutionResult,
  AgentSelectedInput,
} from "../agents/types.js";
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
import { parseMarkdownSignalResponse } from "./markdown-signal-parser.js";
import {
  cioSignalsSchema,
  collectorSignalsSchema,
  companySignalsSchema,
  industrySignalsSchema,
  macroSignalsSchema,
  portfolioSignalsSchema,
  riskSignalsSchema,
  type CioSignals,
  type CollectorSignals,
  type CompanySignals,
  type IndustrySignals,
  type MacroSignals,
  type PortfolioSignals,
  type RiskSignals,
} from "./signal-schemas.js";
import { industryDigest, runAgent, stringifyPromptContext, thesisDigest } from "./prompting.js";
import type {
  CollectionSubject,
  DailyPrivateState,
  DailySharedState,
  InformationEvent,
  OperationSheetItem,
} from "../workflows/daily-position-decision/types.js";

interface DailyAgentSelectedInput extends AgentSelectedInput {
  contextBlocks: string[];
  subjects?: CollectionSubject[];
}

interface CollectedEventSignals {
  events: InformationEvent[];
}

const emptySignalsSchema = z.object({}).passthrough();

function stableId(parts: Array<string | undefined>): string {
  return createHash("sha1").update(parts.filter(Boolean).join("|")).digest("hex");
}

function markdownContext(title: string, markdown: string | undefined): string | null {
  const value = markdown?.trim();
  if (!value) {
    return null;
  }
  return [`## ${title}`, value].join("\n");
}

function compactBlocks(blocks: Array<string | null | undefined>): string[] {
  return blocks.filter((block): block is string => typeof block === "string" && block.trim().length > 0);
}

function withAgentReport(
  privateState: DailyPrivateState,
  agentId: keyof DailyPrivateState["reports"]["byAgent"],
  reportMd: string,
): DailyPrivateState {
  return {
    ...privateState,
    reports: {
      ...privateState.reports,
      byAgent: {
        ...privateState.reports.byAgent,
        [agentId]: reportMd.trim(),
      },
    },
  };
}

function subjectIndex(subjects: CollectionSubject[]): Map<string, CollectionSubject> {
  return new Map(subjects.map((subject) => [subject.id, subject]));
}

function extractTickerFromRef(subjectRef: string): string | undefined {
  const match = subjectRef.match(/^(?:ticker|position):(.+)$/);
  return match?.[1];
}

function extractIndustryIdFromRef(subjectRef: string): string | undefined {
  const match = subjectRef.match(/^industry:(.+)$/);
  return match?.[1];
}

function inferEventLevel(subjectRef: string, subject?: CollectionSubject): InformationEvent["level"] {
  if (subject?.level) {
    return subject.level;
  }
  if (subjectRef.startsWith("industry:")) {
    return "industry";
  }
  if (
    subjectRef.startsWith("position:") ||
    subjectRef.startsWith("ticker:")
  ) {
    return "company";
  }
  return "market";
}

function inferSourceType(source: string, url: string): InformationEvent["sourceType"] {
  const haystack = `${source} ${url}`.toLowerCase();
  if (/(exchange|cninfo|公告|disclosure|bulletin|sse|szse)/i.test(haystack)) {
    return "announcements";
  }
  return "news";
}

function enrichCollectorSignals(
  signals: CollectorSignals,
  subjects: CollectionSubject[],
): InformationEvent[] {
  const subjectsById = subjectIndex(subjects);
  return signals.events.map((event) => {
    const subject = subjectsById.get(event.subjectRef);
    const level = inferEventLevel(event.subjectRef, subject);
    return {
      ...event,
      eventId: stableId([event.subjectRef, event.source, event.url, event.title]),
      level,
      sourceType: inferSourceType(event.source, event.url),
      ticker: subject?.ticker ?? extractTickerFromRef(event.subjectRef),
      industryId: subject?.industryId ?? extractIndustryIdFromRef(event.subjectRef),
      marketTags: level === "market" ? ["market"] : [],
      impactHint: event.impact,
      confidence: 0.72,
    };
  });
}

function eventLevel(event: InformationEvent): "market" | "industry" | "company" {
  return event.level ?? inferEventLevel(event.subjectRef);
}

function filterEvents(events: InformationEvent[], level: "market" | "industry" | "company"): InformationEvent[] {
  return events.filter((event) => eventLevel(event) === level);
}

function validateSignals<TSignals>(
  agentId: string,
  rawSignals: unknown,
  schema: z.ZodType<TSignals>,
): TSignals {
  try {
    return schema.parse(rawSignals ?? {});
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new Error(`${agentId} returned invalid signals: ${error.message}`);
    }
    throw error;
  }
}

async function executeMarkdownSignalAgent<TSignals>(args: {
  agentId: AgentDefinition<any, any, any>["id"];
  promptGuide: string;
  input: DailyAgentSelectedInput;
  ctx: {
    investmentRoot: string;
  };
  schema: z.ZodType<TSignals>;
  artifactType: "report" | "assessment" | "decision_packet" | "knowledge_proposal";
  buildSummaryJson?: (signals: TSignals, reportMd: string) => unknown;
}): Promise<AgentExecutionResult<TSignals>> {
  const finalText = await runAgent(
    args.agentId,
    args.ctx.investmentRoot,
    args.promptGuide,
    args.input.contextBlocks,
  );
  const parsed = parseMarkdownSignalResponse(finalText);
  const signals = validateSignals(args.agentId, parsed.signals, args.schema);
  const summaryJson = args.buildSummaryJson?.(signals, parsed.reportMd.trim());
  return {
    rawOutput: finalText,
    artifact: {
      reportMd: parsed.reportMd.trim(),
      signals,
      artifactType: args.artifactType,
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      summaryJson,
    },
    outputSummaryJson: summaryJson,
  };
}

const informationCollectorDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  CollectedEventSignals,
  DailyAgentSelectedInput
> = {
  id: "information-collector",
  markdownPath: "agents/information-collector.md",
  buildPromptGuide() {
    return buildInformationCollectorContract();
  },
  selectInput(sharedState): DailyAgentSelectedInput {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      subjects: sharedState.collectionScope.subjects,
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
          sharedState.collectionScope.subjects.map((subject) => ({
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
    const result = await executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: collectorSignalsSchema,
      artifactType: "report",
      buildSummaryJson: (signals) => ({
        eventCount: signals.events.length,
      }),
    });
    const enrichedEvents = enrichCollectorSignals(
      result.artifact.signals ?? { events: [] },
      input.subjects ?? [],
    );
    return {
      ...result,
      artifact: {
        ...result.artifact,
        signals: {
          events: enrichedEvents,
        },
      },
      outputSummaryJson: {
        eventCount: enrichedEvents.length,
      },
    };
  },
  applyArtifact(artifact, privateState) {
    const nextPrivateState = withAgentReport(privateState, this.id, artifact.reportMd);
    return {
      ...nextPrivateState,
      collected: {
        ...nextPrivateState.collected,
        informationEvents: artifact.signals?.events ?? [],
        coverageSummary: [],
        sourceLog: [],
      },
    };
  },
};

const macroPolicyDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  MacroSignals,
  DailyAgentSelectedInput
> = {
  id: "macro-policy-analyst",
  markdownPath: "agents/macro-policy-analyst.md",
  buildPromptGuide() {
    return buildMacroContract();
  },
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        marketEventCount: filterEvents(privateState.collected.informationEvents, "market").length,
      },
      contextBlocks: compactBlocks([
        stringifyPromptContext("Market Context", sharedState.marketContext),
        stringifyPromptContext("Collected Market Events", filterEvents(privateState.collected.informationEvents, "market")),
        markdownContext("Collector Report", privateState.reports.byAgent["information-collector"]),
      ]),
    };
  },
  async execute(input, ctx) {
    return executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: macroSignalsSchema,
      artifactType: "assessment",
      buildSummaryJson: (signals) => ({
        marketAttitude: signals.marketAttitude,
        macroRiskFlagCount: signals.macroRiskFlags.length,
      }),
    });
  },
  applyArtifact(artifact, privateState) {
    const nextPrivateState = withAgentReport(privateState, this.id, artifact.reportMd);
    return {
      ...nextPrivateState,
      derived: {
        ...nextPrivateState.derived,
        marketAttitude: artifact.signals?.marketAttitude ?? "",
        macroRiskFlags: artifact.signals?.macroRiskFlags ?? [],
      },
    };
  },
};

const industryAnalystDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  IndustrySignals,
  DailyAgentSelectedInput
> = {
  id: "industry-analyst",
  markdownPath: "agents/industry-analyst.md",
  buildPromptGuide() {
    return buildIndustryContract();
  },
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        industryCount: sharedState.industries.length,
        relatedEventCount: filterEvents(privateState.collected.informationEvents, "industry").length,
      },
      contextBlocks: compactBlocks([
        stringifyPromptContext(
          "Industries",
          sharedState.industries.map((industry) => industryDigest(industry)),
        ),
        stringifyPromptContext("Industry Events", filterEvents(privateState.collected.informationEvents, "industry")),
        markdownContext("Collector Report", privateState.reports.byAgent["information-collector"]),
        markdownContext("Macro Report", privateState.reports.byAgent["macro-policy-analyst"]),
      ]),
    };
  },
  async execute(input, ctx) {
    return executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: industrySignalsSchema,
      artifactType: "assessment",
      buildSummaryJson: (signals) => ({
        industryCount: signals.industryViews.length,
        knowledgePatchRefCount: signals.knowledgePatchRefs?.length ?? 0,
      }),
    });
  },
  applyArtifact(artifact, privateState) {
    const nextPrivateState = withAgentReport(privateState, this.id, artifact.reportMd);
    return {
      ...nextPrivateState,
      derived: {
        ...nextPrivateState.derived,
        industryStances: artifact.signals?.industryViews ?? [],
      },
    };
  },
};

const companyAnalystDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  CompanySignals,
  DailyAgentSelectedInput
> = {
  id: "company-analyst",
  markdownPath: "agents/company-analyst.md",
  buildPromptGuide() {
    return buildCompanyContract();
  },
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        positionCount: sharedState.positions.length,
        companyEventCount: filterEvents(privateState.collected.informationEvents, "company").length,
      },
      contextBlocks: compactBlocks([
        stringifyPromptContext("Current Positions", sharedState.positions),
        stringifyPromptContext("Thesis Digest", sharedState.theses.map((thesis) => thesisDigest(thesis))),
        stringifyPromptContext("Company Events", filterEvents(privateState.collected.informationEvents, "company")),
        stringifyPromptContext("Industry Stances", privateState.derived.industryStances),
        markdownContext("Macro Report", privateState.reports.byAgent["macro-policy-analyst"]),
        markdownContext("Industry Report", privateState.reports.byAgent["industry-analyst"]),
      ]),
    };
  },
  async execute(input, ctx) {
    return executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: companySignalsSchema,
      artifactType: "assessment",
      buildSummaryJson: (signals) => ({
        securityCount: signals.securityUpdates.length,
        knowledgePatchRefCount: signals.knowledgePatchRefs?.length ?? 0,
      }),
    });
  },
  applyArtifact(artifact, privateState) {
    const nextPrivateState = withAgentReport(privateState, this.id, artifact.reportMd);
    return {
      ...nextPrivateState,
      derived: {
        ...nextPrivateState.derived,
        securityUpdates: artifact.signals?.securityUpdates ?? [],
      },
    };
  },
};

const bearCaseDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  Record<string, unknown>,
  DailyAgentSelectedInput
> = {
  id: "bear-case-analyst",
  markdownPath: "agents/bear-case-analyst.md",
  buildPromptGuide() {
    return buildBearCaseContract();
  },
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        coveredSecurityCount: privateState.derived.securityUpdates.length,
      },
      contextBlocks: compactBlocks([
        stringifyPromptContext("Security Updates", privateState.derived.securityUpdates),
        markdownContext("Company Report", privateState.reports.byAgent["company-analyst"]),
        markdownContext("Macro Report", privateState.reports.byAgent["macro-policy-analyst"]),
      ]),
    };
  },
  async execute(input, ctx) {
    return executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: emptySignalsSchema,
      artifactType: "report",
      buildSummaryJson: () => ({
        hasStructuredSignals: false,
      }),
    });
  },
  applyArtifact(artifact, privateState) {
    return withAgentReport(privateState, this.id, artifact.reportMd);
  },
};

const portfolioManagerDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  PortfolioSignals,
  DailyAgentSelectedInput
> = {
  id: "portfolio-manager",
  markdownPath: "agents/portfolio-manager.md",
  buildPromptGuide() {
    return buildPortfolioContract();
  },
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        securityUpdateCount: privateState.derived.securityUpdates.length,
        positionCount: sharedState.positions.length,
      },
      contextBlocks: compactBlocks([
        stringifyPromptContext("Current Positions", sharedState.positions),
        stringifyPromptContext("Security Updates", privateState.derived.securityUpdates),
        stringifyPromptContext("Macro Risk Flags", privateState.derived.macroRiskFlags),
        markdownContext("Company Report", privateState.reports.byAgent["company-analyst"]),
        markdownContext("Bear Case Report", privateState.reports.byAgent["bear-case-analyst"]),
      ]),
    };
  },
  async execute(input, ctx) {
    return executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: portfolioSignalsSchema,
      artifactType: "assessment",
      buildSummaryJson: (signals) => ({
        actionCount: signals.portfolioActions.length,
      }),
    });
  },
  applyArtifact(artifact, privateState) {
    const nextPrivateState = withAgentReport(privateState, this.id, artifact.reportMd);
    return {
      ...nextPrivateState,
      derived: {
        ...nextPrivateState.derived,
        portfolioActions: artifact.signals?.portfolioActions ?? [],
      },
    };
  },
};

const riskOfficerDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  RiskSignals,
  DailyAgentSelectedInput
> = {
  id: "risk-officer",
  markdownPath: "agents/risk-officer.md",
  buildPromptGuide() {
    return buildRiskContract();
  },
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        portfolioActionCount: privateState.derived.portfolioActions.length,
        macroRiskFlagCount: privateState.derived.macroRiskFlags.length,
      },
      contextBlocks: compactBlocks([
        stringifyPromptContext("Rules", sharedState.rules),
        stringifyPromptContext("Current Positions", sharedState.positions),
        stringifyPromptContext("Portfolio Actions", privateState.derived.portfolioActions),
        stringifyPromptContext("Macro Risk Flags", privateState.derived.macroRiskFlags),
        markdownContext("Portfolio Report", privateState.reports.byAgent["portfolio-manager"]),
      ]),
    };
  },
  async execute(input, ctx) {
    return executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: riskSignalsSchema,
      artifactType: "assessment",
      buildSummaryJson: (signals) => ({
        decision: signals.riskGate.decision,
        alertCount: signals.riskGate.alerts.length,
      }),
    });
  },
  applyArtifact(artifact, privateState) {
    const nextPrivateState = withAgentReport(privateState, this.id, artifact.reportMd);
    return {
      ...nextPrivateState,
      derived: {
        ...nextPrivateState.derived,
        riskGate: artifact.signals?.riskGate,
      },
    };
  },
};

const chiefInvestmentOfficerDefinition: AgentDefinition<
  DailySharedState,
  DailyPrivateState,
  CioSignals,
  DailyAgentSelectedInput
> = {
  id: "chief-investment-officer",
  markdownPath: "agents/chief-investment-officer.md",
  buildPromptGuide() {
    return buildCioContract();
  },
  selectInput(sharedState, privateState) {
    return {
      scopeType: "workflow",
      scopeKey: "daily-position-decision",
      inputSummaryJson: {
        portfolioActionCount: privateState.derived.portfolioActions.length,
        sheetItemCount: privateState.derived.sheetItems.length,
      },
      contextBlocks: compactBlocks([
        stringifyPromptContext("Current Positions", sharedState.positions),
        stringifyPromptContext("Security Updates", privateState.derived.securityUpdates),
        stringifyPromptContext("Portfolio Actions", privateState.derived.portfolioActions),
        stringifyPromptContext("Risk Gate", privateState.derived.riskGate ?? null),
        markdownContext("Macro Report", privateState.reports.byAgent["macro-policy-analyst"]),
        markdownContext("Company Report", privateState.reports.byAgent["company-analyst"]),
        markdownContext("Bear Case Report", privateState.reports.byAgent["bear-case-analyst"]),
        markdownContext("Portfolio Report", privateState.reports.byAgent["portfolio-manager"]),
        markdownContext("Risk Report", privateState.reports.byAgent["risk-officer"]),
      ]),
    };
  },
  async execute(input, ctx) {
    return executeMarkdownSignalAgent({
      agentId: this.id,
      promptGuide: this.buildPromptGuide(),
      input,
      ctx,
      schema: cioSignalsSchema,
      artifactType: "decision_packet",
      buildSummaryJson: (signals) => ({
        sheetItemCount: signals.sheetItems.length,
        requiredActionCount: signals.sheetItems.filter((item) => item.bucket === "required").length,
      }),
    });
  },
  applyArtifact(artifact, privateState) {
    const nextPrivateState = withAgentReport(privateState, this.id, artifact.reportMd);
    const sheetItems: OperationSheetItem[] = artifact.signals?.sheetItems ?? [];
    return {
      ...nextPrivateState,
      derived: {
        ...nextPrivateState.derived,
        sheetItems,
      },
      decision: {
        ...nextPrivateState.decision,
        dailyOperationSheet: artifact.reportMd,
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
