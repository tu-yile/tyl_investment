import { listMarkdownFiles, readText } from "./filesystem.js";
import { parseMarkdownDocument, stringifyMarkdownDocument } from "./frontmatter.js";
import {
  resolveInvestmentConfigPath,
  resolveInvestmentKnowledgePath,
} from "../runtime/paths.js";
import type {
  Frontmatter,
  IndustryRecord,
  MarkdownDocument,
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

export async function loadTheses(): Promise<ThesisRecord[]> {
  // 公司知识目录里可能以后还会出现别的 Markdown，这里先按 kind 显式过滤 thesis。
  const docs = await loadCollection(resolveInvestmentKnowledgePath("companies"));
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

export async function loadIndustries(): Promise<IndustryRecord[]> {
  const docs = await loadCollection(resolveInvestmentKnowledgePath("industries"));
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

export async function loadRules(): Promise<RulesConfig> {
  // 执行层只关心关键阈值，因此在这里把多个 Markdown 合并成一份运行时配置。
  const confidence = await loadMarkdown(resolveInvestmentConfigPath("confidence-rules.md"));
  const risk = await loadMarkdown(resolveInvestmentConfigPath("risk-rules.md"));
  const strategy = await loadMarkdown(resolveInvestmentConfigPath("strategy.md"));

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
