import path from "node:path";

// LangGraph 的 checkpoint 和业务 SQLite 分开存放，避免调试时互相污染。
export function resolveLangGraphCheckpointPath(repoRoot: string): string {
  return (
    process.env.INVESTMENT_LANGGRAPH_CHECKPOINT_DB_PATH ??
    path.join(repoRoot, "investment/data/langgraph-checkpoints.sqlite3")
  );
}
