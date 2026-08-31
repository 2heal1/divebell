import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import {
  createBrowserCommandOptionsFromArgv,
  resolveBrowserLaunchConfiguration
} from "./launch-configuration.js";

export const DIVEBELL_DEFAULT_CHROME_PROFILE_ENV = "DIVEBELL_DEFAULT_CHROME_PROFILE";

export interface LatestChromeProfileOptions {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  userDataDirectory?: string;
}

interface ChromeProfileMetadata {
  active_time?: unknown;
}

interface ChromeLocalState {
  profile?: {
    last_used?: unknown;
    last_active_profiles?: unknown;
    info_cache?: unknown;
  };
}

export async function resolveLatestChromeProfile(
  options: LatestChromeProfileOptions = {}
): Promise<string | undefined> {
  const userDataDirectory = options.userDataDirectory
    ?? resolveChromeUserDataDirectory(options);
  if (userDataDirectory === undefined) return undefined;

  let localState: ChromeLocalState;
  try {
    localState = JSON.parse(
      await readFile(join(userDataDirectory, "Local State"), "utf8")
    ) as ChromeLocalState;
  } catch {
    return undefined;
  }

  const profile = localState.profile;
  if (profile === undefined) return undefined;
  const infoCache = readProfileInfoCache(profile.info_cache);
  const candidates = uniqueProfileDirectories([
    typeof profile.last_used === "string" ? profile.last_used : undefined,
    ...readStringArray(profile.last_active_profiles),
    ...[...infoCache.entries()]
      .sort((left, right) => readActiveTime(right[1]) - readActiveTime(left[1]))
      .map(([directory]) => directory)
  ]);

  for (const directory of candidates) {
    if (await isExistingProfileDirectory(userDataDirectory, directory)) {
      return directory;
    }
  }
  return undefined;
}

export function resolveChromeUserDataDirectory(
  options: Omit<LatestChromeProfileOptions, "userDataDirectory"> = {}
): string | undefined {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  if (platform === "win32") {
    const localAppData = env.LOCALAPPDATA?.trim();
    return localAppData
      ? join(localAppData, "Google", "Chrome", "User Data")
      : undefined;
  }

  const homeDirectory = env.HOME?.trim()
    || (env === process.env ? homedir() : undefined);
  if (platform === "darwin" && homeDirectory !== undefined) {
    return join(homeDirectory, "Library", "Application Support", "Google", "Chrome");
  }
  if (platform === "linux") {
    const configDirectory = env.XDG_CONFIG_HOME?.trim();
    if (configDirectory) return join(configDirectory, "google-chrome");
    return homeDirectory === undefined
      ? undefined
      : join(homeDirectory, ".config", "google-chrome");
  }
  return undefined;
}

export function defaultChromeProfileIsEnabled(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const configured = env[DIVEBELL_DEFAULT_CHROME_PROFILE_ENV]?.trim().toLowerCase();
  return configured !== "0"
    && configured !== "false"
    && configured !== "off"
    && configured !== "never";
}

export async function browserConfigurationSelectsContext(options: {
  args: readonly string[];
  env: NodeJS.ProcessEnv;
  agentBrowserHome: string;
  cwd: string;
}): Promise<boolean> {
  return (await resolveBrowserLaunchConfiguration({
    command: createBrowserCommandOptionsFromArgv(options.args),
    env: options.env,
    agentBrowserHome: options.agentBrowserHome,
    cwd: options.cwd
  })).selectsBrowserContext;
}

function readProfileInfoCache(value: unknown): Map<string, ChromeProfileMetadata> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return new Map();
  }
  return new Map(Object.entries(value).flatMap(([directory, metadata]) => {
    if (metadata === null || typeof metadata !== "object" || Array.isArray(metadata)) {
      return [];
    }
    return [[directory, metadata as ChromeProfileMetadata]];
  }));
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function readActiveTime(metadata: ChromeProfileMetadata): number {
  return typeof metadata.active_time === "number" && Number.isFinite(metadata.active_time)
    ? metadata.active_time
    : Number.NEGATIVE_INFINITY;
}

function uniqueProfileDirectories(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string =>
    value !== undefined && isSafeProfileDirectory(value)
  ))];
}

function isSafeProfileDirectory(value: string): boolean {
  return value.length > 0
    && value !== "."
    && value !== ".."
    && !isAbsolute(value)
    && !value.includes("/")
    && !value.includes("\\");
}

async function isExistingProfileDirectory(
  userDataDirectory: string,
  profileDirectory: string
): Promise<boolean> {
  try {
    return (await stat(join(userDataDirectory, profileDirectory))).isDirectory();
  } catch {
    return false;
  }
}
