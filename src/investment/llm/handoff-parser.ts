import { createHash } from "node:crypto";

// LLM 输出采用自由文本 + `## Handoff` 的双层结构。
// 这里集中处理所有 Markdown handoff 解析和类型守门，避免每个 agent 节点都重复写一次。

export function stableEventId(parts: string[]): string {
  return createHash("sha1").update(parts.join("|")).digest("hex");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getResponseSections(text: string): Record<string, string> {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  const matches = [...normalized.matchAll(/^##\s+(.+)\s*$/gm)];
  const sections: Record<string, string> = {};
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    const title = current[1].trim();
    const start = current.index! + current[0].length;
    const end = next ? next.index! : normalized.length;
    sections[title] = normalized.slice(start, end).trim();
  }
  return sections;
}

export function extractHandoff(text: string): string {
  const sections = getResponseSections(text);
  const handoff = sections.Handoff;
  if (!handoff) {
    throw new Error("Agent response is missing `## Handoff` section.");
  }
  return handoff;
}

export function extractRepeatedBlocks(body: string, heading: string): string[] {
  const regex = new RegExp(`^###\\s+${escapeRegExp(heading)}\\s*$`, "gm");
  const matches = [...body.matchAll(regex)];
  return matches.map((match, index) => {
    const start = match.index! + match[0].length;
    const end = matches[index + 1] ? matches[index + 1].index! : body.length;
    return body.slice(start, end).trim();
  });
}

export function extractNamedSection(body: string, heading: string): string | null {
  const blocks = extractRepeatedBlocks(body, heading);
  if (blocks.length === 0) {
    return null;
  }
  return blocks.join("\n\n").trim();
}

function parseBulletList(lines: string[], startIndex: number): { values: string[]; nextIndex: number } {
  const values: string[] = [];
  let index = startIndex;
  while (index < lines.length) {
    const line = lines[index];
    if (/^\s*-\s+/.test(line)) {
      values.push(line.replace(/^\s*-\s+/, "").trim());
      index += 1;
      continue;
    }
    if (!line.trim()) {
      index += 1;
      continue;
    }
    break;
  }
  return { values, nextIndex: index };
}

function parseFencedBlock(lines: string[], startIndex: number): { value: string; nextIndex: number } {
  let index = startIndex;
  if (!lines[index]?.trim().startsWith("```")) {
    return { value: "", nextIndex: startIndex };
  }
  index += 1;
  const chunks: string[] = [];
  while (index < lines.length && !lines[index].trim().startsWith("```")) {
    chunks.push(lines[index]);
    index += 1;
  }
  if (index < lines.length && lines[index].trim().startsWith("```")) {
    index += 1;
  }
  return {
    value: chunks.join("\n").trim(),
    nextIndex: index,
  };
}

export function parseFieldBlock(block: string): Record<string, string | string[]> {
  const lines = block.replace(/\r\n/g, "\n").split("\n");
  const fields: Record<string, string | string[]> = {};
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trimEnd();
    if (!line.trim()) {
      index += 1;
      continue;
    }
    const match = line.match(/^([a-z0-9_]+):\s*(.*)$/i);
    if (!match) {
      index += 1;
      continue;
    }
    const key = match[1];
    const inlineValue = match[2].trim();
    if (inlineValue) {
      fields[key] = inlineValue;
      index += 1;
      continue;
    }
    const nextLine = lines[index + 1]?.trim() ?? "";
    if (nextLine.startsWith("```")) {
      const fenced = parseFencedBlock(lines, index + 1);
      fields[key] = fenced.value;
      index = fenced.nextIndex;
      continue;
    }
    if (nextLine.startsWith("-")) {
      const bulletList = parseBulletList(lines, index + 1);
      fields[key] = bulletList.values;
      index = bulletList.nextIndex;
      continue;
    }
    const chunks: string[] = [];
    let cursor = index + 1;
    while (cursor < lines.length) {
      const candidate = lines[cursor];
      if (!candidate.trim()) {
        cursor += 1;
        if (chunks.length > 0) {
          break;
        }
        continue;
      }
      if (/^[a-z0-9_]+:\s*/i.test(candidate) || /^###\s+/.test(candidate)) {
        break;
      }
      chunks.push(candidate.trim());
      cursor += 1;
    }
    fields[key] = chunks.join("\n").trim();
    index = cursor;
  }
  return fields;
}

export function extractLinesAsBullets(block: string): string[] {
  return block
    .split("\n")
    .map((line) => line.replace(/^\s*-\s+/, "").trim())
    .filter((line) => Boolean(line) && !/^###\s+/.test(line));
}

export function expectString(fields: Record<string, string | string[]>, key: string): string {
  const value = fields[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required string field \`${key}\`.`);
  }
  return value.trim();
}

export function expectArray(fields: Record<string, string | string[]>, key: string): string[] {
  const value = fields[key];
  if (!Array.isArray(value)) {
    throw new Error(`Missing required array field \`${key}\`.`);
  }
  return value.map((item) => item.trim()).filter(Boolean);
}

export function optionalArray(fields: Record<string, string | string[]>, key: string): string[] {
  const value = fields[key];
  if (!value) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean);
  }
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseNumber(value: string, fieldName: string): number {
  const normalized = value.replace(/%/g, "").trim();
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    throw new Error(`Field \`${fieldName}\` must be numeric, got: ${value}`);
  }
  return parsed;
}

export function parseConfidence(value: string, fieldName: string): number {
  const parsed = parseNumber(value, fieldName);
  if (parsed < 0 || parsed > 1) {
    throw new Error(`Field \`${fieldName}\` must be between 0 and 1.`);
  }
  return parsed;
}

export function expectEnum<T extends string>(value: string, allowed: readonly T[], fieldName: string): T {
  if (!allowed.includes(value as T)) {
    throw new Error(`Field \`${fieldName}\` must be one of ${allowed.join(", ")}, got: ${value}`);
  }
  return value as T;
}
