import { readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

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
  if (commandSelectsBrowserContext(options.args)) return true;
  if (environmentSelectsBrowserContext(options.env)) return true;

  const explicitConfig = readCommandOption(options.args, "config")
    ?? nonEmpty(options.env.AGENT_BROWSER_CONFIG);
  if (explicitConfig !== undefined) {
    return await configSelectsBrowserContext(
      resolve(options.cwd, explicitConfig),
      true
    );
  }

  return await configSelectsBrowserContext(join(options.agentBrowserHome, "config.json"))
    || await configSelectsBrowserContext(join(options.cwd, "agent-browser.json"));
}

function commandSelectsBrowserContext(args: readonly string[]): boolean {
  if ([
    "profile",
    "state",
    "restore",
    "allowed-domains",
    "cdp",
    "auto-connect",
    "provider",
    "executable-path"
  ].some((name) => hasCommandOption(args, name))) {
    return true;
  }

  const engine = readCommandOption(args, "engine")?.trim().toLowerCase();
  if (engine !== undefined && engine !== "" && engine !== "chrome") return true;
  return rawArgumentsSelectProfile(readCommandOption(args, "args"));
}

function environmentSelectsBrowserContext(env: NodeJS.ProcessEnv): boolean {
  if ([
    "AGENT_BROWSER_PROFILE",
    "AGENT_BROWSER_STATE",
    "AGENT_BROWSER_RESTORE",
    "AGENT_BROWSER_ALLOWED_DOMAINS",
    "AGENT_BROWSER_CDP",
    "AGENT_BROWSER_AUTO_CONNECT",
    "AGENT_BROWSER_PROVIDER",
    "AGENT_BROWSER_EXECUTABLE_PATH"
  ].some((name) => nonEmpty(env[name]) !== undefined)) {
    return true;
  }

  const engine = env.AGENT_BROWSER_ENGINE?.trim().toLowerCase();
  if (engine !== undefined && engine !== "" && engine !== "chrome") return true;
  return rawArgumentsSelectProfile(env.AGENT_BROWSER_ARGS);
}

async function configSelectsBrowserContext(
  path: string,
  missingSelectsContext = false
): Promise<boolean> {
  let config: unknown;
  try {
    config = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    return missingSelectsContext || !isMissingFileError(error);
  }
  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    return true;
  }

  const values = config as Record<string, unknown>;
  if ([
    "profile",
    "state",
    "storageState",
    "restore",
    "allowedDomains",
    "cdp",
    "cdpUrl",
    "autoConnect",
    "provider",
    "executablePath"
  ].some((name) => hasConfiguredValue(values[name]))) {
    return true;
  }

  const engine = typeof values.engine === "string"
    ? values.engine.trim().toLowerCase()
    : undefined;
  if (engine !== undefined && engine !== "" && engine !== "chrome") return true;
  return rawArgumentsSelectProfile(
    typeof values.args === "string" ? values.args : undefined
  );
}

function hasCommandOption(args: readonly string[], name: string): boolean {
  const option = `--${name}`;
  return args.some((argument) => argument === option || argument.startsWith(`${option}=`));
}

function readCommandOption(args: readonly string[], name: string): string | undefined {
  const option = `--${name}`;
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const argument = args[index];
    if (argument === undefined) continue;
    if (argument.startsWith(`${option}=`)) return argument.slice(option.length + 1);
    if (argument === option) return args[index + 1];
  }
  return undefined;
}

function rawArgumentsSelectProfile(value: string | undefined): boolean {
  return value?.includes("--user-data-dir") === true
    || value?.includes("--profile-directory") === true;
}

function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== false;
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
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

function isMissingFileError(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "ENOENT";
}
