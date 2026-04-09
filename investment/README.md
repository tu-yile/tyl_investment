# Investment OS V1

这是一个以 Markdown 为主驱动的 A 股主动多头中线投研子系统。

## 设计原则

- 配置、流程、agent contract、知识库、thesis、持仓状态都尽量使用 Markdown
- TypeScript 运行时只负责解析 Markdown、执行 workflow、生成输出、写回状态
- v1 聚焦每日持仓决策流，不自动下单，人工保留最终审批权

## 目录说明

- `config/`: 策略、风险、置信度规则
- `workflows/`: 每条工作流定义
- `agents/`: 各 agent 的 contract
- `knowledge/industries/`: 行业知识库
- `knowledge/companies/`: 公司 thesis 记忆
- `portfolio/positions/`: 当前持仓
- `portfolio/candidates/`: 候选池
- `state/`: 市场上下文、组合记忆、待办和审批日志
- `output/`: 每日操作单与中间卡片
- `db/`: 数据库设计文档和建表 SQL

## 命令

在仓库根目录执行：

```bash
npm run investment:validate
npm run investment:daily
npm run investment -- approve-sheet --date=2026-04-09 --decision=approve --reviewer=TuYile
npm run investment:rebuild-state
```

## 当前 v1 能力

- 校验核心 Markdown schema
- 加载持仓、候选池、行业知识库、公司 thesis
- 执行每日持仓决策流
- 生成 `Position Update Card`
- 生成《今日持仓操作单》
- 记录人工审批并写回基础状态

## 数据存储演进

当前 v1 仍以 Markdown 为主，但已经补充了数据库设计，建议长期演进为：

- Markdown 管知识和规则
- Database 管状态和历史

可参考：

- `db/README.md`
- `db/schema.sql`
