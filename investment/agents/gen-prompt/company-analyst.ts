import { readText } from "#src/investment/lib/filesystem.js";
import { loadTheses } from "#src/investment/lib/loaders.js";
import type { ThesisRecord } from "#src/investment/types.js";
import { extractAgentMarkdown } from "#src/investment/llm/prompting.js";

export interface BuiltCompanyAnalystPrompt {
  prompt: string;
  thesis: ThesisRecord;
}

const COMPANY_ANALYST_PLACEHOLDERS = {
  companyName: "{{COMPANY_NAME}}",
} as const;

function normalizeCompanyRef(value: string): string {
  return value.trim().toLowerCase();
}

async function resolveThesis(companyRef: string): Promise<ThesisRecord> {
  const theses = await loadTheses();
  const normalized = normalizeCompanyRef(companyRef);
  const thesis =
    theses.find((item) => normalizeCompanyRef(item.ticker) === normalized) ??
    theses.find((item) => normalizeCompanyRef(item.companyName) === normalized) ??
    theses.find((item) => normalizeCompanyRef(item.thesisId) === normalized);
  if (!thesis) {
    const available = theses.map((item) => `${item.ticker} (${item.companyName})`).join(", ");
    throw new Error(`Unknown company: ${companyRef}. Available companies: ${available}`);
  }
  return thesis;
}

export function renderCompanyAnalystBasePrompt(
  basePromptTemplate: string,
  thesis: ThesisRecord,
): string {
  return basePromptTemplate.replaceAll(COMPANY_ANALYST_PLACEHOLDERS.companyName, thesis.companyName);
}

function buildCompanyKnowledgeContext(thesisMarkdown: string): string {
  return [
    "## Attached Company Thesis Knowledge Base",
    "The following markdown is the current thesis knowledge base for this company. Treat it as your default company context.",
    "",
    thesisMarkdown.trim(),
  ].join("\n");
}

export async function buildCompanyAnalystPrompt(companyRef: string): Promise<BuiltCompanyAnalystPrompt> {
  const [basePromptTemplate, thesis] = await Promise.all([
    extractAgentMarkdown("company-analyst"),
    resolveThesis(companyRef),
  ]);
  const thesisMarkdown = await readText(thesis.path);
  return {
    prompt: [
      renderCompanyAnalystBasePrompt(basePromptTemplate, thesis).trim(),
      "",
      buildCompanyKnowledgeContext(thesisMarkdown),
    ].join("\n"),
    thesis,
  };
}
