PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 组合主表。
CREATE TABLE IF NOT EXISTS portfolios (
  portfolio_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  strategy_style TEXT NOT NULL,
  market_scope TEXT NOT NULL,
  holding_period TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 当前有效持仓表。
-- 它回答“此刻组合里拿着什么、持多少、对应哪条 thesis”。
CREATE TABLE IF NOT EXISTS positions (
  position_id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  industry_id TEXT,
  industry_name TEXT,
  status TEXT NOT NULL DEFAULT 'open',
  current_weight REAL NOT NULL,
  cost_basis REAL,
  opened_at TEXT,
  closed_at TEXT,
  thesis_id TEXT,
  conviction_bucket TEXT,
  notes_md TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id)
);

CREATE INDEX IF NOT EXISTS idx_positions_portfolio_status
  ON positions (portfolio_id, status);

CREATE INDEX IF NOT EXISTS idx_positions_ticker
  ON positions (ticker);

-- 市场上下文快照。
-- 每日 workflow 会读取这张表，而不是只依赖单份 state 文件。
-- workflow 运行记录。
-- 用来回答某天某条流是否成功跑完，以及在哪个节点失败。
CREATE TABLE IF NOT EXISTS workflow_runs (
  workflow_run_id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL,
  portfolio_id TEXT,
  run_date TEXT NOT NULL,
  trigger_type TEXT NOT NULL,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_message TEXT,
  summary_json TEXT,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id)
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_date
  ON workflow_runs (workflow_id, run_date);

-- agent 运行记录。
-- scope_type / scope_key 用来标记“针对哪只票、哪个行业、哪个组合”。
CREATE TABLE IF NOT EXISTS agent_runs (
  agent_run_id TEXT PRIMARY KEY,
  workflow_run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  scope_type TEXT,
  scope_key TEXT,
  status TEXT NOT NULL,
  input_summary_json TEXT,
  output_summary_json TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_message TEXT,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(workflow_run_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_runs_workflow_run_id
  ON agent_runs (workflow_run_id);

-- agent 产物索引表。
-- Markdown 报告落文件，数据库只保存路径、哈希和最小结构化信号。
CREATE TABLE IF NOT EXISTS agent_artifacts (
  artifact_id TEXT PRIMARY KEY,
  agent_run_id TEXT NOT NULL,
  workflow_run_id TEXT NOT NULL,
  agent_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  scope_type TEXT,
  scope_key TEXT,
  report_path TEXT NOT NULL,
  report_sha256 TEXT,
  signals_json TEXT,
  summary_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (agent_run_id) REFERENCES agent_runs(agent_run_id),
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(workflow_run_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_workflow_run
  ON agent_artifacts (workflow_run_id, agent_id, created_at);

CREATE INDEX IF NOT EXISTS idx_agent_artifacts_scope
  ON agent_artifacts (scope_type, scope_key, created_at);

-- 已废弃的中间表不再保留，初始化时直接清理，避免新旧口径并存。
DROP TABLE IF EXISTS position_update_cards;
DROP TABLE IF EXISTS candidate_assessments;
DROP TABLE IF EXISTS risk_gate_results;
