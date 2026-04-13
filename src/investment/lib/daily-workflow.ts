import { stringifyMarkdownDocument } from "./frontmatter.js";
import type { PositionUpdateCard } from "../types.js";

export function renderUpdateCard(runDate: string, update: PositionUpdateCard): string {
  // Position Update Card 是最适合人工逐票复核的中间文档，所以单独写文件。
  return stringifyMarkdownDocument(
    {
      kind: "position_update_card",
      run_date: runDate,
      ticker: update.ticker,
      thesis_status: update.thesisStatus,
      today_view: update.todayView,
      suggested_weight_change: update.suggestedWeightChange,
      confidence: update.confidence,
      action: update.action,
      priority: update.priority,
    },
    [
      "## Why Now",
      update.whyNow,
      "",
      "## Risk Flags",
      ...update.riskFlags.map((flag) => `- ${flag}`),
    ].join("\n"),
  );
}
