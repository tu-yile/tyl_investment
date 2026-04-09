PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- 参考主数据：证券基础信息。
CREATE TABLE IF NOT EXISTS instruments (
  ticker TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  market TEXT NOT NULL DEFAULT 'CN-A',
  asset_type TEXT NOT NULL DEFAULT 'equity',
  industry_id TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- 参考主数据：行业主表。
CREATE TABLE IF NOT EXISTS industries (
  industry_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  knowledge_md_path TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

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

CREATE INDEX IF NOT EXISTS idx_instruments_industry_id
  ON instruments (industry_id);

-- 当前有效持仓表。
-- 它回答“此刻组合里拿着什么、持多少、对应哪条 thesis”。
CREATE TABLE IF NOT EXISTS positions (
  position_id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
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
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id),
  FOREIGN KEY (ticker) REFERENCES instruments(ticker)
);

CREATE INDEX IF NOT EXISTS idx_positions_portfolio_status
  ON positions (portfolio_id, status);

CREATE INDEX IF NOT EXISTS idx_positions_ticker
  ON positions (ticker);

-- 每日持仓快照表。
-- 不直接覆盖历史，而是保存某一交易日组合的持仓状态。
CREATE TABLE IF NOT EXISTS position_daily_snapshots (
  snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  trade_date TEXT NOT NULL,
  ticker TEXT NOT NULL,
  weight REAL NOT NULL,
  cost_basis REAL,
  holding_days INTEGER,
  thesis_id TEXT,
  thesis_status TEXT,
  sector_name TEXT,
  industry_id TEXT,
  source_run_id TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id),
  FOREIGN KEY (ticker) REFERENCES instruments(ticker)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_position_daily_snapshots_portfolio_date_ticker
  ON position_daily_snapshots (portfolio_id, trade_date, ticker);

CREATE INDEX IF NOT EXISTS idx_position_daily_snapshots_trade_date
  ON position_daily_snapshots (trade_date);

-- 候选池表。
-- 这里保存候选池状态流转，而不是只保留当前一份名单。
CREATE TABLE IF NOT EXISTS candidate_pool_entries (
  candidate_id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  status TEXT NOT NULL,
  target_entry_weight REAL,
  source_flow TEXT,
  thesis_id TEXT,
  ranking_score REAL,
  inserted_at TEXT NOT NULL,
  removed_at TEXT,
  last_reviewed_at TEXT,
  notes_md TEXT,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id),
  FOREIGN KEY (ticker) REFERENCES instruments(ticker)
);

CREATE INDEX IF NOT EXISTS idx_candidate_pool_entries_portfolio_status
  ON candidate_pool_entries (portfolio_id, status);

CREATE INDEX IF NOT EXISTS idx_candidate_pool_entries_ticker
  ON candidate_pool_entries (ticker);

-- thesis 主表，只保留 workflow 真正要读的结构化字段。
-- 长文本仍建议继续保留在 Markdown。
CREATE TABLE IF NOT EXISTS theses (
  thesis_id TEXT PRIMARY KEY,
  ticker TEXT NOT NULL,
  industry_id TEXT,
  status TEXT NOT NULL,
  catalyst_strength TEXT,
  valuation_view TEXT,
  risk_level TEXT,
  confidence_base REAL,
  last_updated TEXT NOT NULL,
  source_md_path TEXT,
  current_version_no INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (ticker) REFERENCES instruments(ticker)
);

CREATE INDEX IF NOT EXISTS idx_theses_ticker
  ON theses (ticker);

CREATE INDEX IF NOT EXISTS idx_theses_status
  ON theses (status);

