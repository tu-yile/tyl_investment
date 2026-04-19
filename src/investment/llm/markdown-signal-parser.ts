export interface ParsedMarkdownSignalResponse {
  reportMd: string;
  signals: unknown;
}

function getResponseSections(text: string): Record<string, string> {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const matches = [...normalized.matchAll(/^##\s+(.+)\s*$/gm)];
  const sections: Record<string, string> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const title = current[1].trim();
    const start = (current.index ?? 0) + current[0].length;
    const end = next ? (next.index ?? normalized.length) : normalized.length;
    sections[title] = normalized.slice(start, end).trim();
  }
  return sections;
}

function extractFencedBlock(body: string): string | null {
  const match = body.match(/```(?:json|yaml|yml)?\s*([\s\S]*?)```/i);
  if (!match) {
    return null;
  }
  return match[1].trim();
}

function parseSignalsPayload(payload: string | null): unknown {
  if (!payload || payload.trim().length === 0) {
    return undefined;
  }
  return JSON.parse(payload);
}

export function parseMarkdownSignalResponse(text: string): ParsedMarkdownSignalResponse {
  const sections = getResponseSections(text);
  const reportMd = sections.Report;
  if (!reportMd) {
    throw new Error("Agent response is missing `## Report` section.");
  }
  const signalsSection = sections.Signals ?? "";
  const payload = extractFencedBlock(signalsSection);
  return {
    reportMd,
    signals: parseSignalsPayload(payload),
  };
}
