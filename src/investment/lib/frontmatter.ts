import type { Frontmatter, MarkdownDocument } from "../types.js";

// v1 故意保持 frontmatter 语法简单：
// 标量直接解析，数组和对象走 JSON，避免引入完整 YAML 解析器。
function parseValue(rawValue: string): unknown {
  const value = rawValue.trim();
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value === "null") {
    return null;
  }
  if (value.startsWith("[") || value.startsWith("{")) {
    return JSON.parse(value);
  }
  if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  if (/^-?\d+(\.\d+)?$/.test(value)) {
    return Number(value);
  }
  return value;
}

export function parseMarkdownDocument<T extends Frontmatter = Frontmatter>(
  path: string,
  raw: string,
): MarkdownDocument<T> {
  let body = raw;
  const frontmatter = {} as T;

  // 只识别最外层 frontmatter，避免正文里的 --- 被误判。
  if (raw.startsWith("---\n")) {
    const end = raw.indexOf("\n---\n", 4);
    if (end >= 0) {
      const fmText = raw.slice(4, end);
      body = raw.slice(end + 5);
      for (const line of fmText.split("\n")) {
        if (!line.trim()) {
          continue;
        }
        const separatorIndex = line.indexOf(":");
        if (separatorIndex === -1) {
          continue;
        }
        const key = line.slice(0, separatorIndex).trim();
        const value = line.slice(separatorIndex + 1);
        (frontmatter as Frontmatter)[key] = parseValue(value);
      }
    }
  }

  const sections: Record<string, string> = {};
  let currentSection = "body";
  const linesBySection: Record<string, string[]> = { body: [] };

  // section 拆分约定只认二级标题，目的是让知识库与 thesis 模板保持稳定结构。
  for (const line of body.split("\n")) {
    if (line.startsWith("## ")) {
      currentSection = line.slice(3).trim();
      linesBySection[currentSection] = [];
      continue;
    }
    linesBySection[currentSection] ??= [];
    linesBySection[currentSection].push(line);
  }

  for (const [section, lines] of Object.entries(linesBySection)) {
    sections[section] = lines.join("\n").trim();
  }

  return {
    path,
    frontmatter,
    body: body.trim(),
    sections,
  };
}

// 序列化时尽量输出人能直接维护的格式，必要时再退回 JSON 字符串。
function formatValue(value: unknown): string {
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value) || typeof value === "object") {
    return JSON.stringify(value);
  }
  const stringValue = String(value);
  if (/^[\w.\-/%]+$/.test(stringValue)) {
    return stringValue;
  }
  return JSON.stringify(stringValue);
}

export function stringifyMarkdownDocument(frontmatter: Frontmatter, body: string): string {
  // 统一由一个出口生成 Markdown，避免不同写回逻辑产生风格漂移。
  const lines = Object.entries(frontmatter).map(([key, value]) => `${key}: ${formatValue(value)}`);
  return `---\n${lines.join("\n")}\n---\n\n${body.trim()}\n`;
}
