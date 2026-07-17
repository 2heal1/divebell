import { realpathSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

export function isEntryPoint(entry: string | undefined, moduleUrl: string): boolean {
  if (entry === undefined) return false;

  try {
    const entryUrl = pathToFileURL(realpathSync(entry)).href;
    const modulePath = fileURLToPath(moduleUrl);
    const moduleRealUrl = pathToFileURL(realpathSync(modulePath)).href;
    return entryUrl === moduleRealUrl;
  } catch {
    return moduleUrl === pathToFileURL(entry).href;
  }
}
