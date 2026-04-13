# Investment OS V1

这是一个以 SQLite 作为运行态真源、以 Markdown 维护知识和规则的 A 股主动多头中线投研子系统。

## 设计原则

- 配置、流程、agent contract、知识库正文继续使用 Markdown
- SQLite 负责运行态状态、审批闭环与历史审计
- TypeScript 运行时负责读取 SQLite + Markdown、执行 workflow、生成导出产物
- v1 聚焦每日持仓决策流，不自动下单，人工保留最终审批权

## 目录说明

- `config/`: 策略、风险、置信度规则
- `workflows/`: 每条工作流定义
- `agents/`: 各 agent 的 contract
- `knowledge/industries/`: 行业知识库
- `knowledge/companies/`: 公司 thesis 记忆
- `state/`: 仅保留说明性文件；运行态状态已切到 SQLite
- `output/`: 每日操作单与中间卡片
- `db/`: 数据库设计文档和建表 SQL

## 命令

在仓库根目录执行：

```bash
npm run start -- workflow:list
npm run start -- workflow:run --workflow=daily-position-decision --date=2026-04-09
npm run start -- workflow:resume --workflow=daily-position-decision --thread-id=daily-position-decision:2026-04-09 --decision=approve --reviewer=TuYile
npm run investment:validate
npm run investment:daily
npm run investment -- approve-sheet --date=2026-04-09 --decision=approve --reviewer=TuYile
npm run investment:rebuild-state
npm run investment:db:init-local
npm run investment:db:sync-markdown -- --source-root=/path/to/legacy/investment
```

## 当前 v1 能力

- 校验核心 Markdown schema
- 校验 workflow registry 与 `investment/workflows/*.md` 元数据一致性
- 从 SQLite 加载持仓、候选池、市场上下文、待办项和结构化 thesis / industry 运行态
- 从 Markdown 加载行业知识正文、公司 thesis 正文和规则配置
- 通过 workflow registry 启动和恢复 workflow
- 通过 LangGraph 执行每日持仓决策流
- 8 个业务 agent 节点通过 Codex app server 执行
- 生成 `Position Update Card`
- 生成《今日持仓操作单》草稿并在审批节点中断
- 通过 `approve-sheet` 恢复 graph 并完成状态写回
- 通过 `## Analysis` + `## Handoff` 合约解析 agent 输出
- 记录 workflow / agent / operation sheet / approval / execution 全链路运行审计到 SQLite

## 当前 Workflow 体系

当前 `src/investment/workflows/` 已成为 workflow 平台层，负责：

- workflow definition / registry / runtime dispatch
- workflow Markdown 元数据校验
- workflow 级运行审计
- daily workflow 的实现挂载

当前 `src/investment/agents/` 与 `src/investment/llm/agent-executors.ts` 共同承担 agent 平台职责：

- 8 个业务 agent 以 `AgentDefinition` 形式注册
- workflow 节点通过统一的 `runRegisteredAgent(...)` 调用业务 agent
- agent 执行前后会记录 `agent_runs`
- handoff 解析、prompt contract 和本地 schema 守门仍复用现有 LLM 基础设施

当前注册的 workflow：

- `daily-position-decision`：`active`
- `emergency-reassessment`：`planned`
- `post-close-update`：`planned`

## 当前 Agent 体系

当前 `investment/agents/` 已收敛为 8 个业务 agent：

- `information-collector`
- `macro-policy-analyst`
- `industry-analyst`
- `company-analyst`
- `bear-case-analyst`
- `portfolio-manager`
- `risk-officer`
- `chief-investment-officer`

说明：
状态加载、状态写回、审批恢复和最终收尾不再作为 agent 定义，后续应以系统节点承接。

## 当前 daily-run 执行方式

当前 `daily-run` 作为 `daily-position-decision` 的兼容别名存在；
真实执行入口已统一走 `workflow:run --workflow=daily-position-decision`。

其运行态 state 已拆成两层：

- `shared state`：SQLite 持仓、SQLite 候选池、规则、市场上下文、collection scope 等共享输入
- `private state`：daily workflow 的中间分析结果、审批数据、输出产物与运行状态

其 LangGraph 主链路为：

- `start`
- `information-collector`
- `macro-policy-analyst`
- `industry-analyst`
- `company-analyst`
- `bear-case-analyst`
- `portfolio-manager`
- `risk-officer`
- `chief-investment-officer`
- `human_approval`
- `state_writeback`
- `end`

说明：

- `daily-run` 首次执行会生成草稿并停在 `human_approval`
- `approve-sheet` 是 `workflow:resume --workflow=daily-position-decision` 的兼容别名
- 8 个业务节点不再走本地启发式主逻辑，而是通过 `codex app-server --listen stdio://` 做 LLM 执行
- agent prompt 以 `investment/agents/*.md` 为主，代码补充运行时上下文与 `## Handoff` 契约
- 如果 SQLite 与旧 Markdown 状态数据分叉，统一以 SQLite 为准

## 数据存储演进

当前 v1 已切到“SQLite 管运行态、Markdown 管知识与规则”的边界：

- Markdown 管知识和规则
- Database 管状态和历史

可参考：

- `db/README.md`
- `db/schema.sql`
- `db/seed.local.sql`
