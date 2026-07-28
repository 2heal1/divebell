import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { win32 } from "node:path";

export const CHROME_REMOTE_DEBUGGING_URL = "chrome://inspect/#remote-debugging";

export interface RemoteDebuggingPageOpenResult {
  opened: boolean;
  reason?: string;
}

export interface RemoteDebuggingPageOpener {
  open(): Promise<RemoteDebuggingPageOpenResult>;
}

type DetachedLauncher = (
  command: string,
  args: readonly string[]
) => Promise<void>;

export function createRemoteDebuggingPageOpener(options: {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
  launch?: DetachedLauncher;
  pathExists?: (path: string) => Promise<boolean>;
} = {}): RemoteDebuggingPageOpener {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  const launch = options.launch ?? launchDetached;
  const pathExists = options.pathExists ?? fileExists;

  return {
    open: async () => {
      const candidates = await createLaunchCandidates(
        platform,
        env,
        pathExists
      );
      const failures: string[] = [];
      for (const candidate of candidates) {
        try {
          await launch(candidate.command, candidate.args);
          return {
            opened: true
          };
        } catch (error) {
          failures.push(`${candidate.label}: ${errorMessage(error)}`);
        }
      }
      return {
        opened: false,
        reason: failures.length === 0
          ? `No supported Chrome installation was found on ${platform}.`
          : failures.join("; ")
      };
    }
  };
}

async function createLaunchCandidates(
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  pathExists: (path: string) => Promise<boolean>
): Promise<Array<{
  label: string;
  command: string;
  args: string[];
}>> {
  if (platform === "darwin") {
    return [
      "Google Chrome",
      "Google Chrome Canary",
      "Chromium",
      "Brave Browser"
    ].map((application) => ({
      label: application,
      command: "open",
      args: ["-a", application, CHROME_REMOTE_DEBUGGING_URL]
    }));
  }

  if (platform === "win32") {
    const roots = [
      env.ProgramFiles,
      env["ProgramFiles(x86)"],
      env.LOCALAPPDATA
    ].filter((value): value is string => Boolean(value));
    const relativePaths = [
      ["Google", "Chrome", "Application", "chrome.exe"],
      ["Google", "Chrome SxS", "Application", "chrome.exe"],
      ["Chromium", "Application", "chrome.exe"],
      ["BraveSoftware", "Brave-Browser", "Application", "brave.exe"]
    ];
    const candidates = [];
    for (const root of roots) {
      for (const parts of relativePaths) {
        const executable = win32.join(root, ...parts);
        if (await pathExists(executable)) {
          candidates.push({
            label: executable,
            command: executable,
            args: ["--new-tab", CHROME_REMOTE_DEBUGGING_URL]
          });
        }
      }
    }
    return candidates;
  }

  if (platform === "linux") {
    return [
      "google-chrome",
      "google-chrome-stable",
      "chromium",
      "chromium-browser",
      "brave-browser"
    ].map((command) => ({
      label: command,
      command,
      args: ["--new-tab", CHROME_REMOTE_DEBUGGING_URL]
    }));
  }

  return [];
}

function launchDetached(
  command: string,
  args: readonly string[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      detached: true,
      stdio: "ignore"
    });
    child.once("error", reject);
    child.once("spawn", () => {
      child.unref();
      resolve();
    });
  });
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
