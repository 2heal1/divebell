import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";

export interface BrowserCommandOptions {
  has(name: string): boolean;
  get(name: string): string | undefined;
}

export interface BrowserLaunchConfiguration {
  config: Readonly<Record<string, unknown>>;
  selectsBrowserContext: boolean;
  usesDivebellLaunchedChrome: boolean;
  supportsReusableInitialBlankPage: boolean;
}

interface BrowserConfigFile {
  values: Readonly<Record<string, unknown>>;
  selectsBrowserContext: boolean;
}

const COMMAND_CONTEXT_OPTIONS = [
  "profile",
  "state",
  "restore",
  "allowed-domains",
  "cdp",
  "auto-connect",
  "provider",
  "executable-path"
] as const;

const ENVIRONMENT_CONTEXT_OPTIONS = [
  "AGENT_BROWSER_PROFILE",
  "AGENT_BROWSER_STATE",
  "AGENT_BROWSER_RESTORE",
  "AGENT_BROWSER_ALLOWED_DOMAINS",
  "AGENT_BROWSER_CDP",
  "AGENT_BROWSER_AUTO_CONNECT",
  "AGENT_BROWSER_PROVIDER",
  "AGENT_BROWSER_EXECUTABLE_PATH"
] as const;

const CONFIG_CONTEXT_OPTIONS = [
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
] as const;

export function createBrowserCommandOptionsFromArgv(
  args: readonly string[]
): BrowserCommandOptions {
  return {
    has: (name) => hasArgvOption(args, name),
    get: (name) => readArgvOption(args, name)
  };
}

export function createBrowserCommandOptionsFromMap(
  options: ReadonlyMap<string, readonly string[]>
): BrowserCommandOptions {
  return {
    has: (name) => options.has(name),
    get: (name) => options.get(name)?.at(-1)
  };
}

export function commandSelectsBrowserContext(
  command: BrowserCommandOptions
): boolean {
  if (COMMAND_CONTEXT_OPTIONS.some((name) => command.has(name))) {
    return true;
  }
  if (!isChromeEngine(command.get("engine"))) return true;
  return rawArgumentsSelectProfile(command.get("args"));
}

export function commandDisablesDefaultChromeProfile(
  command: BrowserCommandOptions
): boolean {
  return command.has("args") || commandSelectsBrowserContext(command);
}

export function environmentSupportsReusableInitialBlankPage(
  env: NodeJS.ProcessEnv
): boolean {
  return nonEmpty(env.AGENT_BROWSER_ALLOWED_DOMAINS) === undefined
    && environmentUsesDivebellLaunchedChrome(env)
    && isChromeEngine(env.AGENT_BROWSER_ENGINE);
}

export async function resolveBrowserLaunchConfiguration(options: {
  command: BrowserCommandOptions;
  env: NodeJS.ProcessEnv;
  agentBrowserHome: string;
  cwd: string;
}): Promise<BrowserLaunchConfiguration> {
  const config = await readBrowserConfiguration(options);
  const usesDivebellLaunchedChrome = commandUsesDivebellLaunchedChrome(options.command)
    && environmentUsesDivebellLaunchedChrome(options.env)
    && configUsesDivebellLaunchedChrome(config.values)
    && isChromeEngine(
      options.command.get("engine")
      ?? nonEmpty(options.env.AGENT_BROWSER_ENGINE)
      ?? configuredString(config.values.engine)
    );
  const allowedDomainsConfigured = options.command.has("allowed-domains")
    || nonEmpty(options.env.AGENT_BROWSER_ALLOWED_DOMAINS) !== undefined
    || hasConfiguredValue(config.values.allowedDomains);

  return {
    config: config.values,
    selectsBrowserContext: commandSelectsBrowserContext(options.command)
      || environmentSelectsBrowserContext(options.env)
      || config.selectsBrowserContext,
    usesDivebellLaunchedChrome,
    supportsReusableInitialBlankPage:
      usesDivebellLaunchedChrome && !allowedDomainsConfigured
  };
}

function commandUsesDivebellLaunchedChrome(command: BrowserCommandOptions): boolean {
  return !["cdp", "auto-connect", "provider"].some((name) => command.has(name));
}

