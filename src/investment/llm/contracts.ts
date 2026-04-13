// 每个 agent 的 handoff 契约都集中在这里维护，避免解析器和 prompt 约束散落在多个文件。

export function buildInformationCollectorContract(): string {
  return [
    "Return exactly these sections:",
    "## Analysis",
    "Free text analysis.",
    "## Handoff",
    "### Event",
    "level: market|industry|company",
    "published_at: ISO-8601 datetime",
    "source: source name",
    "source_type: news|announcements",
    "title: single-line title",
    "summary: single-line summary",
    "url: absolute URL",
    "ticker: optional ticker",
    "industry_id: optional industry id",
    "market_tags:",
    "- tag",
    "impact_hint: positive|negative|mixed|neutral",
    "confidence: 0-1 decimal",
    "### Coverage Summary",
    "- note",
    "### Source Log",
    "source: source name",
    "source_type: news|announcements",
    "query: single-line query",
    "item_count: integer",
    "fetched_at: ISO-8601 datetime",
  ].join("\n");
}

export function buildMacroContract(): string {
  return [
    "Return exactly these fields under `## Handoff`:",
    "market_attitude: single-line text",
    "macro_risk_flags:",
    "- flag",
    "macro_transmission_view: single-line text",
  ].join("\n");
}

export function buildIndustryContract(): string {
  return [
    "Return exactly these blocks under `## Handoff`:",
    "### Industry View",
    "industry_id: string",
    "name: string",
    "stance: positive|neutral|negative",
    "summary: single-line text",
    "key_changes:",
    "- item",
    "risk_flags:",
    "- item",
    "affected_tickers:",
    "- ticker",
  ].join("\n");
}

export function buildCompanyContract(): string {
  return [
    "Return exactly these blocks under `## Handoff`:",
    "### Company View",
    "ticker: string",
    "name: string",
    "thesis_status: string",
    "summary: single-line text",
    "why_now: single-line text",
    "supporting_signals:",
    "- item",
    "warning_signals:",
    "- item",
    "action_bias: add|hold|reduce|exit|watch",
    "confidence: 0-1 decimal",
    "### Position Update",
    "ticker: string",
    "name: string",
    "thesis_status: string",
    "today_view: single-line text",
    "suggested_weight_change: number",
    "confidence: 0-1 decimal",
    "why_now: single-line text",
    "risk_flags:",
    "- item",
    "action: add|hold|reduce|exit|conditional_add|observe",
    "priority: critical|high|medium|low",
    "score: 0-1 decimal",
    "### Thesis Delta",
    "thesis_id: string",
    "ticker: string",
    "previous_status: optional string",
    "next_status: string",
    "change_summary: single-line text",
    "### Candidate Assessment",
    "ticker: string",
    "name: string",
    "score: 0-1 decimal",
    "confidence: 0-1 decimal",
    "action: watch_for_swap|watch_only",
    "why_now: single-line text",
  ].join("\n");
}

export function buildBearCaseContract(): string {
  return [
    "Return exactly these blocks under `## Handoff`:",
    "### Bear Case",
    "ticker: string",
    "core_challenge: single-line text",
    "error_conditions:",
    "- item",
    "disconfirming_signals:",
    "- item",
    "severity: medium|high|critical",
  ].join("\n");
}

export function buildPortfolioContract(): string {
  return [
    "Return exactly these handoff entries:",
    "capital_allocation_view: single-line text",
    "### Replacement Ranking",
    "ticker: string",
    "name: string",
    "action: keep|watch_for_swap|swap_candidate",
    "score: 0-1 decimal",
    "reason: single-line text",
    "### Portfolio Action Proposal",
    "ticker: string",
    "name: string",
    "action: add|hold|reduce|exit|watch|swap",
    "weight_change: number",
    "rationale: single-line text",
    "confidence: 0-1 decimal",
    "funding_source: optional ticker",
    "constraints:",
    "- item",
  ].join("\n");
}

export function buildRiskContract(): string {
  return [
    "Return exactly these fields under `## Handoff`:",
    "risk_gate_decision: pass|pass_with_limit|reject",
    "risk_gate_rationale: single-line text",
    "risk_alerts:",
    "- item",
    "risk_limits:",
    "- item",
  ].join("\n");
}

export function buildCioContract(): string {
  return [
    "Return exactly these fields under `## Handoff`:",
    "final_action_framework: single-line text",
    "required_actions:",
    "- ticker",
    "optional_actions:",
    "- position:<ticker> or candidate:<ticker>",
    "continue_holding:",
    "- ticker",
    "focus_watchlist:",
    "- item",
    "approval_packet_summary: single-line text",
    "daily_operation_sheet_body:",
    "```markdown",
    "operation sheet markdown body here",
    "```",
  ].join("\n");
}
