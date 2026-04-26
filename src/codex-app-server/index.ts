import { runtimePathsConfig } from "#src/config/runtime-paths-config.js";
import { Logger } from "#src/core/logging/logger.js";
import JsonRpcStdioCodexClient from "./client.js";
import type { CodexAppServerDefaults, CodexAppServerLogger, CodexResolvedRunInput, CodexRunInput, CodexRunResult, CodexTaskRunner } from "./types.js";
import { buildRunInputLogPayload, resolveExecutable } from "./utils.js";
import path from "node:path";

const logger = new Logger(runtimePathsConfig.logPath);
let persistentClient: JsonRpcStdioCodexClient | null = null;
let persistentExecutable = "";
let runQueue: Promise<void> = Promise.resolve();

function normalizeRunInput(input: CodexRunInput, defaults?: CodexAppServerDefaults): CodexResolvedRunInput {
  const workspace = path.resolve(input.workspace);
  return {
    threadId: input.threadId ?? null,
    mode: input.mode,
    workspace,
    prompt: input.prompt,
    signal: input.signal,
    model: input.model ?? defaults?.model,
    approvalPolicy: input.approvalPolicy ?? defaults?.approvalPolicy ?? "never",
    sandboxMode: input.sandboxMode ?? defaults?.sandboxMode ?? "read-only",
    networkAccessEnabled: input.networkAccessEnabled ?? defaults?.networkAccessEnabled ?? true,
    webSearchMode: input.webSearchMode ?? defaults?.webSearchMode ?? "live",
    skipGitRepoCheck: input.skipGitRepoCheck ?? defaults?.skipGitRepoCheck ?? false,
    personality: input.personality ?? defaults?.personality ?? "pragmatic",
    summary: input.summary ?? defaults?.summary ?? "none",
    timeoutMs: input.timeoutMs ?? defaults?.timeoutMs ?? 180000,
    ephemeral: input.ephemeral,
    baseInstructions: input.baseInstructions,
    developerInstructions: input.developerInstructions,
    onProgress: input.onProgress,
  };
}

async function getPersistentClient(executable: string): Promise<JsonRpcStdioCodexClient> {
  if (persistentClient && (persistentClient.isClosed() || persistentExecutable !== executable)) {
    await persistentClient.close().catch(() => undefined);
    persistentClient = null;
    persistentExecutable = "";
  }

  if (!persistentClient) {
    persistentClient = new JsonRpcStdioCodexClient(executable, runtimePathsConfig.cwd);
    persistentExecutable = executable;
  }

  return persistentClient;
}

function enqueueRun<T>(task: () => Promise<T>): Promise<T> {
  const result = runQueue.then(task);
  runQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function runCodexInternal(
  input: CodexRunInput,
  options: {
    defaults?: CodexAppServerDefaults;
    logger?: CodexAppServerLogger;
  } = {},
): Promise<CodexRunResult> {
  const normalizedInput = normalizeRunInput(input, options.defaults);
  options.logger?.info?.("codex_app_server.run_input", buildRunInputLogPayload(normalizedInput));
  const executable = resolveExecutable(options.defaults);

  return enqueueRun(async () => {
    const client = await getPersistentClient(executable);
    try {
      return await client.run(normalizedInput, options.logger);
    } catch (error) {
      if (client.isClosed() && persistentClient === client) {
        persistentClient = null;
        persistentExecutable = "";
      }
      throw error;
    }
  });
}

export function runCodexTask(
  input: CodexRunInput,
  options: {
    defaults?: CodexAppServerDefaults;
    logger?: CodexAppServerLogger;
  } = {},
): Promise<CodexRunResult> {
  return runCodexInternal(input, options);
}

export function runCodexTaskStream(
  input: CodexRunInput,
  options: {
    defaults?: CodexAppServerDefaults;
    logger?: CodexAppServerLogger;
  } = {},
): Promise<CodexRunResult> {
  return runCodexInternal(input, options);
}

const globalCodexTaskRunner: CodexTaskRunner = {
  runTask(input) {
    return runCodexTask(input, { logger });
  },
  runTaskStream(input) {
    return runCodexTaskStream(input, { logger });
  },
};

export function getGlobalCodexTaskRunner(): CodexTaskRunner {
  return globalCodexTaskRunner;
}
