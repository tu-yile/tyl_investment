---
kind: workflow
workflow_id: daily-position-decision
name: 每日持仓决策流
priority: P0
primary_trigger: 07:45
rerun_trigger: 08:55
output_name: 今日持仓操作单
---

## Objective

在每个交易日盘前形成一份统一口径的《今日持仓操作单》，覆盖市场态度、组合总动作、个股动作清单、风险提示和重点观察名单。

## Steps

1. 交易日与系统可运行检查
2. 状态快照加载
3. 隔夜信息扫描
4. 持仓逐票重评
5. 候选池替代评估
6. 组合级风险闸门
7. CIO 汇总与冲突消解
8. 生成今日持仓操作单
9. 人工确认
10. 执行结果写回
