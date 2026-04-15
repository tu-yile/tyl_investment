# Investment DB Design V1

这份设计的目标不是把所有内容都搬进数据库，而是明确：

- 哪些数据继续用 Markdown 维护
- 哪些数据必须进入数据库做运行态和历史态持久化
- 第一阶段应该先落哪些表

## 设计边界

推荐采用：

- Markdown 管知识和规则
- Database 管状态和历史

### 继续留在 Markdown 的内容

- `config/*.md`
- `agents/*.md`
- `knowledge/industries/*.md` 的正文知识层
- `knowledge/companies/*/thesis.md` 的长文本正文

这些内容的特点是：

- 低频修改
- 人类可读性优先
- 更像制度、知识和模板，而不是运行态记录

### 优先进入数据库的内容

- 当前持仓
- 持仓历史快照
- 候选池状态
- thesis 的结构化字段
- 每日 `Position Update Card`
- 每日 `Operation Sheet`
- 风险闸门结果
- 人工审批记录
- 实际执行结果
- 市场上下文快照
- workflow run 和 agent run
- 观察事项和待办项

这些内容的特点是：

- 高频更新
- 需要查询、聚合、排序
- 需要时间序列和审计能力

## 为什么不建议“全数据库”

如果把行业知识库、agent contract、workflow 规则也全部放入数据库，短期看统一，长期会有两个明显问题：

1. 内容编辑体验明显变差
2. 知识资产的版本演化会越来越依赖后台工具

所以更好的边界是：

- 数据库负责“系统跑出来的状态”
- Markdown 负责“系统依赖的知识与规则”

## 第一阶段推荐落地的表

### 核心主数据

- `instruments`
- `industries`
- `portfolios`

### 组合与候选池

- `positions`
- `position_daily_snapshots`
- `candidate_pool_entries`

### thesis 与知识索引

- `theses`
- `thesis_versions`
- `industry_knowledge_versions`

注意：
`thesis_versions` 和 `industry_knowledge_versions` 不是为了把正文知识彻底数据库化，而是为了给 Markdown 资产建立结构化索引和版本元数据。

### 每日 workflow 运行态

- `market_context_snapshots`
- `workflow_runs`
- `agent_runs`
- `position_update_cards`
- `candidate_assessments`
- `risk_gate_results`
- `operation_sheets`
- `operation_sheet_items`

### 治理与闭环

- `approvals`
- `execution_results`
- `observation_items`
- `portfolio_snapshots`

## 建议的主键策略

- 业务稳定标识优先用文本主键
  例如：`ticker`、`industry_id`、`thesis_id`、`workflow_run_id`
- 明细表和审计表用自增主键
  例如：`position_update_card_id`、`approval_id`

## 建议的数据库选型

v1 推荐继续使用 SQLite，原因：

- 你当前仓库已经在用 `node:sqlite`
- 单机运行和本地开发足够轻
- 很适合这类“先把状态和审计跑起来”的系统

等到后面出现以下情况，再考虑 PostgreSQL：

- 多用户并发编辑
- 多进程 / 多服务共享数据库
- 事件和快照体量显著增大
- 需要更复杂的分析型查询

## 分阶段迁移建议

### Phase 1

- Position 从 Markdown 迁移到 DB
- Candidate Pool 从 Markdown 迁移到 DB
- Thesis 的结构化字段进入 DB
- Daily run 输出与审批结果进入 DB

### Phase 2

- Market context、risk snapshot、portfolio snapshot 进入 DB
- Observation item 进入 DB
- Workflow run / agent run 全链路落库

### Phase 3

- Thesis 与行业知识库建立版本索引
- Markdown 和 DB 之间建立稳定同步机制

## 当前最推荐的实施顺序

1. 先建表
2. 先把 `positions`、`candidate_pool_entries`、`theses`、`operation_sheets` 跑起来
3. 再改 `src/investment` 读取 DB 而不是读取对应 Markdown
4. 保留 Markdown 作为知识资产，不和运行态数据混用

## 本地 SQLite 初始化

当前仓库已经补了本地初始化脚本和示例种子数据：

- `schema.sql`
- `seed.local.sql`
- `init-local-db.sh`

在仓库根目录执行：

```bash
zsh db/investment/init-local-db.sh
```

默认会生成：

`investment/data/investment.sqlite3`

## 当前裁决规则

- 运行态唯一真源是 SQLite
- 如果 SQLite 与旧 Markdown 状态数据分叉，统一以 SQLite 为准
- `db:sync-markdown` 只会补齐缺失记录，不会用旧 Markdown 覆盖现有 SQLite
