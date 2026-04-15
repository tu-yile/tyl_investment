-- 这份种子数据只用于本地开发环境。
-- 它把当前 investment/ 目录中的示例持仓、候选池、thesis 和市场上下文导入 SQLite。

DELETE FROM execution_results;
DELETE FROM approvals;
DELETE FROM operation_sheet_items;
DELETE FROM operation_sheets;
DELETE FROM risk_gate_results;
DELETE FROM candidate_assessments;
DELETE FROM position_update_cards;
DELETE FROM agent_runs;
DELETE FROM workflow_runs;
DELETE FROM portfolio_snapshots;
DELETE FROM observation_items;
DELETE FROM position_daily_snapshots;
DELETE FROM candidate_pool_entries;
DELETE FROM thesis_versions;
DELETE FROM theses;
DELETE FROM market_context_snapshots;
DELETE FROM positions;
DELETE FROM portfolios;
DELETE FROM instruments;
DELETE FROM industries;

INSERT INTO industries (
  industry_id, name, knowledge_md_path, is_active, created_at, updated_at
) VALUES
  ('power-equipment', '电力设备与储能', 'investment/knowledge/industries/power-equipment.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('medical-devices', '医疗器械', 'investment/knowledge/industries/medical-devices.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('smart-evs', '智能电动车', 'investment/knowledge/industries/smart-evs.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('non-ferrous-metals', '有色金属', 'investment/knowledge/industries/non-ferrous-metals.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO industry_knowledge_versions (
  industry_id, version_no, current_view, recent_change, key_signals_json, watchpoints_json,
  summary_md, source_md_path, editor, created_at
) VALUES
  (
    'power-equipment', 1, 'positive', 'grid_and_storage_supportive',
    '["电网投资维持强度","储能配套需求延续","龙头竞争格局相对稳定"]',
    '["海外需求波动","价格竞争再起","政策补贴节奏"]',
    '产业链包括上游材料、中游电池和储能系统、下游电网与新能源装机需求。',
    'investment/knowledge/industries/power-equipment.md', 'system', CURRENT_TIMESTAMP
  ),
  (
    'medical-devices', 1, 'neutral', 'procurement_recovery_still_mixed',
    '["医院预算逐步修复","高端设备占比提升","海外业务保持扩张"]',
    '["招标节奏波动","院端预算约束","海外合规成本"]',
    '医疗器械行业仍以院端需求、创新器械升级和海外拓展为主要跟踪主线。',
    'investment/knowledge/industries/medical-devices.md', 'system', CURRENT_TIMESTAMP
  ),
  (
    'smart-evs', 1, 'positive', 'new_model_cycle_and_exports_supportive',
    '["新品周期持续推进","出口维持高景气","成本控制改善"]',
    '["价格战升级","出口政策扰动","渠道库存变化"]',
    '智能电动车行业核心观察点在新车型、出口节奏和价格竞争强度。',
    'investment/knowledge/industries/smart-evs.md', 'system', CURRENT_TIMESTAMP
  ),
  (
    'non-ferrous-metals', 1, 'neutral', 'lithium_and_aluminum_prices_stabilizing',
    '["锂价波动趋缓","电解铝供给约束仍在","顺周期预期与制造业需求共振"]',
    '["商品价格回落","能源成本抬升","海外需求扰动"]',
    '有色金属行业当前聚焦锂价企稳、铝价景气韧性以及供需错配能否延续。',
    'investment/knowledge/industries/non-ferrous-metals.md', 'system', CURRENT_TIMESTAMP
  );

INSERT INTO instruments (
  ticker, name, market, asset_type, industry_id, is_active, created_at, updated_at
) VALUES
  ('300750', '宁德时代', 'CN-A', 'equity', 'power-equipment', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('300760', '迈瑞医疗', 'CN-A', 'equity', 'medical-devices', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('002594', '比亚迪', 'CN-A', 'equity', 'smart-evs', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('002466', '天齐锂业', 'CN-A', 'equity', 'non-ferrous-metals', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('000807', '云铝股份', 'CN-A', 'equity', 'non-ferrous-metals', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO portfolios (
  portfolio_id, name, strategy_style, market_scope, holding_period, status, created_at, updated_at
) VALUES
  ('main-portfolio', '主组合', '主动多头', 'A股', '中线', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO theses (
  thesis_id, ticker, industry_id, status, catalyst_strength, valuation_view, risk_level,
  confidence_base, monitoring_flags_json, last_updated, source_md_path, current_version_no, created_at, updated_at
) VALUES
  (
    'thesis-300750', '300750', 'power-equipment', 'strengthened', 'strong', 'okay', 'medium',
    0.72, '["关注海外需求波动","跟踪储能盈利弹性"]',
    '2026-04-08', 'investment/knowledge/companies/300750-CATL/thesis.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'thesis-300760', '300760', 'medical-devices', 'unchanged', 'none', 'okay', 'medium',
    0.64, '["关注院端招标节奏","跟踪海外拓展兑现"]',
    '2026-04-08', 'investment/knowledge/companies/300760-Mindray/thesis.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'thesis-002594', '002594', 'smart-evs', 'strengthened', 'moderate', 'okay', 'medium',
    0.74, '["观察出口销量","跟踪价格战变化"]',
    '2026-04-08', 'investment/knowledge/companies/002594-BYD/thesis.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'thesis-002466', '002466', 'non-ferrous-metals', 'unchanged', 'moderate', 'okay', 'high',
    0.61, '["跟踪锂价企稳持续性","观察库存与海外需求变化"]',
    '2026-04-09', 'investment/knowledge/companies/002466-TianqiLithium/thesis.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'thesis-000807', '000807', 'non-ferrous-metals', 'strengthened', 'moderate', 'okay', 'medium',
    0.63, '["跟踪铝价与氧化铝成本","关注水电和供给约束变化"]',
    '2026-04-09', 'investment/knowledge/companies/000807-YunAluminum/thesis.md', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO thesis_versions (
  thesis_id, version_no, change_reason, editor, core_claim_md, key_drivers_md,
  invalidation_conditions_md, verified_points_md, falsified_points_md, created_at
) VALUES
  (
    'thesis-300750', 1, 'local-seed', 'system',
    '宁德时代的核心投资逻辑在于全球电池和储能龙头地位、技术迭代能力以及较强的成本控制和现金流质量。',
    '- 储能需求扩张\n- 海外客户拓展\n- 技术和规模优势巩固盈利能力',
    '- 龙头地位显著弱化\n- 海外扩张受阻且盈利持续恶化\n- 行业价格战导致长期回报逻辑被破坏',
    '- 储能业务对中期增长支撑增强\n- 电网与储能景气并未转弱',
    '- 暂无重大证伪点',
    CURRENT_TIMESTAMP
  ),
  (
    'thesis-300760', 1, 'local-seed', 'system',
    '迈瑞医疗的核心投资逻辑在于高端器械平台能力、渠道和服务壁垒，以及稳健现金流带来的长期复利属性。',
    '- 医院预算恢复\n- 高端产品占比提升\n- 海外市场扩张',
    '- 核心产品竞争力下降\n- 海外拓展受阻且盈利能力恶化\n- 政策冲击导致长期回报中枢下移',
    '- 行业需求没有明显恶化\n- 公司中长期竞争力仍在',
    '- 短期强催化剂并不明显',
    CURRENT_TIMESTAMP
  ),
  (
    'thesis-002594', 1, 'local-seed', 'system',
    '比亚迪的核心投资逻辑在于整车与供应链协同、产品周期、出口扩张和智能化能力带来的份额提升。',
    '- 新车型与结构升级\n- 出口放量\n- 垂直整合提升盈利韧性',
    '- 价格战拖累盈利超预期\n- 出口和新品兑现低于预期\n- 品牌和技术优势减弱',
    '- 行业仍有景气支撑\n- 新品和出口是有效增量',
    '- 暂无重大证伪点',
    CURRENT_TIMESTAMP
  ),
  (
    'thesis-002466', 1, 'local-seed', 'system',
    '天齐锂业的核心投资逻辑在于锂资源禀赋、全球化资产布局以及锂价企稳后利润弹性的释放。',
    '- 锂价边际企稳\n- 资源端成本优势\n- 海外资产协同改善盈利弹性',
    '- 锂价再次深度下行\n- 需求恢复持续弱于预期\n- 资产负债表压力重新上升',
    '- 锂资源龙头地位仍在\n- 行业去库存逐步推进',
    '- 锂价弹性仍高度依赖商品周期',
    CURRENT_TIMESTAMP
  ),
  (
    'thesis-000807', 1, 'local-seed', 'system',
    '云铝股份的核心投资逻辑在于绿色水电铝成本优势、供给约束环境下的盈利韧性以及顺周期需求修复弹性。',
    '- 电解铝供给约束延续\n- 水电成本优势\n- 制造业和出口需求修复',
    '- 铝价明显回落\n- 能源与氧化铝成本大幅抬升\n- 需求修复不及预期',
    '- 行业供给弹性仍受约束\n- 绿色铝成本曲线具备竞争力',
    '- 周期股估值修复持续性仍待验证',
    CURRENT_TIMESTAMP
  );

INSERT INTO market_context_snapshots (
  as_of_date, market_tone, policy_bias, liquidity_view, headline_risk, priority_watchpoints_json, notes_md, created_at
) VALUES
  (
    '2026-04-09', 'neutral', 'supportive', 'balanced', 'medium',
    '["业绩披露期指引变化","出口与汇率波动","板块轮动加快"]',
    '- 宏观层面没有新的系统性收紧信号\n- 政策面对制造业和科技仍偏支持\n- 风险偏好仍受业绩验证和板块轮动影响',
    CURRENT_TIMESTAMP
  );

INSERT INTO positions (
  portfolio_id, ticker, status, current_weight, cost_basis, opened_at, thesis_id, conviction_bucket, notes_md, created_at, updated_at
) VALUES
  (
    'main-portfolio', '300750', 'open', 4.0, 188.0, '2026-02-04T09:30:00+08:00',
    'thesis-300750', 'core', '当前为接近常规仓位上限的核心持仓，若 thesis 持续强化，可考虑小幅加仓。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'main-portfolio', '300760', 'open', 3.0, 256.0, '2026-01-10T09:30:00+08:00',
    'thesis-300760', 'standard', '当前 thesis 稳定但缺乏短期强催化，默认以持有为主。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'main-portfolio', '002466', 'open', 2.0, 31.5, '2026-03-18T09:30:00+08:00',
    'thesis-002466', 'standard', '测试环境补充锂资源持仓，用于验证资源股在每日持仓决策流中的处理。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'main-portfolio', '000807', 'open', 2.0, 16.2, '2026-03-24T09:30:00+08:00',
    'thesis-000807', 'standard', '测试环境补充铝行业持仓，用于验证顺周期持仓在每日持仓决策流中的处理。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );

INSERT INTO candidate_pool_entries (
  portfolio_id, ticker, status, target_entry_weight, source_flow, thesis_id, ranking_score,
  inserted_at, last_reviewed_at, notes_md
) VALUES
  (
    'main-portfolio', '002594', 'active', 2.0, 'new-opportunity-discovery', 'thesis-002594', 0.74,
    '2026-04-08T20:30:00+08:00', '2026-04-08T20:30:00+08:00',
    '属于候选池中的高关注标的，但当前更适合作为替代排序对象，而不是直接强制入池。'
  );

INSERT INTO observation_items (
  entity_type, entity_id, category, content_md, status, priority, created_at, updated_at
) VALUES
  ('ticker', '300750', 'follow_up', '跟踪储能订单兑现', 'open', 'high', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ticker', '300760', 'follow_up', '关注迈瑞院端招标节奏', 'open', 'medium', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ticker', '002594', 'follow_up', '观察比亚迪出口销量', 'open', 'medium', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ticker', '002466', 'follow_up', '跟踪锂价企稳和行业去库存进展', 'open', 'medium', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  ('ticker', '000807', 'follow_up', '关注铝价、氧化铝成本和云南水电供给变化', 'open', 'medium', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO portfolio_snapshots (
  portfolio_id, snapshot_date, total_equity_weight, cash_weight, sector_exposure_json, style_exposure_json, risk_budget_json, notes_md, created_at
) VALUES
  (
    'main-portfolio', '2026-04-09', 11.0, 89.0,
    '{"power-equipment":4.0,"medical-devices":3.0,"non-ferrous-metals":4.0}',
    '{"growth":4.5,"quality":2.5,"cyclical":4.0}',
    '{"single_name_regular_cap":5,"single_sector_cap":25}',
    '本地初始化快照。',
    CURRENT_TIMESTAMP
  );