function environmentUsesDivebellLaunchedChrome(env: NodeJS.ProcessEnv): boolean {
  return nonEmpty(env.AGENT_BROWSER_CDP) === undefined
    && !isTruthyEnvironmentValue(env.AGENT_BROWSER_AUTO_CONNECT)
    && nonEmpty(env.AGENT_BROWSER_PROVIDER) === undefined;
}

function configUsesDivebellLaunchedChrome(
  config: Readonly<Record<string, unknown>>
): boolean {
  return !["cdp", "cdpUrl", "autoConnect", "provider"]
    .some((name) => hasConfiguredValue(config[name]));
}

function environmentSelectsBrowserContext(env: NodeJS.ProcessEnv): boolean {
  if (ENVIRONMENT_CONTEXT_OPTIONS.some((name) => nonEmpty(env[name]) !== undefined)) {
    return true;
  }
  if (!isChromeEngine(env.AGENT_BROWSER_ENGINE)) return true;
  return rawArgumentsSelectProfile(env.AGENT_BROWSER_ARGS);
}

function configSelectsBrowserContext(
  config: Readonly<Record<string, unknown>>
): boolean {
  if (CONFIG_CONTEXT_OPTIONS.some((name) => hasConfiguredValue(config[name]))) {
    return true;
  }
  if (!isChromeEngine(configuredString(config.engine))) return true;
  return rawArgumentsSelectProfile(configuredString(config.args));
}

async function readBrowserConfiguration(options: {
  command: BrowserCommandOptions;
  env: NodeJS.ProcessEnv;
  agentBrowserHome: string;
  cwd: string;
}): Promise<BrowserConfigFile> {
  const explicitConfig = options.command.get("config")
    ?? nonEmpty(options.env.AGENT_BROWSER_CONFIG);
  if (explicitConfig !== undefined) {
    return await readBrowserConfigFile(resolve(options.cwd, explicitConfig), true);
  }

  const globalConfig = await readBrowserConfigFile(
    join(options.agentBrowserHome, "config.json"),
    false
  );
  const projectConfig = await readBrowserConfigFile(
    join(options.cwd, "agent-browser.json"),
    false
  );
  return {
    values: mergeBrowserConfig(globalConfig.values, projectConfig.values),
    selectsBrowserContext:
      globalConfig.selectsBrowserContext || projectConfig.selectsBrowserContext
  };
}

async function readBrowserConfigFile(
  path: string,
  missingSelectsBrowserContext: boolean
): Promise<BrowserConfigFile> {
  let value: unknown;
  try {
    value = JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch (error) {
    return {
      values: {},
      selectsBrowserContext:
        missingSelectsBrowserContext || !isMissingFileError(error)
    };
  }
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { values: {}, selectsBrowserContext: true };
  }
  const values = value as Record<string, unknown>;
  return {
    values,
    selectsBrowserContext: configSelectsBrowserContext(values)
  };
}

function mergeBrowserConfig(
  base: Readonly<Record<string, unknown>>,
  overrides: Readonly<Record<string, unknown>>
): Readonly<Record<string, unknown>> {
  return {
    ...base,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([, value]) => value !== undefined && value !== null)
    )
  };
}

function hasArgvOption(args: readonly string[], name: string): boolean {
  const option = `--${name}`;
  return args.some((argument) => argument === option || argument.startsWith(`${option}=`));
}

function readArgvOption(args: readonly string[], name: string): string | undefined {
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

function configuredString(value: unknown): string | undefined {
  return typeof value === "string" ? nonEmpty(value) : undefined;
}

function hasConfiguredValue(value: unknown): boolean {
  if (typeof value === "string") return value.trim().length > 0;
  if (Array.isArray(value)) return value.length > 0;
  return value !== undefined && value !== null && value !== false;
}

function isChromeEngine(value: string | undefined): boolean {
  const engine = value?.trim().toLowerCase();
  return engine === undefined || engine === "" || engine === "chrome";
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function isTruthyEnvironmentValue(value: string | undefined): boolean {
  return value === "1" || value?.trim().toLowerCase() === "true";
}

function isMissingFileError(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && (error as { code?: unknown }).code === "ENOENT";
}
