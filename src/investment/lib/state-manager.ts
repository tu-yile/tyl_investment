import fs from "node:fs/promises";
import path from "node:path";
import { todayInShanghai, writeText } from "./filesystem.js";
import { parseMarkdownDocument, stringifyMarkdownDocument } from "./frontmatter.js";
import { indexBy, loadCandidates, loadPositions, loadTheses, overwriteMarkdown } from "./loaders.js";
import type { Frontmatter, PositionRecord, ThesisRecord } from "../types.js";

// 审批命令的参数全部走 --key=value，方便后续接命令行、机器人或调度器。
function parseArgsRecord(rawArgs: string[]): Record<string, string> {
  const parsed: Record<string, string> = {};
  for (const arg of rawArgs) {
    if (!arg.startsWith("--")) {
      continue;
    }
    const [key, value] = arg.slice(2).split("=", 2);
    parsed[key] = value ?? "true";
  }
  return parsed;
}

async function updatePositionWeight(position: PositionRecord, weightChange: number): Promise<void> {
  // v1 写回只更新最终权重，不在这里追踪成交价和执行细节。
  const raw = await fs.readFile(position.path, "utf8");
  const doc = parseMarkdownDocument(position.path, raw);
  const nextWeight = Math.max(0, Math.round((position.weight + weightChange) * 100) / 100);
  const nextFrontmatter: Frontmatter = {
    ...doc.frontmatter,
    weight: nextWeight,
  };
  await overwriteMarkdown(position.path, nextFrontmatter, doc.body);
}

async function touchThesis(thesis: ThesisRecord, runDate: string, decision: string): Promise<void> {
  // thesis 写回保留一条最新决策记录，确保长期记忆不会只剩当前状态而没有上下文。
  const raw = await fs.readFile(thesis.path, "utf8");
  const doc = parseMarkdownDocument(thesis.path, raw);
  const nextFrontmatter: Frontmatter = {
    ...doc.frontmatter,
    last_updated: runDate,
  };
  const nextBody = `${doc.body}\n\n## Latest Decision ${runDate}\n\n${decision}`.trim();
  await overwriteMarkdown(thesis.path, nextFrontmatter, nextBody);
}

export async function rebuildPortfolioMemory(root: string): Promise<string> {
  // portfolio memory 是一个汇总视图，方便人快速看到当前组合和 thesis 覆盖情况。
  const [positions, candidates, theses] = await Promise.all([
    loadPositions(root),
    loadCandidates(root),
    loadTheses(root),
  ]);

  const thesisMap = indexBy(theses, (item) => item.thesisId);
  const body = [
    "## Current Positions",
    ...positions.map((item) => {
      const thesis = thesisMap.get(item.thesisId);
      return `- ${item.name}(${item.ticker}): weight ${item.weight}%, thesis ${thesis?.status ?? "unknown"}`;
    }),
    "",
    "## Candidate Pool",
    ...candidates.map((item) => `- ${item.name}(${item.ticker}): target ${item.targetEntryWeight}%`),
    "",
    "## Thesis Coverage",
    ...theses.map((item) => `- ${item.companyName}(${item.ticker}): ${item.status}, updated ${item.lastUpdated}`),
  ].join("\n");

  const pathname = path.join(root, "state/portfolio-memory.md");
  await writeText(
    pathname,
    stringifyMarkdownDocument(
      {
        kind: "portfolio_memory",
        last_rebuilt: todayInShanghai(),
      },
      body,
    ),
  );
  return pathname;
}

export async function approveSheet(root: string, rawArgs: string[]): Promise<string> {
  // 审批是人工闸门的唯一正式入口：
  // 先更新操作单状态，再决定是否把动作写回持仓和 thesis。
  const args = parseArgsRecord(rawArgs);
  const runDate = args.date ?? todayInShanghai();
  const decision = args.decision ?? "approve";
  const reviewer = args.reviewer ?? "unknown";
  const notes = args.notes ?? "";

  const sheetMarkdownPath = path.join(root, "output/daily", runDate, `${runDate}-daily-operation-sheet.md`);
  const sheetJsonPath = path.join(root, "output/daily", runDate, `${runDate}-daily-operation-sheet.json`);

  const [sheetMarkdownRaw, snapshotRaw, positions, theses] = await Promise.all([
    fs.readFile(sheetMarkdownPath, "utf8"),
    fs.readFile(sheetJsonPath, "utf8"),
    loadPositions(root),
    loadTheses(root),
  ]);

  const sheetDoc = parseMarkdownDocument(sheetMarkdownPath, sheetMarkdownRaw);
  const snapshot = JSON.parse(snapshotRaw) as {
    requiredActions: Array<{ ticker: string; name: string; suggestedWeightChange: number; action: string }>;
  };

  const nextFrontmatter: Frontmatter = {
    ...sheetDoc.frontmatter,
    status: decision,
    reviewer,
    reviewed_at: `${runDate}T09:00:00+08:00`,
  };
  const approvalSection = [
    sheetDoc.body,
    "",
    "## Approval Record",
    `- decision: ${decision}`,
    `- reviewer: ${reviewer}`,
    `- notes: ${notes || "none"}`,
  ].join("\n");
  await overwriteMarkdown(sheetMarkdownPath, nextFrontmatter, approvalSection);

  if (decision === "approve") {
    // 只有明确批准时，才把必须动作写回状态层。
    const positionMap = indexBy(positions, (item) => item.ticker);
    const thesisMap = indexBy(theses, (item) => item.ticker);

    for (const action of snapshot.requiredActions) {
      const position = positionMap.get(action.ticker);
      if (position && action.action !== "hold") {
        await updatePositionWeight(position, action.suggestedWeightChange);
      }
      const thesis = thesisMap.get(action.ticker);
      if (thesis) {
        await touchThesis(thesis, runDate, `${action.name} ${action.action} ${action.suggestedWeightChange}%`);
      }
    }
  }

  const logPath = path.join(root, "state/action-log", `${runDate}-${decision}.md`);
  await writeText(
    logPath,
    stringifyMarkdownDocument(
      {
        kind: "action_log",
        run_date: runDate,
        decision,
        reviewer,
      },
      [
        "## Notes",
        notes || "none",
        "",
        "## Sheet",
        sheetMarkdownPath,
      ].join("\n"),
    ),
  );

  // 每次审批后都重建组合记忆，保证第二天 workflow 读取到的是最新状态。
  await rebuildPortfolioMemory(root);
  return sheetMarkdownPath;
}
