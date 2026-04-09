---
kind: workflow
workflow_id: post-close-update
name: 盘后状态更新流
priority: P0
trigger: 15:30
output_name: 盘后状态更新摘要
---

## Objective

更新持仓状态、执行结果、thesis 状态与观察项，为下一交易日提供干净状态。

## Steps

1. 读取当日执行结果
2. 更新 position 和 thesis
3. 记录新增观察项
4. 刷新组合记忆
