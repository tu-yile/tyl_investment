---
kind: workflow
workflow_id: emergency-reassessment
name: 持仓事件应急流
priority: P0
trigger: event_driven
output_name: 应急重评单
---

## Objective

在重大公告、业绩暴雷、政策突变或异常波动出现时，不等待下一交易日，直接快速重评持仓与风险暴露。

## Steps

1. 确认触发事件
2. 定位受影响持仓和行业
3. 快速重评 thesis 和风险
4. 输出应急建议
