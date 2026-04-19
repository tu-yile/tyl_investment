import { z } from "zod";

const impactSchema = z.enum(["positive", "negative", "mixed", "neutral"]);
const positionActionSchema = z.enum(["add", "hold", "reduce", "exit", "watch"]);
const portfolioActionSchema = z.enum(["add", "hold", "reduce", "exit", "watch", "swap"]);
const riskGateDecisionSchema = z.enum(["pass", "pass_with_limit", "reject"]);
const sheetBucketSchema = z.enum(["required", "optional", "hold", "watch"]);
const industryStanceSchema = z.enum(["positive", "neutral", "negative"]);

export const collectorSignalsSchema = z.object({
  events: z.array(
    z.object({
      subjectRef: z.string().min(1),
      publishedAt: z.string().min(1),
      source: z.string().min(1),
      title: z.string().min(1),
      summary: z.string().min(1),
      url: z.string().url(),
      impact: impactSchema,
    }),
  ),
});

export const macroSignalsSchema = z.object({
  marketAttitude: z.string().min(1),
  macroRiskFlags: z.array(z.string().min(1)),
});

export const industrySignalsSchema = z.object({
  industryViews: z.array(
    z.object({
      industryId: z.string().min(1),
      stance: industryStanceSchema,
    }),
  ),
  knowledgePatchRefs: z.array(z.string().min(1)).optional(),
});

export const companySignalsSchema = z.object({
  securityUpdates: z.array(
    z.object({
      ticker: z.string().min(1),
      thesisStatus: z.string().min(1),
      action: positionActionSchema,
      suggestedWeightChange: z.number(),
      confidence: z.number().min(0).max(1),
    }),
  ),
  knowledgePatchRefs: z.array(z.string().min(1)).optional(),
});

export const portfolioSignalsSchema = z.object({
  portfolioActions: z.array(
    z.object({
      ticker: z.string().min(1),
      action: portfolioActionSchema,
      weightChange: z.number(),
      fundingSource: z.string().min(1).optional(),
      confidence: z.number().min(0).max(1),
    }),
  ),
});

export const riskSignalsSchema = z.object({
  riskGate: z.object({
    decision: riskGateDecisionSchema,
    alerts: z.array(z.string().min(1)),
    notToDo: z.array(z.string().min(1)),
  }),
});

export const cioSignalsSchema = z.object({
  sheetItems: z.array(
    z.object({
      bucket: sheetBucketSchema,
      ref: z.string().min(1).optional(),
      action: z.string().min(1).optional(),
      weightChange: z.number().optional(),
      confidence: z.number().min(0).max(1).optional(),
    }),
  ),
});

export type CollectorSignals = z.infer<typeof collectorSignalsSchema>;
export type MacroSignals = z.infer<typeof macroSignalsSchema>;
export type IndustrySignals = z.infer<typeof industrySignalsSchema>;
export type CompanySignals = z.infer<typeof companySignalsSchema>;
export type PortfolioSignals = z.infer<typeof portfolioSignalsSchema>;
export type RiskSignals = z.infer<typeof riskSignalsSchema>;
export type CioSignals = z.infer<typeof cioSignalsSchema>;
