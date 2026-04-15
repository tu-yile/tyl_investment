---
kind: confidence_rules
clear_action_threshold: 0.75
conditional_action_threshold: 0.55
---

## Rules

- 置信度大于等于 0.75 时，允许给明确动作
- 置信度在 0.55 到 0.75 之间时，只允许给条件性动作
- 置信度低于 0.55 时，只允许给观察建议或人工复核
