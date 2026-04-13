import path from "node:path";
import { listMarkdownFiles, readText } from "./filesystem.js";
import { parseMarkdownDocument, stringifyMarkdownDocument } from "./frontmatter.js";
import type {
  CandidateRecord,
  Frontmatter,
  IndustryRecord,
  MarkdownDocument,
  MarketContext,
  PositionRecord,
  RulesConfig,
  ThesisRecord,
} from "../types.js";

// 这些 getter 统一承担 schema 守门职责，让错误尽早暴露在加载阶段。
function getString(frontmatter: Frontmatter, key: string): string {
  const value = frontmatter[key];
  if (typeof value !== "string" && typeof value !== "number") {
    throw new Error(`Expected string field "${key}"`);
  }
  return String(value);
}

function getTicker(frontmatter: Frontmatter, key: string): string {
  const value = getString(frontmatter, key).trim();
  return /^\d+$/.test(value) ? value.padStart(6, "0") : value;
}

function getNumber(frontmatter: Frontmatter, key: string): number {
  const value = frontmatter[key];
  if (typeof value !== "number") {
    throw new Error(`Expected number field "${key}"`);
  }
  return value;
}

function getStringArray(frontmatter: Frontmatter, key: string): string[] {
  const value = frontmatter[key];
  if (!Array.isArray(value)) {
    throw new Error(`Expected array field "${key}"`);
  }
  return value.map((item) => String(item));
}

export async function loadMarkdown(pathname: string): Promise<MarkdownDocument> {
  const raw = await readText(pathname);
  return parseMarkdownDocument(pathname, raw);
}

export async function loadCollection(dirPath: string): Promise<MarkdownDocument[]> {
  // 集合加载是 investment 子系统最常见的读取模式，所以单独抽成工具函数。
  const files = await listMarkdownFiles(dirPath);
  const docs = await Promise.all(files.map((file) => loadMarkdown(file)));
  return docs;
}

export async function loadPositions(root: string): Promise<PositionRecord[]> {
  // position 目录只接受结构化持仓文件，运行时不会猜字段含义。
  const docs = await loadCollection(path.join(root, "portfolio/positions"));
  return docs.map((doc) => ({
    ticker: getTicker(doc.frontmatter, "ticker"),
    name: getString(doc.frontmatter, "name"),
    weight: getNumber(doc.frontmatter, "weight"),
    costBasis: getNumber(doc.frontmatter, "cost_basis"),
    holdingDays: getNumber(doc.frontmatter, "holding_days"),
    sector: getString(doc.frontmatter, "sector"),
    industryId: getString(doc.frontmatter, "industry_id"),
    thesisId: getString(doc.frontmatter, "thesis_id"),
    path: doc.path,
  }));
}

export async function loadCandidates(root: string): Promise<CandidateRecord[]> {
  const docs = await loadCollection(path.join(root, "portfolio/candidates"));
  return docs.map((doc) => ({
    ticker: getTicker(doc.frontmatter, "ticker"),
    name: getString(doc.frontmatter, "name"),
    targetEntryWeight: getNumber(doc.frontmatter, "target_entry_weight"),
    industryId: getString(doc.frontmatter, "industry_id"),
    thesisId: getString(doc.frontmatter, "thesis_id"),
    sourceFlow: getString(doc.frontmatter, "source_flow"),
    status: getString(doc.frontmatter, "status"),
    path: doc.path,
  }));
}

