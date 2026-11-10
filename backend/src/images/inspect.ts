import type { RegistryCredential } from "../k8s/registries.js";

export type ImageInspection = {
  image: string;
  digest: string;
  exposedPorts: number[];
  /** @deprecated Use exposedPorts. */
  ports: number[];
  volumes: string[];
  workingDir?: string;
  defaultUser?: string;
  command?: string[];
};

type Ref = { host: string; repository: string; reference: string; base: string };
type Manifest = {
  config?: { digest?: string };
  digest?: string;
  manifests?: { digest?: string; platform?: { os?: string; architecture?: string } }[];
};
type Config = { config?: { ExposedPorts?: Record<string, unknown>; Volumes?: Record<string, unknown>; WorkingDir?: string; User?: string; Cmd?: string[] } };
const ACCEPT = "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.oci.image.manifest.v1+json, application/vnd.docker.distribution.manifest.v2+json";
const MAX_BODY = 2 * 1024 * 1024;

export function parseImageRef(image: string, protocol = "https:"): Ref {
  if (!image || image.length > 255 || /\s/.test(image) || image.includes("://")) throw new Error("invalid image reference");
  const parts = image.split("/");
  const first = parts[0] ?? "";
  const hasHost = first.includes(".") || first.includes(":") || first === "localhost";
  const host = hasHost ? first.toLowerCase() : "docker.io";
  const rawRepo = (hasHost ? parts.slice(1) : parts).join("/");
  if (!rawRepo || rawRepo.startsWith("/") || rawRepo.includes("@@")) throw new Error("invalid image reference");
  const digestAt = rawRepo.lastIndexOf("@");
  const colonAt = rawRepo.lastIndexOf(":");
  const splitAt = digestAt > -1 ? digestAt : colonAt > rawRepo.lastIndexOf("/") ? colonAt : -1;
  const repository = (splitAt > -1 ? rawRepo.slice(0, splitAt) : rawRepo).replace(/^\/+|\/+$/g, "");
  const reference = splitAt > -1 ? rawRepo.slice(splitAt + 1) : "latest";
  if (!repository || !reference || !/^[A-Za-z0-9._:@/-]+$/.test(reference)) throw new Error("invalid image reference");
  const normalizedRepo = host === "docker.io" && !repository.includes("/") ? `library/${repository}` : repository;
  return { host, repository: normalizedRepo, reference, base: `${protocol}//${host === "docker.io" ? "registry-1.docker.io" : host}` };
}

export async function inspectImage(
  image: string,
  credential?: RegistryCredential,
  fetcher: typeof fetch = fetch,
  /** Pier's in-cluster build registry is plain HTTP (#83). */
  plainHttp = false,
): Promise<ImageInspection> {
  const protocol = plainHttp || credential?.host?.startsWith("http://") ? "http:" : "https:";
  const parsed = parseImageRef(image, protocol);
  if (credential && parsed.host !== normalizeHost(credential.host ?? credential.registry ?? "")) throw new Error("image host does not match registry");
  const auth = credential ? `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}` : undefined;
  const challenge = await get(`${parsed.base}/v2/`, auth, fetcher, "application/json").catch((error: unknown) => {
    if (error instanceof RegistryHttpError && error.status !== 401) throw error;
    return undefined;
  });
  void challenge;
  const token = await bearerToken(parsed, auth, fetcher);
  const manifest = await getJson<Manifest>(`${parsed.base}/v2/${parsed.repository}/manifests/${parsed.reference}`, token ?? auth, fetcher, ACCEPT);
  const selected = manifest.manifests?.find((item) => item.platform?.os === "linux" && item.platform.architecture === "amd64")
    ?? manifest.manifests?.find((item) => item.platform?.os === "linux") ?? manifest.manifests?.[0];
  const resolved = selected?.digest ? await getJson<Manifest>(`${parsed.base}/v2/${parsed.repository}/manifests/${selected.digest}`, token ?? auth, fetcher, ACCEPT) : manifest;
  if (!resolved.config?.digest) throw new Error("registry manifest has no config");
  const config = await getJson<Config>(`${parsed.base}/v2/${parsed.repository}/blobs/${resolved.config.digest}`, token ?? auth, fetcher);
  const details = config.config ?? {};
  const exposedPorts = Object.keys(details.ExposedPorts ?? {}).flatMap((key) => {
    const port = Number(key.split("/")[0]);
    return Number.isInteger(port) && port > 0 && port <= 65535 ? [port] : [];
  }).sort((a, b) => a - b);
  return {
    image,
    digest: selected?.digest ?? manifest.digest ?? resolved.config.digest,
    exposedPorts,
    ports: exposedPorts,
    volumes: Object.keys(details.Volumes ?? {}).sort(),
    ...(details.WorkingDir ? { workingDir: details.WorkingDir } : {}),
    ...(details.User ? { defaultUser: details.User } : {}),
    ...(details.Cmd ? { command: details.Cmd } : {}),
  };
}

