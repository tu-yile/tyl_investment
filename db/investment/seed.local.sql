-- 这份种子数据只用于本地开发环境。
-- 它把当前 investment/ 目录中的示例持仓、thesis 和市场上下文导入 SQLite。

DELETE FROM agent_runs;
DELETE FROM positions;
DELETE FROM portfolios;

INSERT INTO portfolios (
  portfolio_id, name, strategy_style, market_scope, holding_period, status, created_at, updated_at
) VALUES
  ('main-portfolio', '主组合', '主动多头', 'A股', '中线', 'active', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

INSERT INTO positions (
  portfolio_id, ticker, name, industry_id, industry_name, status, current_weight, cost_basis, opened_at, thesis_id, conviction_bucket, notes_md, created_at, updated_at
) VALUES
  (
    'main-portfolio', '300750', '宁德时代', 'power-equipment', '电力设备与储能', 'open', 4.0, 188.0, '2026-02-04T09:30:00+08:00',
    'thesis-300750', 'core', '当前为接近常规仓位上限的核心持仓，若 thesis 持续强化，可考虑小幅加仓。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'main-portfolio', '300760', '迈瑞医疗', 'medical-devices', '医疗器械', 'open', 3.0, 256.0, '2026-01-10T09:30:00+08:00',
    'thesis-300760', 'standard', '当前 thesis 稳定但缺乏短期强催化，默认以持有为主。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'main-portfolio', '002466', '天齐锂业', 'non-ferrous-metals', '有色金属', 'open', 2.0, 31.5, '2026-03-18T09:30:00+08:00',
    'thesis-002466', 'standard', '测试环境补充锂资源持仓，用于验证资源股在每日持仓决策流中的处理。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  ),
  (
    'main-portfolio', '000807', '云铝股份', 'non-ferrous-metals', '有色金属', 'open', 2.0, 16.2, '2026-03-24T09:30:00+08:00',
    'thesis-000807', 'standard', '测试环境补充铝行业持仓，用于验证顺周期持仓在每日持仓决策流中的处理。',
    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
  );
