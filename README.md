# Feishu Codex Gateway (V1)

This repository contains a production-oriented V1 gateway built with `lark-cli + Codex SDK`.
It allows controlling Codex from Feishu direct messages.

## Features

- Event ingress from Feishu via `lark-cli event +subscribe`
- Bot replies via `lark-cli im +messages-send --as bot`
- Logical sessions per `chat_id` with persisted `thread_id`, `workspace`, and `mode`
- Command plane plus natural-language task plane
- SQLite persistence using Node's built-in `node:sqlite`
- Multi-mode streaming:
  - `off`: non-streaming (single final reply)
  - `snapshot`: throttled full-snapshot text messages (legacy mode)
  - `patch`: update one interactive card message continuously
  - `cardkit`: CardKit streaming update mode (OpenClaw-style)

## Supported Commands

- `/bind <path>`
- `/unbind`
- `/status`
- `/mode read|build`
- `/stream [off|snapshot|patch|cardkit]`
- `/approve <id>`
- `/deny <id>`
- `/stop`
- `/reset`
- `/help`

Messages that do not start with `/` are treated as Codex task input.

## Requirements

- Node.js 22+
- Working `lark-cli` installation with successful auth
- Codex credentials (for example `CODEX_API_KEY` or `OPENAI_API_KEY`)

## Quick Start

```bash
npm install
npm run start
```

## Optional Environment Variables

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

## Project Layout

- `src/index.ts` startup
- `src/gateway.ts` routing/session/command orchestration
- `src/codex-runtime.ts` Codex SDK runtime integration
- `src/lark-client.ts` Feishu CLI integration
- `src/store.ts` SQLite persistence layer
- `src/commands.ts` command parser
- `src/config.ts` config loader
- `src/logger.ts` structured logger
