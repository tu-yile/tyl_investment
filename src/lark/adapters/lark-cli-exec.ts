import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import type { JsonObject, RunLarkCliOptions } from "../types/lark-types.js";

interface SpawnSpec {
  command: string;
  args: string[];
}

/**
 * 统一生成 lark-cli 调用规格。
 * 在 Windows 环境优先走 run.js，规避 PowerShell 转义差异。
 */
export function createSpawnSpec(args: string[], forceCmd = false): SpawnSpec {
  if (process.platform === "win32") {
    const runnerFromEnv = process.env.LARK_CLI_RUNNER || "";
    const defaultRunner = "D:\\OpenClaw\\cli\\node_modules\\@larksuite\\cli\\scripts\\run.js";
    const runner = runnerFromEnv || defaultRunner;
    if (fs.existsSync(runner)) {
      return {
        command: process.execPath,
        args: [path.resolve(runner), ...args],
      };
    }
    if (forceCmd) {
      return { command: "cmd.exe", args: ["/c", "lark-cli", ...args] };
    }
    return { command: "cmd.exe", args: ["/c", "lark-cli", ...args] };
  }
  const localCli = path.resolve(process.cwd(), "node_modules", ".bin", "lark-cli");
  if (fs.existsSync(localCli)) {
    return { command: localCli, args };
  }
  return { command: "lark-cli", args };
}

/**
 * 执行 lark-cli 命令并返回 stdout 文本。
 */
export function runLarkCli(
  args: string[],
  { cwd, forceCmd = false }: RunLarkCliOptions = {},
): Promise<string> {
  const spec = createSpawnSpec(args, forceCmd);
  return new Promise((resolve, reject) => {
    const child = spawn(spec.command, spec.args, {
      cwd,
      env: process.env,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => reject(error));
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout.trim());
        return;
      }
      reject(
        new Error(
          `lark-cli exited with code ${code}\ncommand: lark-cli ${args.join(" ")}\nstdout: ${stdout}\nstderr: ${stderr}`,
        ),
      );
    });
  });
}

export function parseJsonOrNull(text: string): JsonObject | null {
  try {
    return JSON.parse(text);
  } catch (_error) {
    return null;
  }
}
