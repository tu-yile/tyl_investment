# Lark + Codex Base

这个仓库现在只保留两层基础能力：

- `src/lark/`: 基于 `lark-cli` 的飞书访问封装
- `src/codex-app-server/`: 基于 `codex app-server --listen stdio://` 的执行封装

## 当前结构

- `src/index.ts`: 顶层导出入口
- `src/lark/index.ts`: Lark 基础能力导出
- `src/codex-app-server/index.ts`: Codex app server 基础能力导出
- `src/config/`: 仅保留基础配置
- `src/core/logging/logger.ts`: 简单日志实现

## 安装

```bash
npm install
```

要求：

- Node.js 22+
- 本机可用的 `lark-cli`
- 本机可用的 `codex` CLI

## 构建

```bash
npm run build
```

## 使用示例

```ts
import { LarkClient, Logger, runCodexTask } from "tyl_investment";
```

## 环境变量

- `CODEX_PATH`: `codex` 可执行文件路径，默认直接使用 `codex`
- `CODEX_MODEL`: 默认模型
- `RUNTIME_DATA_DIR`: 运行时目录，默认 `.runtime`
- `GATEWAY_DATA_DIR`: 兼容旧环境变量，效果等同于 `RUNTIME_DATA_DIR`
