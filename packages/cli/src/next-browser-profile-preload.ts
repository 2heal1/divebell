import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, resolve } from "node:path";
import { chromium, type BrowserContext } from "playwright";
import { applyStoredAuthState, persistAuthStateOnClose } from "./profile.js";

const profileDirectory = process.env.OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR;

if (profileDirectory !== undefined && profileDirectory.length > 0) {
  const originalExistsSync = fs.existsSync.bind(fs);
  const originalLstatSync = fs.lstatSync.bind(fs);
  const originalMkdirSync = fs.mkdirSync.bind(fs);
  const originalSymlinkSync = fs.symlinkSync.bind(fs);
  const resolvedProfileDirectory = resolve(profileDirectory);

  fs.mkdirSync = ((path, options) => {
    if (!isNextBrowserProfilePath(path)) {
      return originalMkdirSync(path, options);
    }

    originalMkdirSync(dirname(path), {
      recursive: true,
      mode: 0o700
    });
    originalMkdirSync(resolvedProfileDirectory, {
      recursive: true,
      mode: 0o700
    });

    try {
      if (originalLstatSync(path).isSymbolicLink()) {
        return undefined;
      }
    } catch {
      // The temporary profile path does not exist yet, so it can be linked below.
    }

    if (originalExistsSync(path)) {
      return originalMkdirSync(path, options);
    }

    originalSymlinkSync(resolvedProfileDirectory, path, "dir");
    return undefined;
  }) as typeof fs.mkdirSync;

  patchPersistentContext(resolvedProfileDirectory);
  syncBuiltinESMExports();
}

function isNextBrowserProfilePath(path: fs.PathLike): path is string {
  return typeof path === "string" && basename(path).startsWith("next-browser-profile-");
}

function patchPersistentContext(resolvedProfileDirectory: string): void {
  const originalLaunchPersistentContext = chromium.launchPersistentContext.bind(chromium);
  chromium.launchPersistentContext = (async (...args: Parameters<typeof chromium.launchPersistentContext>) => {
    const context = await originalLaunchPersistentContext(...args);
    await applyStoredProfileState(context, resolvedProfileDirectory);
    return persistAuthStateOnClose(context, resolvedProfileDirectory);
  }) as typeof chromium.launchPersistentContext;
}

async function applyStoredProfileState(context: BrowserContext, resolvedProfileDirectory: string): Promise<void> {
  try {
    await applyStoredAuthState(context, resolvedProfileDirectory);
  } catch (error) {
    process.stderr.write(`OpenRuntime profile state could not be applied: ${error instanceof Error ? error.message : String(error)}\n`);
  }
}
