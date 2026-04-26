import { readText } from "#src/investment/lib/filesystem.js";
import { loadIndustries } from "#src/investment/lib/loaders.js";
import type { IndustryRecord } from "#src/investment/types.js";
import { extractAgentMarkdown } from "#src/investment/llm/prompting.js";

export interface BuiltIndustryAnalystPrompt {
  prompt: string;
  industry: IndustryRecord;
}

const INDUSTRY_ANALYST_PLACEHOLDERS = {
  industryName: "{{INDUSTRY_NAME}}",
} as const;

function normalizeIndustryRef(value: string): string {
  return value.trim().toLowerCase();
}

async function resolveIndustry(industryRef: string): Promise<IndustryRecord> {
  const industries = await loadIndustries();
  const normalized = normalizeIndustryRef(industryRef);
  const industry =
    industries.find((item) => normalizeIndustryRef(item.industryId) === normalized) ??
    industries.find((item) => normalizeIndustryRef(item.name) === normalized);
  if (!industry) {
    const available = industries.map((item) => `${item.industryId} (${item.name})`).join(", ");
    throw new Error(`Unknown industry: ${industryRef}. Available industries: ${available}`);
  }
  return industry;
}

export function renderIndustryAnalystBasePrompt(
  basePromptTemplate: string,
  industry: IndustryRecord,
): string {
  return basePromptTemplate
    .replaceAll(INDUSTRY_ANALYST_PLACEHOLDERS.industryName, industry.name);
}

function buildIndustryKnowledgeContext(knowledgeMarkdown: string): string {
  return [
    "## Attached Industry Knowledge Base",
    "The following markdown is the current knowledge base for this industry. Treat it as your default domain context.",
    "",
    knowledgeMarkdown.trim(),
  ].join("\n");
}

export async function buildIndustryAnalystPrompt(industryRef: string): Promise<BuiltIndustryAnalystPrompt> {
  const [basePromptTemplate, industry] = await Promise.all([
    extractAgentMarkdown("industry-analyst"),
    resolveIndustry(industryRef),
  ]);
  const knowledgeMarkdown = await readText(industry.path);
  return {
    prompt: [
      renderIndustryAnalystBasePrompt(basePromptTemplate, industry).trim(),
      "",
      buildIndustryKnowledgeContext(knowledgeMarkdown),
    ].join("\n"),
    industry,
  };
}
