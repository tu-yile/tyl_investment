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
  conversationId: string;
  senderId?: string | null;
  text?: string;
}

export interface SessionState {
  conversationId: string;
  threadId: string | null;
  workspace: string | null;
  mode: string;
  activeRunId: string | null;
}

export interface RunRecord {
  runId: string;
  conversationId: string;
  threadId: string | null;
  prompt: string;
  status: string;
  summary: string | null;
  error: string | null;
}

export interface ApprovalRecord {
  approvalId: number;
  conversationId: string;
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
        event.conversationId,
        event.senderId ?? null,
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

  getSession(conversationId: string, defaultMode = "read"): SessionState {
    const row = this.db
      .prepare("SELECT chat_id, thread_id, workspace, mode, active_run_id FROM sessions WHERE chat_id = ?")
      .get(conversationId) as
      | { chat_id: string; thread_id: string | null; workspace: string | null; mode: string; active_run_id: string | null }
      | undefined;
    if (row) {
      return {
        conversationId: row.chat_id,
        threadId: row.thread_id,
        workspace: row.workspace,
        mode: row.mode,
        activeRunId: row.active_run_id,
      };
    }
    this.db
      .prepare("INSERT INTO sessions (chat_id, mode, updated_at) VALUES (?, ?, ?)")
      .run(conversationId, defaultMode, nowIso());
    return {
      conversationId,
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
        session.conversationId,
        session.threadId ?? null,
        session.workspace ?? null,
        session.mode ?? "read",
        session.activeRunId ?? null,
        nowIso(),
      );
  }

  setSessionWorkspace(conversationId: string, workspace: string): SessionState {
    const session = this.getSession(conversationId);
    session.workspace = workspace;
    session.threadId = null;
    session.activeRunId = null;
    this.upsertSession(session);
    return session;
  }

  clearSessionWorkspace(conversationId: string, defaultMode = "read"): SessionState {
    const session = this.getSession(conversationId, defaultMode);
    session.workspace = null;
    session.threadId = null;
    session.activeRunId = null;
    session.mode = defaultMode;
    this.upsertSession(session);
    return session;
  }

  setSessionThread(conversationId: string, threadId: string | null): SessionState {
    const session = this.getSession(conversationId);
    session.threadId = threadId;
    this.upsertSession(session);
    return session;
  }

  setSessionMode(conversationId: string, mode: string): SessionState {
    const session = this.getSession(conversationId);
    session.mode = mode;
    this.upsertSession(session);
    return session;
  }

  setActiveRun(conversationId: string, runId: string | null): SessionState {
    const session = this.getSession(conversationId);
    session.activeRunId = runId;
    this.upsertSession(session);
    return session;
  }

  clearActiveRun(conversationId: string): SessionState {
    return this.setActiveRun(conversationId, null);
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

  createRun({
    conversationId,
    threadId,
    prompt,
  }: {
    conversationId: string;
    threadId: string | null;
    prompt: string;
  }): string {
    const runId = randomUUID();
    this.db
      .prepare(`
        INSERT INTO runs (run_id, chat_id, thread_id, prompt, status, started_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `)
      .run(runId, conversationId, threadId ?? null, prompt, "running", nowIso());
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
      conversationId: row.chat_id,
      threadId: row.thread_id,
      prompt: row.prompt,
      status: row.status,
      summary: row.summary,
      error: row.error,
    };
  }

  createApproval(conversationId: string, kind: string, payload: unknown): number {
    const result = this.db
      .prepare(`
        INSERT INTO approvals (chat_id, kind, payload_json, status, created_at)
        VALUES (?, ?, ?, 'pending', ?)
      `)
      .run(conversationId, kind, JSON.stringify(payload), nowIso());
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
      conversationId: row.chat_id,
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

  countPendingApprovals(conversationId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM approvals WHERE chat_id = ? AND status = 'pending'")
      .get(conversationId) as { count: number } | undefined;
    return Number(row?.count ?? 0);
  }
}