export async function probeRegistry(credential: RegistryCredential, fetcher: typeof fetch = fetch): Promise<void> {
  try {
    const host = normalizeHost(credential.host ?? credential.registry ?? "");
    const base = `https://${host === "docker.io" ? "registry-1.docker.io" : host}`;
    const auth = `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}`;
    const response = await fetcher(`${base}/v2/`, {
      headers: { authorization: auth },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 403) throw new Error("invalid credentials");
    if (response.ok) return;
    if (response.status !== 401) throw new Error("registry unreachable");
    const token = await tokenFromChallenge(response.headers.get("www-authenticate"), credential, fetcher);
    const authorized = await fetcher(`${base}/v2/`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (authorized.status === 401 || authorized.status === 403) throw new Error("invalid credentials");
    if (!authorized.ok) throw new Error("registry unreachable");
  } catch (error) {
    if (error instanceof Error && (error.message === "invalid credentials" || error.message === "registry unreachable")) throw error;
    throw new Error("registry unreachable");
  }
}

function normalizeHost(host: string): string {
  return host.replace(/^https?:\/\//, "").replace(/\/+$/, "").replace(/^registry-1\./, "").toLowerCase();
}

async function tokenFromChallenge(challenge: string | null, credential: RegistryCredential, fetcher: typeof fetch): Promise<string> {
  const match = challenge ? /^Bearer\s+(.+)$/i.exec(challenge) : undefined;
  const params = match ? Object.fromEntries([...match[1].matchAll(/([a-z]+)="([^"]*)"/g)].map((item) => [item[1], item[2]])) : {};
  if (!params.realm) throw new Error("invalid credentials");
  const url = new URL(params.realm);
  if (params.service) url.searchParams.set("service", params.service);
  const response = await fetcher(url, {
    headers: { authorization: `Basic ${Buffer.from(`${credential.username}:${credential.password}`).toString("base64")}` },
    signal: AbortSignal.timeout(10_000),
  });
  if (response.status === 401 || response.status === 403) throw new Error("invalid credentials");
  if (!response.ok) throw new Error("registry unreachable");
  const body = await readJson<{ token?: string; access_token?: string }>(response);
  const token = body.token ?? body.access_token;
  if (!token) throw new Error("invalid credentials");
  return token;
}

class RegistryHttpError extends Error {
  constructor(public readonly status: number) { super(`registry request failed (${status})`); }
}

async function bearerToken(ref: Ref, auth: string | undefined, fetcher: typeof fetch): Promise<string | undefined> {
  const response = await fetcher(`${ref.base}/v2/${ref.repository}/manifests/${ref.reference}`, { headers: { Accept: ACCEPT, ...(auth ? { authorization: auth } : {}) }, signal: AbortSignal.timeout(10_000) });
  if (response.status !== 401) return undefined;
  const challenge = response.headers.get("www-authenticate") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(challenge);
  if (!match) throw new Error("authentication required");
  const params = Object.fromEntries([...match[1].matchAll(/([a-z]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
  if (!params.realm) throw new Error("authentication required");
  const url = new URL(params.realm);
  if (params.service) url.searchParams.set("service", params.service);
  url.searchParams.set("scope", params.scope ?? `repository:${ref.repository}:pull`);
  const tokenResponse = await fetcher(url, { headers: auth ? { authorization: auth } : {}, signal: AbortSignal.timeout(10_000) });
  if (tokenResponse.status === 401 || tokenResponse.status === 403) throw new Error("authentication required");
  if (!tokenResponse.ok) throw new RegistryHttpError(tokenResponse.status);
  const tokenBody = await readJson<{ token?: string; access_token?: string }>(tokenResponse);
  return tokenBody.token ?? tokenBody.access_token;
}

async function get(url: string, auth: string | undefined, fetcher: typeof fetch, accept: string): Promise<Response> {
  const response = await fetcher(url, { headers: { Accept: accept, ...(auth ? { authorization: auth } : {}) }, signal: AbortSignal.timeout(10_000) });
  if (!response.ok) throw new RegistryHttpError(response.status);
  return response;
}

async function getJson<T>(url: string, auth: string | undefined, fetcher: typeof fetch, accept = "application/octet-stream"): Promise<T> {
  const response = await fetcher(url, { headers: { Accept: accept, ...(auth ? { authorization: auth } : {}) }, signal: AbortSignal.timeout(10_000) });
  if (response.status === 401) throw new Error("authentication required");
  if (response.status === 404) throw new Error("image not found");
  if (!response.ok) throw new RegistryHttpError(response.status);
  return readJson<T>(response);
}

async function readJson<T>(response: Response): Promise<T> {
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BODY) throw new Error("registry response too large");
  const text = await response.text();
  if (text.length > MAX_BODY) throw new Error("registry response too large");
  return JSON.parse(text) as T;
}
