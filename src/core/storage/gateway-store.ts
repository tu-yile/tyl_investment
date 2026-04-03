import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";

function nowIso(): string {
  return new Date().toISOString();
}

export interface GatewayEvent {
  eventId: string;
  messageId?: string | null;
  chatId: string;
  senderOpenId?: string | null;
  text?: string;
}

export interface SessionState {
  chatId: string;
  threadId: string | null;
  workspace: string | null;
  mode: string;
  activeRunId: string | null;
}

export interface RunRecord {
  runId: string;
  chatId: string;
  threadId: string | null;
  prompt: string;
  status: string;
  summary: string | null;
  error: string | null;
}

export interface ApprovalRecord {
  approvalId: number;
  chatId: string;
  kind: string;
  payload: unknown;
  status: string;
}

export class GatewayStore {
  db: DatabaseSync;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new DatabaseSync(dbPath);
    this.db.exec("PRAGMA journal_mode = WAL;");
    this.db.exec("PRAGMA synchronous = NORMAL;");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS events (
        event_id TEXT PRIMARY KEY,
        message_id TEXT,
        chat_id TEXT NOT NULL,
        sender_open_id TEXT,
        text TEXT,
        received_at TEXT NOT NULL,
        handled_at TEXT
      );

      CREATE TABLE IF NOT EXISTS sessions (
        chat_id TEXT PRIMARY KEY,
        thread_id TEXT,
        workspace TEXT,
        mode TEXT NOT NULL DEFAULT 'read',
        active_run_id TEXT,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL,
        thread_id TEXT,
        prompt TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        error TEXT,
        started_at TEXT NOT NULL,
        finished_at TEXT
      );

      CREATE TABLE IF NOT EXISTS approvals (
        approval_id INTEGER PRIMARY KEY AUTOINCREMENT,
        chat_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at TEXT NOT NULL,
        resolved_at TEXT
      );
    `);
  }

  close(): void {
    this.db.close();
  }

  insertEventIfNew(event: GatewayEvent): boolean {
    const stmt = this.db.prepare(`
      INSERT INTO events (event_id, message_id, chat_id, sender_open_id, text, received_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    try {
      stmt.run(
        event.eventId,
        event.messageId ?? null,
        event.chatId,
        event.senderOpenId ?? null,
        event.text ?? "",
        nowIso(),
      );
      return true;
    } catch (error: any) {
      if (String(error.message || "").includes("UNIQUE")) {
        return false;
      }
      throw error;
    }
  }

  markEventHandled(eventId: string): void {
    this.db
      .prepare("UPDATE events SET handled_at = ? WHERE event_id = ?")
      .run(nowIso(), eventId);
  }

  getSession(chatId: string, defaultMode = "read"): SessionState {
    const row = this.db
      .prepare("SELECT chat_id, thread_id, workspace, mode, active_run_id FROM sessions WHERE chat_id = ?")
      .get(chatId) as
      | { chat_id: string; thread_id: string | null; workspace: string | null; mode: string; active_run_id: string | null }
      | undefined;
    if (row) {
      return {
        chatId: row.chat_id,
        threadId: row.thread_id,
        workspace: row.workspace,
        mode: row.mode,
        activeRunId: row.active_run_id,
      };
    }
    this.db
      .prepare("INSERT INTO sessions (chat_id, mode, updated_at) VALUES (?, ?, ?)")
      .run(chatId, defaultMode, nowIso());
    return {
      chatId,
      threadId: null,
      workspace: null,
      mode: defaultMode,
      activeRunId: null,
    };
  }

  upsertSession(session: SessionState): void {
    this.db
      .prepare(`
        INSERT INTO sessions (chat_id, thread_id, workspace, mode, active_run_id, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(chat_id) DO UPDATE SET
          thread_id = excluded.thread_id,
          workspace = excluded.workspace,
          mode = excluded.mode,
          active_run_id = excluded.active_run_id,
          updated_at = excluded.updated_at
      `)
      .run(
        session.chatId,
        session.threadId ?? null,
        session.workspace ?? null,
        session.mode ?? "read",
        session.activeRunId ?? null,
        nowIso(),
      );
  }

  setSessionWorkspace(chatId: string, workspace: string): SessionState {
    const session = this.getSession(chatId);
    session.workspace = workspace;
    session.threadId = null;
    session.activeRunId = null;
    this.upsertSession(session);
    return session;
  }

