import path from "node:path";

// investment 子系统默认把 SQLite 文件放在 investment/data 目录下，
// 这样知识资产、输出和运行态数据库都收敛在同一个工作空间里。
export function resolveInvestmentDbPath(repoRoot: string): string {
  return process.env.INVESTMENT_DB_PATH ?? path.join(repoRoot, "investment/data/investment.sqlite3");
}
