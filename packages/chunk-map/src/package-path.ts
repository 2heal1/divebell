/** Infer only the package's own virtual-store version, never a peer/ancestor version. */
export function inferPnpmVersion(sourcePath: string | null, packageName: string | null): string | null {
  if (sourcePath === null || packageName === null) return null;
  const normalized = sourcePath.replaceAll("\\", "/");
  const packageIndex = normalized.lastIndexOf("/node_modules/");
  const storeMarker = "/.pnpm/";
  const storeIndex = normalized.lastIndexOf(storeMarker, packageIndex);
  if (packageIndex < 0 || storeIndex < 0) return null;
  const storeEntry = normalized.slice(storeIndex + storeMarker.length, packageIndex);
  // The store entry must directly contain this node_modules directory. A
  // nested package's version cannot be inferred from its ancestor's entry.
  if (storeEntry.includes("/")) return null;
  const prefix = `${packageName.replace("/", "+")}@`;
  if (!storeEntry.startsWith(prefix)) return null;
  const version = storeEntry.slice(prefix.length).split(/[_()]/, 1)[0];
  return version || null;
}
