import type { DatabaseSync, SQLOutputValue } from "node:sqlite";

/** Extra facts about an action. Never env values, tokens or cookies. */
export type AuditDetails = Record<string, string | number | boolean | string[]>;

export type AuditActor = "token" | "session" | "pier";

export type AuditInput = {
  /** Milliseconds since the epoch. */
  ts: number;
  /**
   * How the caller authenticated: "token" (Bearer) or "session" (cookie). "pier" marks
   * rows Pier writes itself, such as a deploy finishing in the background (#83).
   */
  actor: AuditActor;
  ip: string;
  /** e.g. "app.create", "app.scale", "volume.delete", "session.login". */
  action: string;
  app: string | null;
  /** The object acted on when it isn't the app itself (a pod or volume name). */
  target: string | null;
  status: number;
  details: AuditDetails;
};

export type AuditEntry = AuditInput & { id: number };

export type AuditPage = {
  entries: AuditEntry[];
  /** Pass as `before` to get the next (older) page; null when there are no more rows. */
  nextBefore: number | null;
};

export type ListAuditOptions = { limit: number; before?: number; app?: string };

export function insertAudit(db: DatabaseSync, entry: AuditInput): number {
  const result = db
    .prepare(
      `INSERT INTO audit_log (ts, actor, ip, action, app, target, status, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(entry.ts, entry.actor, entry.ip, entry.action, entry.app, entry.target, entry.status, JSON.stringify(entry.details));
  return Number(result.lastInsertRowid);
}

function parseDetails(raw: SQLOutputValue): AuditDetails {
  if (typeof raw !== "string") return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? (parsed as AuditDetails) : {};
  } catch {
    return {};
  }
}

function text(value: SQLOutputValue): string | null {
  return typeof value === "string" ? value : null;
}

function toEntry(row: Record<string, SQLOutputValue>): AuditEntry {
  return {
    id: Number(row.id),
    ts: Number(row.ts),
    actor: row.actor === "session" || row.actor === "pier" ? row.actor : "token",
    ip: text(row.ip) ?? "",
    action: text(row.action) ?? "",
    app: text(row.app),
    target: text(row.target),
    status: Number(row.status),
    details: parseDetails(row.details),
  };
}

/** Newest first. Pages by id so rows written meanwhile don't shift the next page. */
export function listAudit(db: DatabaseSync, options: ListAuditOptions): AuditPage {
  const where: string[] = [];
  const params: (string | number)[] = [];
  if (options.before !== undefined) {
    where.push("id < ?");
    params.push(options.before);
  }
  if (options.app !== undefined) {
    where.push("app = ?");
    params.push(options.app);
  }
  const sql = `SELECT id, ts, actor, ip, action, app, target, status, details FROM audit_log
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY id DESC LIMIT ?`;
  const rows = db.prepare(sql).all(...params, options.limit + 1);
  const entries = rows.slice(0, options.limit).map(toEntry);
  const more = rows.length > options.limit;
  return { entries, nextBefore: more ? (entries.at(-1)?.id ?? null) : null };
}

/** Delete rows older than `cutoffTs`. Returns how many were removed. */
export function pruneAudit(db: DatabaseSync, cutoffTs: number): number {
  return Number(db.prepare("DELETE FROM audit_log WHERE ts < ?").run(cutoffTs).changes);
}
