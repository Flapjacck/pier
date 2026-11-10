import { isRecord } from "./guards";
import type { AuditDetailValue, AuditEntry, AuditPage } from "./types";

function isDetailValue(value: unknown): value is AuditDetailValue {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return true;
  return Array.isArray(value) && value.every((v) => typeof v === "string");
}

const isNullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** Parse one audit entry. Detail values of an unexpected type are dropped, not fatal. */
export function parseAuditEntry(json: unknown): AuditEntry {
  if (
    !isRecord(json) ||
    typeof json.id !== "number" ||
    typeof json.ts !== "string" ||
    (json.actor !== "token" && json.actor !== "session" && json.actor !== "pier") ||
    typeof json.ip !== "string" ||
    typeof json.action !== "string" ||
    !isNullableString(json.app) ||
    !isNullableString(json.target) ||
    typeof json.status !== "number" ||
    !isRecord(json.details) ||
    Array.isArray(json.details)
  ) {
    throw new SyntaxError("Invalid audit entry");
  }
  const details: Record<string, AuditDetailValue> = {};
  for (const [key, value] of Object.entries(json.details)) if (isDetailValue(value)) details[key] = value;
  return {
    id: json.id,
    ts: json.ts,
    actor: json.actor,
    ip: json.ip,
    action: json.action,
    app: json.app,
    target: json.target,
    status: json.status,
    details,
  };
}

export function parseAuditPage(json: unknown): AuditPage {
  if (
    !isRecord(json) ||
    json.ok !== true ||
    !Array.isArray(json.entries) ||
    (json.nextBefore !== null && typeof json.nextBefore !== "number")
  ) {
    throw new SyntaxError("Invalid audit log response");
  }
  return { entries: json.entries.map(parseAuditEntry), nextBefore: json.nextBefore };
}
