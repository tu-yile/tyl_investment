import fs from "node:fs";
import path from "node:path";

function now(): string {
  return new Date().toISOString();
}

type LogLevel = "info" | "warn" | "error";

export class Logger {
  logPath: string;

  constructor(logPath: string) {
    this.logPath = logPath;
    fs.mkdirSync(path.dirname(logPath), { recursive: true });
  }

  write(level: LogLevel, message: string, extra: unknown = null): void {
    const payload = {
      ts: now(),
      level,
      message,
      extra,
    };
    const line = JSON.stringify(payload);
    fs.appendFileSync(this.logPath, `${line}\n`);
    if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  info(message: string, extra: unknown = null): void {
    this.write("info", message, extra);
  }

  warn(message: string, extra: unknown = null): void {
    this.write("warn", message, extra);
  }

  error(message: string, extra: unknown = null): void {
    this.write("error", message, extra);
  }
}
