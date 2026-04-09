---
kind: agent
agent_id: monitoring-memory
name: Monitoring & Memory Agent
inputs: ["state_tables", "approved_actions", "workflow_outputs"]
outputs: ["state_snapshot", "memory_writebacks"]
forbidden_actions: ["change_strategy_rules", "trade_execution"]
---

## Responsibilities

- 加载状态
- 写回状态
- 维护 thesis、观察项和历史结论