  clearSessionWorkspace(chatId: string, defaultMode = "read"): SessionState {
    const session = this.getSession(chatId, defaultMode);
    session.workspace = null;
    session.threadId = null;
    session.activeRunId = null;
    session.mode = defaultMode;
    this.upsertSession(session);
    return session;
  }

  setSessionThread(chatId: string, threadId: string | null): SessionState {
    const session = this.getSession(chatId);
    session.threadId = threadId;
    this.upsertSession(session);
    return session;
  }

  setSessionMode(chatId: string, mode: string): SessionState {
    const session = this.getSession(chatId);
    session.mode = mode;
    this.upsertSession(session);
    return session;
  }

  setActiveRun(chatId: string, runId: string | null): SessionState {
    const session = this.getSession(chatId);
    session.activeRunId = runId;
    this.upsertSession(session);
    return session;
  }

  clearActiveRun(chatId: string): SessionState {
    return this.setActiveRun(chatId, null);
  }

  recoverDanglingRuns(reason = "Recovered on gateway startup"): string[] {
    const now = nowIso();
    const dangling = this.db
      .prepare("SELECT run_id FROM runs WHERE status = 'running'")
      .all() as Array<{ run_id: string }>;
    if (dangling.length > 0) {
      this.db
        .prepare("UPDATE runs SET status = ?, error = ?, finished_at = ? WHERE status = 'running'")
        .run("failed", reason, now);
    }
    this.db
      .prepare("UPDATE sessions SET active_run_id = NULL, updated_at = ? WHERE active_run_id IS NOT NULL")
      .run(now);
    return dangling.map((row) => row.run_id);
  }

  upgradeAllSessionsMode(mode: string): void {
    this.db.prepare("UPDATE sessions SET mode = ?, updated_at = ?").run(mode, nowIso());
  }

  createRun({ chatId, threadId, prompt }: { chatId: string; threadId: string | null; prompt: string }): string {
    const runId = randomUUID();
    this.db
      .prepare(`
        INSERT INTO runs (run_id, chat_id, thread_id, prompt, status, started_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(runId, chatId, threadId ?? null, prompt, "running", nowIso());
    return runId;
  }

  finishRun({
    runId,
    status,
    summary,
    error,
  }: {
    runId: string;
    status: string;
    summary?: string;
    error?: string;
  }): void {
    this.db
      .prepare(`
        UPDATE runs
        SET status = ?, summary = ?, error = ?, finished_at = ?
        WHERE run_id = ?
      `)
      .run(status, summary ?? null, error ?? null, nowIso(), runId);
  }

  getRun(runId: string): RunRecord | null {
    const row = this.db
      .prepare("SELECT run_id, chat_id, thread_id, prompt, status, summary, error FROM runs WHERE run_id = ?")
      .get(runId) as
      | { run_id: string; chat_id: string; thread_id: string | null; prompt: string; status: string; summary: string | null; error: string | null }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      runId: row.run_id,
      chatId: row.chat_id,
      threadId: row.thread_id,
      prompt: row.prompt,
      status: row.status,
      summary: row.summary,
      error: row.error,
    };
  }

  createApproval(chatId: string, kind: string, payload: unknown): number {
    const result = this.db
      .prepare(`
        INSERT INTO approvals (chat_id, kind, payload_json, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `)
      .run(chatId, kind, JSON.stringify(payload), nowIso());
    return Number(result.lastInsertRowid);
  }

  getApproval(approvalId: number): ApprovalRecord | null {
    const row = this.db
      .prepare("SELECT approval_id, chat_id, kind, payload_json, status FROM approvals WHERE approval_id = ?")
      .get(approvalId) as
      | { approval_id: number; chat_id: string; kind: string; payload_json: string; status: string }
      | undefined;
    if (!row) {
      return null;
    }
    return {
      approvalId: row.approval_id,
      chatId: row.chat_id,
      kind: row.kind,
      payload: JSON.parse(row.payload_json),
      status: row.status,
    };
  }

  resolveApproval(approvalId: number, status: string): void {
    this.db
      .prepare("UPDATE approvals SET status = ?, resolved_at = ? WHERE approval_id = ?")
      .run(status, nowIso(), approvalId);
  }

  countPendingApprovals(chatId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM approvals WHERE chat_id = ? AND status = 'pending'")
      .get(chatId) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }
}
