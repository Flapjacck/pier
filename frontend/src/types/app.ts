export type DeployStatus = "running" | "building" | "failed" | "stopped" | "queued";

export interface AppRow {
  /** Display name of the service */
  name: string;
  status: DeployStatus;
  /** Relative time label, e.g. "2m ago" */
  ago: string;
  /** Mono ref, e.g. "main@4f2a91c" or a version string */
  ref: string;
}

/** Extended data shown on the app detail page */
export interface AppDetail extends AppRow {
  image: string;
  namespace: string;
  replicas: { ready: number; total: number };
  domain?: string;
  cpuUsage: string;
  cpuLimit: string;
  memUsage: string;
  memLimit: string;
  port?: number;
}