-- thesis 版本表。
-- 用来给长文本 thesis 建立审计历史，不要求每次都把正文脱离 Markdown。
CREATE TABLE IF NOT EXISTS thesis_versions (
  thesis_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  thesis_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  change_reason TEXT,
  editor TEXT,
  core_claim_md TEXT,
  key_drivers_md TEXT,
  invalidation_conditions_md TEXT,
  verified_points_md TEXT,
  falsified_points_md TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (thesis_id) REFERENCES theses(thesis_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_thesis_versions_thesis_version
  ON thesis_versions (thesis_id, version_no);

-- 行业知识库版本索引表。
-- v1 只做元数据和摘要索引，正文仍保留 Markdown。
CREATE TABLE IF NOT EXISTS industry_knowledge_versions (
  industry_knowledge_version_id INTEGER PRIMARY KEY AUTOINCREMENT,
  industry_id TEXT NOT NULL,
  version_no INTEGER NOT NULL,
  current_view TEXT,
  recent_change TEXT,
  summary_md TEXT,
  source_md_path TEXT,
  editor TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (industry_id) REFERENCES industries(industry_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_industry_knowledge_versions_industry_version
  ON industry_knowledge_versions (industry_id, version_no);

-- 市场上下文快照。
-- 每日 workflow 会读取这张表，而不是只依赖单份 state 文件。
CREATE TABLE IF NOT EXISTS market_context_snapshots (
  market_context_id INTEGER PRIMARY KEY AUTOINCREMENT,
  as_of_date TEXT NOT NULL,
  market_tone TEXT NOT NULL,
  policy_bias TEXT,
  liquidity_view TEXT,
  headline_risk TEXT,
  priority_watchpoints_json TEXT,
  notes_md TEXT,
  created_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_market_context_snapshots_as_of_date
  ON market_context_snapshots (as_of_date);

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

-- 单票重评结果表。
CREATE TABLE IF NOT EXISTS position_update_cards (
  position_update_card_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  thesis_status TEXT NOT NULL,
  today_view TEXT NOT NULL,
  suggested_weight_change REAL NOT NULL DEFAULT 0,
  confidence REAL NOT NULL,
  why_now TEXT,
  risk_flags_json TEXT,
  action TEXT NOT NULL,
  priority TEXT,
  score REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(workflow_run_id),
  FOREIGN KEY (ticker) REFERENCES instruments(ticker)
);

CREATE INDEX IF NOT EXISTS idx_position_update_cards_workflow_run_id
  ON position_update_cards (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_position_update_cards_ticker
  ON position_update_cards (ticker);

-- 候选池替代评估结果表。
CREATE TABLE IF NOT EXISTS candidate_assessments (
  candidate_assessment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id TEXT NOT NULL,
  ticker TEXT NOT NULL,
  score REAL NOT NULL,
  confidence REAL NOT NULL,
  action TEXT NOT NULL,
  why_now TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(workflow_run_id),
  FOREIGN KEY (ticker) REFERENCES instruments(ticker)
);

CREATE INDEX IF NOT EXISTS idx_candidate_assessments_workflow_run_id
  ON candidate_assessments (workflow_run_id);

-- 风险闸门结果表。
CREATE TABLE IF NOT EXISTS risk_gate_results (
  risk_gate_result_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id TEXT NOT NULL,
  decision TEXT NOT NULL,
  alerts_json TEXT,
  not_to_do_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(workflow_run_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_risk_gate_results_workflow_run_id
  ON risk_gate_results (workflow_run_id);

-- 每日操作单主表。
CREATE TABLE IF NOT EXISTS operation_sheets (
  operation_sheet_id INTEGER PRIMARY KEY AUTOINCREMENT,
  workflow_run_id TEXT NOT NULL,
  run_date TEXT NOT NULL,
  portfolio_id TEXT,
  status TEXT NOT NULL,
  market_attitude TEXT,
  risk_gate_decision TEXT,
  markdown_path TEXT,
  json_path TEXT,
  created_at TEXT NOT NULL,
  reviewed_at TEXT,
  reviewer TEXT,
  FOREIGN KEY (workflow_run_id) REFERENCES workflow_runs(workflow_run_id),
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_operation_sheets_workflow_run_id
  ON operation_sheets (workflow_run_id);

CREATE INDEX IF NOT EXISTS idx_operation_sheets_run_date
  ON operation_sheets (run_date);

-- 每日操作单条目表。
-- item_bucket 区分 required / optional / hold / watch。
CREATE TABLE IF NOT EXISTS operation_sheet_items (
  operation_sheet_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_sheet_id INTEGER NOT NULL,
  item_bucket TEXT NOT NULL,
  ticker TEXT,
  action TEXT,
  weight_change REAL,
  confidence REAL,
  reason TEXT,
  cancel_condition TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY (operation_sheet_id) REFERENCES operation_sheets(operation_sheet_id),
  FOREIGN KEY (ticker) REFERENCES instruments(ticker)
);

CREATE INDEX IF NOT EXISTS idx_operation_sheet_items_sheet_id
  ON operation_sheet_items (operation_sheet_id, item_bucket, sort_order);

-- 审批主表。
-- 它记录“人如何处理这张操作单”，是治理层最关键的审计对象之一。
CREATE TABLE IF NOT EXISTS approvals (
  approval_id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_sheet_id INTEGER NOT NULL,
  decision TEXT NOT NULL,
  reviewer TEXT NOT NULL,
  notes_md TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (operation_sheet_id) REFERENCES operation_sheets(operation_sheet_id)
);

CREATE INDEX IF NOT EXISTS idx_approvals_operation_sheet_id
  ON approvals (operation_sheet_id);

-- 实际执行结果表。
-- v1 虽然不自动下单，但应该记录“建议是否被采纳以及最终执行成什么样”。
CREATE TABLE IF NOT EXISTS execution_results (
  execution_result_id INTEGER PRIMARY KEY AUTOINCREMENT,
  operation_sheet_item_id INTEGER NOT NULL,
  execution_decision TEXT NOT NULL,
  approved_weight_change REAL,
  executed_weight_change REAL,
  executor TEXT,
  executed_at TEXT,
  notes_md TEXT,
  FOREIGN KEY (operation_sheet_item_id) REFERENCES operation_sheet_items(operation_sheet_item_id)
);

CREATE INDEX IF NOT EXISTS idx_execution_results_operation_sheet_item_id
  ON execution_results (operation_sheet_item_id);

-- 观察事项与待办项。
-- 统一承接 pending items、重点观察名单和后续跟踪任务。
CREATE TABLE IF NOT EXISTS observation_items (
  observation_item_id INTEGER PRIMARY KEY AUTOINCREMENT,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  category TEXT,
  content_md TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  priority TEXT,
  source_workflow_run_id TEXT,
  due_date TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  closed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_observation_items_status
  ON observation_items (status, priority);

-- 组合快照表。
-- 用于周度审查、月度归因、风控回溯。
CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  portfolio_snapshot_id INTEGER PRIMARY KEY AUTOINCREMENT,
  portfolio_id TEXT NOT NULL,
  snapshot_date TEXT NOT NULL,
  total_equity_weight REAL,
  cash_weight REAL,
  sector_exposure_json TEXT,
  style_exposure_json TEXT,
  risk_budget_json TEXT,
  notes_md TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (portfolio_id) REFERENCES portfolios(portfolio_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_portfolio_snapshots_portfolio_date
  ON portfolio_snapshots (portfolio_id, snapshot_date);
