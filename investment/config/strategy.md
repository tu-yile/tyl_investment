---
kind: strategy_config
system_name: A股主动多头中线多Agent投研系统
market_scope: A股
strategy_style: 主动多头
holding_period: 中线
decision_mode: advisory_only
human_in_the_loop: true
agent_invocation_mode: standalone
replacement_score_gap: 0.12
---

## Mission

持续跟踪持仓与候选池，在市场、行业、公司、风险和组合约束共同作用下，生成可执行但需人工审批的每日操作建议。

## Decision Priorities

1. 先保证 thesis 和风险判断正确
2. 再判断是否需要动作
3. 最后从组合角度排序资金去向
