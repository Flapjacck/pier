import type { AppDetail, AppRow } from "../types/app";

/** Rows shown in the apps list table */
export const MOCK_APPS: AppRow[] = [
  { name: "web-frontend", status: "running",  ago: "2m ago",  ref: "main@4f2a91c" },
  { name: "api",          status: "building", ago: "now",     ref: "main@b71e0d3" },
  { name: "worker",       status: "failed",   ago: "14m ago", ref: "feat/queue@9ac3e10" },
  { name: "postgres",     status: "stopped",  ago: "3d ago",  ref: "16.4" },
  { name: "grafana",      status: "building", ago: "pending", ref: "11.2.0" },
];

/** Full detail data keyed by app name, shown on the app detail page */
export const MOCK_APP_DETAILS: Record<string, AppDetail> = {
  "web-frontend": {
    name: "web-frontend", status: "running", ago: "2m ago", ref: "main@4f2a91c",
    image: "nginx:1.25.3",
    namespace: "pier",
    replicas: { ready: 2, total: 2 },
    domain: "web.acme.dev",
    cpuUsage: "0.08", cpuLimit: "0.50",
    memUsage: "64 Mi", memLimit: "256 Mi",
    port: 80,
  },
  "api": {
    name: "api", status: "building", ago: "now", ref: "main@b71e0d3",
    image: "ghcr.io/acme/api:main-b71e0d3",
    namespace: "pier",
    replicas: { ready: 0, total: 1 },
    cpuUsage: "—", cpuLimit: "0.50",
    memUsage: "—", memLimit: "512 Mi",
    port: 3000,
  },
  "worker": {
    name: "worker", status: "failed", ago: "14m ago", ref: "feat/queue@9ac3e10",
    image: "ghcr.io/acme/worker:feat-queue",
    namespace: "pier",
    replicas: { ready: 0, total: 2 },
    cpuUsage: "0.00", cpuLimit: "0.25",
    memUsage: "0 Mi", memLimit: "128 Mi",
  },
  "postgres": {
    name: "postgres", status: "stopped", ago: "3d ago", ref: "16.4",
    image: "postgres:16.4",
    namespace: "pier",
    replicas: { ready: 0, total: 1 },
    cpuUsage: "—", cpuLimit: "1.00",
    memUsage: "—", memLimit: "1 Gi",
    port: 5432,
  },
  "grafana": {
    name: "grafana", status: "building", ago: "pending", ref: "11.2.0",
    image: "grafana/grafana:11.2.0",
    namespace: "pier",
    replicas: { ready: 0, total: 1 },
    domain: "metrics.acme.dev",
    cpuUsage: "—", cpuLimit: "0.25",
    memUsage: "—", memLimit: "256 Mi",
    port: 3000,
  },
};