export async function loadTheses(root: string): Promise<ThesisRecord[]> {
  // 公司知识目录里可能以后还会出现别的 Markdown，这里先按 kind 显式过滤 thesis。
  const docs = await loadCollection(path.join(root, "knowledge/companies"));
  return docs
    .filter((doc) => doc.frontmatter.kind === "thesis")
    .map((doc) => ({
      thesisId: getString(doc.frontmatter, "thesis_id"),
      ticker: getTicker(doc.frontmatter, "ticker"),
      companyName: getString(doc.frontmatter, "company_name"),
      industryId: getString(doc.frontmatter, "industry_id"),
      status: getString(doc.frontmatter, "status"),
      catalystStrength: getString(doc.frontmatter, "catalyst_strength"),
      valuationView: getString(doc.frontmatter, "valuation_view"),
      riskLevel: getString(doc.frontmatter, "risk_level"),
      confidenceBase: getNumber(doc.frontmatter, "confidence_base"),
      lastUpdated: getString(doc.frontmatter, "last_updated"),
      monitoringFlags: getStringArray(doc.frontmatter, "monitoring_flags"),
      path: doc.path,
      sections: doc.sections,
    }));
}

export async function loadIndustries(root: string): Promise<IndustryRecord[]> {
  const docs = await loadCollection(path.join(root, "knowledge/industries"));
  return docs.map((doc) => ({
    industryId: getString(doc.frontmatter, "industry_id"),
    name: getString(doc.frontmatter, "name"),
    currentView: getString(doc.frontmatter, "current_view"),
    recentChange: getString(doc.frontmatter, "recent_change"),
    keySignals: getStringArray(doc.frontmatter, "key_signals"),
    watchpoints: getStringArray(doc.frontmatter, "watchpoints"),
    path: doc.path,
    sections: doc.sections,
  }));
}

export async function loadRules(root: string): Promise<RulesConfig> {
  // 执行层只关心关键阈值，因此在这里把多个 Markdown 合并成一份运行时配置。
  const confidence = await loadMarkdown(path.join(root, "config/confidence-rules.md"));
  const risk = await loadMarkdown(path.join(root, "config/risk-rules.md"));
  const strategy = await loadMarkdown(path.join(root, "config/strategy.md"));

  return {
    clearActionThreshold: getNumber(confidence.frontmatter, "clear_action_threshold"),
    conditionalActionThreshold: getNumber(confidence.frontmatter, "conditional_action_threshold"),
    singleNameRegularCap: getNumber(risk.frontmatter, "single_name_regular_cap"),
    singleNameCoreCap: getNumber(risk.frontmatter, "single_name_core_cap"),
    singleSectorCap: getNumber(risk.frontmatter, "single_sector_cap"),
    largeTradeThreshold: getNumber(risk.frontmatter, "large_trade_threshold"),
    replacementScoreGap: getNumber(strategy.frontmatter, "replacement_score_gap"),
  };
}

export async function loadMarketContext(root: string): Promise<MarketContext> {
  const doc = await loadMarkdown(path.join(root, "state/market-context.md"));
  return {
    asOf: getString(doc.frontmatter, "as_of"),
    marketTone: getString(doc.frontmatter, "market_tone"),
    policyBias: getString(doc.frontmatter, "policy_bias"),
    liquidityView: getString(doc.frontmatter, "liquidity_view"),
    headlineRisk: getString(doc.frontmatter, "headline_risk"),
    priorityWatchpoints: getStringArray(doc.frontmatter, "priority_watchpoints"),
    notes: doc.sections["Overnight Notes"] ?? "",
  };
}

export async function loadPendingItems(root: string): Promise<string[]> {
  const doc = await loadMarkdown(path.join(root, "state/pending-items.md"));
  return getStringArray(doc.frontmatter, "items");
}

export function indexBy<T>(items: T[], keySelector: (item: T) => string): Map<string, T> {
  // Map 索引让 thesis、industry、position 之间的关联查找保持 O(1)。
  const map = new Map<string, T>();
  for (const item of items) {
    map.set(keySelector(item), item);
  }
  return map;
}

export async function overwriteMarkdown(pathname: string, frontmatter: Frontmatter, body: string): Promise<void> {
  // 所有 Markdown 写回都走统一出口，保证 frontmatter 序列化规则一致。
  const { writeText } = await import("./filesystem.js");
  await writeText(pathname, stringifyMarkdownDocument(frontmatter, body));
}
