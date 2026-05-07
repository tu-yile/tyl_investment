# Investment OS V1

这是一个以 SQLite 作为运行态真源、以 Markdown 维护知识和规则的 A 股主动多头中线投研子系统。

## 设计原则

- 配置、agent contract、知识库正文继续使用 Markdown
- SQLite 负责运行态状态、审批闭环与历史审计
- TypeScript 运行时负责读取 SQLite + Markdown、独立调用 agent、生成导出产物
- v1 聚焦独立 agent 投研与人工审批，不自动下单

## 目录说明

- `config/`: 策略、风险、置信度规则
- `agents/`: 各 agent 的 contract
- `knowledge/industries/`: 行业知识库
- `knowledge/companies/`: 公司 thesis 记忆
- `output/`: 每日操作单与中间卡片

## 命令

在仓库根目录执行：

```bash
npm run investment:agent:run -- --agent=information-collector --context-file=tmp/context.md --output=tmp/information-collector.md
npm run investment:agent:run -- --agent=industry-analyst --subject=power-equipment --output=tmp/industry-analyst.md
npm run investment:agent:run -- --agent=company-analyst --subject=300750 --output=tmp/company-analyst.md
npm run investment:schedule:run
npm run investment:validate
npm run investment:rebuild-state
npm run investment:db:init-local
```

## 定时任务

定时任务配置位于 `investment/config/schedules.json`。运行：

```bash
npm run investment:schedule:run
```

配置示例：

```json
{
  "pollIntervalMs": 30000,
  "runMissedOnStart": false,
  "tasks": [
    {
      "id": "daily-information-collection",
      "enabled": true,
      "time": "08:45",
      "agent": "information-collector",
      "task": "收集过去一个交易日和盘前值得关注的市场、行业、公司与政策信息。",
      "output": "{outputRoot}/scheduled/{date}/{taskId}.md"
    }
  ]
}
```

- `time` 使用本机时区的 24 小时制 `HH:mm`。
- `agent` 使用 `investment/agents/*.md` 中的 agent id。
- `subject` 可用于 `industry-analyst` / `company-analyst`。
- `context` 和 `contextFiles` 会作为额外上下文传给 agent。
- `output` 支持 `{outputRoot}`、`{date}`、`{time}`、`{timestamp}`、`{taskId}`、`{agent}` 占位符。
- `runMissedOnStart=false` 时，常驻进程启动前已经错过的当天任务不会补跑。

## 当前 v1 能力

- 校验核心 Markdown schema
- 从 SQLite 加载持仓、候选池、市场上下文、待办项和结构化 thesis / industry 运行态
- 从 Markdown 加载行业知识正文、公司 thesis 正文和规则配置
- 可通过 `investment:agent:run` 单独调用任一业务 agent；其中行业和公司 agent 可直接通过统一的 `--subject` 装配对应知识库 prompt
- 可通过 `investment:schedule:run` 在固定本地时间自动调用指定 agent 执行指定任务
- 8 个业务 agent 通过 Codex app server 独立执行
- 生成《今日持仓操作单》草稿并在审批节点中断
- 通过 `## Analysis` + `## Handoff` 合约解析 agent 输出
- 记录 agent / operation sheet / approval / execution 运行审计到 SQLite

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

- 8 个业务 agent 通过 `codex app-server --listen stdio://` 做 LLM 执行
- agent prompt 以 `investment/agents/*.md` 为主，代码补充运行时上下文与 `## Handoff` 契约

## 数据存储演进

当前 v1 已切到“SQLite 管运行态、Markdown 管知识与规则”的边界：

- Markdown 管知识和规则
- Database 管状态和历史

可参考：

- `db/investment/README.md`
- `db/investment/schema.sql`
- `db/investment/seed.local.sql`
