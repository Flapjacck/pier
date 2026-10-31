/** Base pier sprite ids (without pier- prefix or -solid suffix). */
export const PIER_ICON_BASE_NAMES = [
  "deploy",
  "rollback",
  "app",
  "containers",
  "scale",
  "add",
  "delete",
  "build",
  "cluster",
  "namespace",
  "logs",
  "domain",
  "repo",
  "settings",
  "search",
  "user",
] as const;

export type PierIconBaseName = (typeof PIER_ICON_BASE_NAMES)[number];

/** Every symbol id suffix in /icons/sprite.svg (base + -solid variants). */
export const PIER_ICON_NAMES = [
  "deploy",
  "deploy-solid",
  "rollback",
  "rollback-solid",
  "app",
  "app-solid",
  "containers",
  "containers-solid",
  "scale",
  "scale-solid",
  "add",
  "add-solid",
  "delete",
  "delete-solid",
  "build",
  "build-solid",
  "cluster",
  "cluster-solid",
  "namespace",
  "namespace-solid",
  "logs",
  "logs-solid",
  "domain",
  "domain-solid",
  "repo",
  "repo-solid",
  "settings",
  "settings-solid",
  "search",
  "search-solid",
  "user",
  "user-solid",
] as const;

export type PierIconName = (typeof PIER_ICON_NAMES)[number];

function isSolidIconName(name: PierIconName): name is `${PierIconBaseName}-solid` {
  return name.endsWith("-solid");
}

export function resolvePierIconId(
  name: PierIconName,
  solid?: boolean,
): { base: PierIconBaseName; solid: boolean } {
  if (isSolidIconName(name)) {
    const base = name.slice(0, -6) as PierIconBaseName;
    return { base, solid: solid ?? true };
  }
  return { base: name as PierIconBaseName, solid: solid ?? false };
}
