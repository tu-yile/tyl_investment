function stringifyExample(example: unknown): string {
  return JSON.stringify(example, null, 2);
}

function buildMarkdownSignalGuide(args: {
  reportHint: string;
  signalsHint?: string;
  jsonExample?: unknown;
}): string {
  const parts = [
    "Return exactly two top-level sections:",
    "## Report",
    args.reportHint,
    "## Signals",
    "Use a fenced ```json block. Return {} if no machine-readable signals are needed.",
  ];

  if (args.signalsHint) {
    parts.push(args.signalsHint);
  }

  if (args.jsonExample !== undefined) {
    parts.push("JSON example:");
    parts.push("```json");
    parts.push(stringifyExample(args.jsonExample));
    parts.push("```");
  }

  return parts.join("\n");
}

export function buildInformationCollectorContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write a concise markdown intelligence report covering what changed, why it matters, and any obvious blind spots.",
    signalsHint: "Keep only normalized events that downstream nodes need to read.",
    jsonExample: {
      events: [
        {
          subjectRef: "ticker:300750",
          publishedAt: "2026-04-19T07:30:00+08:00",
          source: "SSE",
          title: "Sample event title",
          summary: "One-line normalized summary",
          url: "https://example.com/event",
          impact: "mixed",
        },
      ],
    },
  });
}

export function buildMacroContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write a markdown market memo explaining the macro/policy backdrop and what constraints it creates for the daily decision.",
    signalsHint: "Only return the market attitude and macro risk flags that downstream nodes need.",
    jsonExample: {
      marketAttitude: "中性偏谨慎",
      macroRiskFlags: ["流动性边际转弱", "政策预期分化"],
    },
  });
}

export function buildIndustryContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write a markdown industry note that updates stance, key changes, and any knowledge-base-worthy observations.",
    signalsHint: "Only return per-industry stance and optional knowledge patch references.",
    jsonExample: {
      industryViews: [
        {
          industryId: "power-equipment",
          stance: "positive",
        },
      ],
      knowledgePatchRefs: [],
    },
  });
}

export function buildCompanyContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write a markdown company reassessment explaining thesis changes, action bias, and what matters most for each covered security.",
    signalsHint: "Only return the minimal per-security updates that downstream portfolio logic needs.",
    jsonExample: {
      securityUpdates: [
        {
          ticker: "300750",
          thesisStatus: "strengthened",
          action: "hold",
          suggestedWeightChange: 0,
          confidence: 0.78,
        },
      ],
      knowledgePatchRefs: [],
    },
  });
}

export function buildBearCaseContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write a markdown bear-case memo challenging the bullish view, highlighting weak assumptions and disconfirming evidence.",
    signalsHint: "Return {}. This node is markdown-first and does not need machine-readable signals in the daily flow.",
    jsonExample: {},
  });
}

export function buildPortfolioContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write a markdown portfolio note explaining capital allocation logic, funding sources, and the preferred sequencing of actions.",
    signalsHint: "Only return minimal portfolio actions for downstream risk and CIO nodes.",
    jsonExample: {
      portfolioActions: [
        {
          ticker: "300750",
          action: "reduce",
          weightChange: -1,
          fundingSource: "300750",
          confidence: 0.8,
        },
      ],
    },
  });
}

export function buildRiskContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write a markdown risk memo explaining the gate decision, constraints, and what should not be done today.",
    signalsHint: "Only return the final risk gate object.",
    jsonExample: {
      riskGate: {
        decision: "pass_with_limit",
        alerts: ["行业集中度接近上限"],
        notToDo: ["单票加仓不超过2%"],
      },
    },
  });
}

export function buildCioContract(): string {
  return buildMarkdownSignalGuide({
    reportHint: "Write the final markdown operation sheet for today, including actions, risk notes, and watch items. This report becomes the human-facing operation sheet body.",
    signalsHint: "Only return normalized operation sheet items.",
    jsonExample: {
      sheetItems: [
        {
          bucket: "required",
          ref: "position:300750",
          action: "reduce",
          weightChange: -1,
          confidence: 0.8,
        },
        {
          bucket: "watch",
          ref: "watch:跟踪储能订单兑现",
        },
      ],
    },
  });
}
