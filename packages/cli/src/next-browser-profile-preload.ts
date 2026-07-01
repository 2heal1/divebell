import fs from "node:fs";
import { syncBuiltinESMExports } from "node:module";
import { basename, dirname, join, resolve } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright";
import { applyStoredAuthState, persistAuthStateOnClose } from "./profile.js";

const profileDirectory = process.env.OPENRUNTIME_NEXT_BROWSER_PROFILE_DIR;
const OPENRUNTIME_RECORDING_CONTROL_FILE = "recording-session.json";

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
    attachOpenRuntimeRecording(context, resolvedProfileDirectory);
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

function attachOpenRuntimeRecording(context: BrowserContext, resolvedProfileDirectory: string): void {
  const session = readRecordingSession(resolvedProfileDirectory);
  if (session === undefined) return;

  const attachedPages = new WeakSet<Page>();
  const attachPage = (page: Page): void => {
    if (attachedPages.has(page)) return;
    attachedPages.add(page);
    page.on("console", (message) => {
      const text = message.text();
      const markerIndex = text.indexOf(session.marker);
      if (markerIndex < 0) return;
      const payload = text.slice(markerIndex + session.marker.length).trim();
      if (payload.length === 0) return;
      try {
        fs.appendFileSync(session.eventsFile, `${payload}\n`, "utf8");
      } catch (error) {
        process.stderr.write(`OpenRuntime recording event could not be persisted: ${error instanceof Error ? error.message : String(error)}\n`);
      }
    });
  };

  for (const page of context.pages()) {
    attachPage(page);
  }
  context.on("page", attachPage);
}

function readRecordingSession(resolvedProfileDirectory: string): { marker: string; eventsFile: string } | undefined {
  const controlFile = join(resolvedProfileDirectory, OPENRUNTIME_RECORDING_CONTROL_FILE);
  try {
    const parsed = JSON.parse(fs.readFileSync(controlFile, "utf8")) as {
      marker?: unknown;
      eventsFile?: unknown;
    };
    if (typeof parsed.marker !== "string" || parsed.marker.length === 0) return undefined;
    if (typeof parsed.eventsFile !== "string" || parsed.eventsFile.length === 0) return undefined;
    fs.mkdirSync(dirname(parsed.eventsFile), { recursive: true });
    return {
      marker: parsed.marker,
      eventsFile: parsed.eventsFile
    };
  } catch {
    return undefined;
  }
}
