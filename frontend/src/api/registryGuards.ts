import { isRecord } from "./guards";
import type { ImageInspection, Registry } from "./types";

export function parseRegistry(json: unknown): Registry {
  if (!isRecord(json) || typeof json.name !== "string" || typeof (json.host ?? json.server) !== "string" ||
      typeof json.username !== "string" || typeof json.createdAt !== "string") {
    throw new SyntaxError("Invalid registry response");
  }
  return { name: json.name, server: String(json.host ?? json.server), username: json.username, createdAt: json.createdAt };
}

export function parseRegistryList(json: unknown): Registry[] {
  const entries = isRecord(json) && Array.isArray(json.registries) ? json.registries : json;
  if (!Array.isArray(entries)) throw new SyntaxError("Invalid registry list");
  return entries.map(parseRegistry);
}

export function parseImageInspection(json: unknown): ImageInspection {
  const ports = isRecord(json) ? (json.exposedPorts ?? json.ports) : undefined;
  if (!isRecord(json) || typeof json.image !== "string" ||
      !Array.isArray(ports) || !ports.every((v) => typeof v === "number") ||
      !Array.isArray(json.volumes) || !json.volumes.every((v) => typeof v === "string") ||
      (json.defaultUser !== undefined && typeof json.defaultUser !== "string")) {
    throw new SyntaxError("Invalid image inspection");
  }
  return { image: json.image, digest: String(json.digest ?? ""), exposedPorts: ports, volumes: json.volumes, workingDir: typeof json.workingDir === "string" ? json.workingDir : undefined, defaultUser: typeof json.defaultUser === "string" ? json.defaultUser : undefined };
}
