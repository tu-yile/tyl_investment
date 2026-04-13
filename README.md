# Investment OS (V1)

This repository now treats `investment` as the primary system.
The Feishu/Codex gateway remains in-repo as a secondary subsystem that can be started by the investment engine when needed.

## System Layout

- Primary system: `investment/` Markdown-driven investment research engine
- Workflow platform: `src/investment/workflows/` registry, runtime dispatch, and workflow implementations
- Agent platform: `src/investment/agents/` registry/runtime + `src/investment/llm/agent-executors.ts` definitions
- Daily workflow state now follows `shared state + workflow private state`
- LangGraph remains the execution engine for the active daily workflow
- Agent execution: `src/investment/llm/` via Codex app server
- Secondary subsystem: `src/gateway/` Feishu ingress and conversational control plane

## Primary Commands

- `npm run start` starts the investment system CLI entrypoint
- `npm run start -- workflow:list`
- `npm run start -- workflow:run --workflow=daily-position-decision --date=2026-04-09`
- `npm run start -- workflow:resume --workflow=daily-position-decision --thread-id=daily-position-decision:2026-04-09`
- `npm run investment:validate`
- `npm run investment:daily`
- `npm run investment:rebuild-state`
- `npm run investment:db:sync-markdown -- --source-root=/path/to/legacy/investment`
- `npm run gateway` starts the Feishu gateway subsystem directly
- `npm run start -- gateway` also starts the Feishu gateway through the primary entrypoint

## Requirements

- Node.js 22+
- Working `lark-cli` installation with successful auth
- Codex credentials (for example `CODEX_API_KEY` or `OPENAI_API_KEY`)

## Quick Start

```bash
npm install
npm run start
```

Run a daily investment workflow:

```bash
npm run start -- workflow:run --workflow=daily-position-decision --date=2026-04-09
```

Start the Feishu subsystem:

```bash
npm run start -- gateway
```

## Optional Environment Variables

- Investment engine:
  - `INVESTMENT_DB_PATH`: override `investment/data/investment.sqlite3`
  - `INVESTMENT_CODEX_MODEL`: override model used by investment agents
  - `INVESTMENT_CODEX_REASONING_EFFORT`: override reasoning effort for investment agents
  - `INVESTMENT_CODEX_APP_SERVER_TIMEOUT_MS`: app server timeout in ms
- `ALLOWED_OPEN_IDS`: comma-separated allowlist; defaults to current logged-in user.
- `WORKSPACE_ROOTS`: comma-separated allowed workspace roots; defaults to repo root.
- `CODEX_MODEL`: Codex model override.
- `CODEX_API_KEY` or `OPENAI_API_KEY`: API key.
- `CODEX_BASE_URL` or `OPENAI_BASE_URL`: API base URL override.
- `CODEX_PATH`: codex binary path override.
- `GATEWAY_DATA_DIR`: data folder for DB/logs (default `.gateway`).
- `AUTO_BIND_WORKSPACE=0`: disable auto-bind of repo root on first natural-language message.
- `DEFAULT_MODE`: default session mode (`build` by default in current config).
- `CODEX_NETWORK_ACCESS`: optional override (`1/true` or `0/false`).
- `CODEX_WEB_SEARCH_MODE`: optional override (`disabled` / `cached` / `live`).
- `CODEX_APPROVAL_POLICY`: optional override (`never` / `on-request` / `on-failure` / `untrusted`).
- `CODEX_SANDBOX_MODE`: optional override (`read-only` / `workspace-write` / `danger-full-access`).
- `CODEX_SKIP_GIT_REPO_CHECK`: optional override (`1/true` or `0/false`).
- `STREAMING_MODE`: `off` (default) / `snapshot` / `patch` / `cardkit`.
- `STREAMING_ENABLED`: legacy switch; `1/true` maps to `snapshot` when `STREAMING_MODE` is unset.
`patch/cardkit` mode now reuses your existing `lark-cli` login and does not require separate OpenAPI env credentials.

## Import Alias

- Internal source imports support the `#src/*` alias.
- Example: `import { runInvestmentCli } from "#src/investment/index.js"`
- Runtime resolution uses `package.json#imports`, so the alias works in both TypeScript compilation and Node.js execution.

## Project Layout

- `src/index.ts` primary entrypoint, now routed to the investment engine
- `src/investment/` investment CLI, workflow platform, agent runtime, storage
- `investment/` Markdown knowledge, state, workflows, outputs, DB assets
- `src/gateway/bootstrap.ts` gateway subsystem composition root
- `src/gateway/` Feishu routing/session/command orchestration
- `src/lark/` Feishu transport and rendering
- `src/codex-app-server/` shared Codex app server abstraction for gateway and investment runtime
- `src/core/` logging and gateway persistence
