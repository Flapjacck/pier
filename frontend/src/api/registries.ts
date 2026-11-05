import { request, requestVoid, type RequestOptions } from "./request";
import { parseImageInspection, parseRegistry, parseRegistryList } from "./registryGuards";
import type { ImageInspection, Registry } from "./types";

export function listRegistries(options?: RequestOptions): Promise<Registry[]> {
  return request("/api/registries", { ...options, parse: parseRegistryList });
}
export function createRegistry(body: { name: string; host: string; username: string; password: string }, options?: RequestOptions): Promise<Registry> {
  return request("/api/registries", { ...options, method: "POST", body, parse: (value) => parseRegistry((value as { registry: unknown }).registry) });
}
export function updateRegistry(name: string, body: { host?: string; username?: string; password?: string }, options?: RequestOptions): Promise<Registry> {
  return request(`/api/registries/${encodeURIComponent(name)}`, { ...options, method: "PATCH", body, parse: (value) => parseRegistry((value as { registry: unknown }).registry) });
}
export function testRegistry(name: string, options?: RequestOptions): Promise<void> {
  return requestVoid(`/api/registries/${encodeURIComponent(name)}/test`, { ...options, method: "POST" });
}
export function deleteRegistry(name: string, options?: RequestOptions): Promise<void> {
  return requestVoid(`/api/registries/${encodeURIComponent(name)}`, { ...options, method: "DELETE" });
}
export function inspectImage(body: { image: string; registry?: string }, options?: RequestOptions): Promise<ImageInspection> {
  return request("/api/images/inspect", { ...options, method: "POST", body, parse: parseImageInspection });
}
