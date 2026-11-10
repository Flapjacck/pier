import type { DatabaseSync } from "node:sqlite";
import { getAppSource, listAppSources, type AppSource } from "../../db/app-sources.js";
import { listDeployments } from "../../db/deployments-read.js";
import type { App } from "../../k8s/apps.js";
import { DEFAULT_RESOURCES, mergeResources } from "../../k8s/resources.js";
import type { AppSourceSummary } from "../apps-source-schemas.js";

/**
 * Apps built from git (#83). A build-from-repo app has a page from the moment it is
 * created, before (or without) a Deployment: its first build may still be running or
 * may have failed. These helpers turn an app_sources row into that page's App.
 */

export type SourcedApp = App & { source?: AppSourceSummary; deploymentId?: number };

export function sourceSummary(row: AppSource): AppSourceSummary {
  return {
    method: row.method,
    repo: row.repo,
    branch: row.branch,
    folder: row.folder,
    dockerfile: row.dockerfile,
    ...(row.gitCredential ? { gitCredential: row.gitCredential } : {}),
    lastCommit: row.lastCommit,
    lastImage: row.lastImage,
    volumeHints: row.volumeHints,
  };
}

/**
 * An app that only exists as a source: "building" while its deploy runs, else "failed".
 * Built from the pending settings, never their env values (those can be secrets).
 */
export function sourceOnlyApp(db: DatabaseSync, row: AppSource): SourcedApp {
  const latest = listDeployments(db, { app: row.app, limit: 1 }).items[0];
  const pending = row.pendingCreate;
  return {
    name: row.app,
    image: row.lastImage ?? "",
    replicas: pending?.replicas ?? 1,
    ready: 0,
    status: latest?.status === "running" ? "building" : "failed",
    createdAt: new Date(latest?.startedAt ?? row.updatedAt).toISOString(),
    ...(pending?.port !== undefined ? { port: pending.port } : {}),
    ...(pending?.host ? { host: pending.host } : {}),
    resources: mergeResources(DEFAULT_RESOURCES, pending?.resources),
    ...(pending?.volumes?.length ? { volumes: pending.volumes.map((v) => ({ name: v.name, mountPath: v.mountPath })) } : {}),
    source: sourceSummary(row),
    ...(latest ? { deploymentId: latest.id } : {}),
  };
}

/** Add the source to a live app when it was built from git. */
export function withSource(db: DatabaseSync | undefined, app: App): SourcedApp {
  const row = db ? getAppSource(db, app.name) : undefined;
  return row ? { ...app, source: sourceSummary(row) } : app;
}

/** Live apps with their sources, plus source-only apps (building or failed first build). */
export function mergeSourceApps(db: DatabaseSync | undefined, live: App[]): SourcedApp[] {
  if (!db) return live;
  const sources = new Map(listAppSources(db).map((row) => [row.app, row]));
  const merged: SourcedApp[] = live.map((app) => {
    const row = sources.get(app.name);
    sources.delete(app.name);
    return row ? { ...app, source: sourceSummary(row) } : app;
  });
  for (const row of sources.values()) merged.push(sourceOnlyApp(db, row));
  return merged.sort((a, b) => a.name.localeCompare(b.name));
}
