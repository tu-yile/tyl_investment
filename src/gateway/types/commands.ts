export type StreamingMode = string;

export interface ParsedCommand {
  name: string;
  argsText: string;
  args: string[];
}

export function parseCommand(text: string): ParsedCommand | null {
  const trimmed = (text || "").trim();
  if (!trimmed.startsWith("/")) {
    return null;
  }
  const firstSpace = trimmed.indexOf(" ");
  if (firstSpace === -1) {
    return {
      name: trimmed.slice(1).toLowerCase(),
      argsText: "",
      args: [],
    };
  }
  const name = trimmed.slice(1, firstSpace).toLowerCase();
  const argsText = trimmed.slice(firstSpace + 1).trim();
  const args = argsText ? argsText.split(/\s+/g) : [];
  return { name, argsText, args };
}

export function helpText(): string {
  return [
    "可用命令：",
    "/bind <path> 绑定工作目录",
    "/unbind 解绑工作目录并重置会话",
    "/status 查看会话状态",
    "/mode read|build 切换执行模式",
    "/stream [mode] 查看或切换流式模式",
    "/approve <id> 批准审批请求",
    "/deny <id> 拒绝审批请求",
    "/stop 停止当前任务",
    "/reset 重置当前 thread 上下文",
    "/help 查看帮助",
  ].join("\n");
}
