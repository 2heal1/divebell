import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { getNumberOption, getOptionValue, getOptionValues, type ParsedCliArgs } from "../utils/args.js";
import { createBridgeStateStore, createBridgeUrl } from "../features/bridge/config.js";
import { createBridgeInitScript } from "../features/bridge/inject.js";
import {
  createFileBridgeStateStore,
  ensureBridge,
  getBridgePort,
  startDedicatedBridge,
  stopManagedBridge,
  type BridgeStarter
} from "../features/bridge/process.js";
import { isBrowserPageCommand } from "./names.js";
import type { Fetcher } from "../features/runtime/client.js";
import { createCommandOutput, createError } from "../utils/output.js";
import { normalizeDivebellUrlForMatch, type CliOperationLogEntry, type CliOperationLogStore } from "../utils/operation-log.js";
import { bindBrowserRunOptions, createGetWindowScript, createInteractiveTextClickScript, parseBrowserJsonOutput, type BrowserRunOptions, type BrowserRunResult, type BrowserRunner } from "../features/browser/runner.js";
import {
  createOptionalNumberProperty,
  hasOption,
  parseHeadersOption,
  requireCommandArgument,
  writeJson
} from "../utils/command.js";
import { withDivebellSession } from "../utils/url.js";
import { resolveDivebellHomeDirectory } from "../utils/home.js";
import {
  createBrowserNetworkFingerprint,
  validateBrowserRequestRules,
  validateBrowserProxyPacUrl,
  type BrowserRequestRules
} from "../features/browser/network-control.js";
import {
  attachNetworkControl,
  createDetachedNetworkControlStarter,
  stopNetworkControl,
  type ManagedNetworkControl,
  type NetworkControlStarter
} from "../features/browser/network-control-process.js";
import { applyBrowserRestoreContextDefaults, applyOpenContextBrowserMode, applyOpenContextDefaultsOrThrow, collectBrowserRestoreContextOptions, createExtensionPageContext } from "../open-context.js";
import { createBrowserCommandArgs, getOpenCommandSessionId, shouldPreferInteractiveTextClick } from "../features/browser/command-args.js";
import { runBrowserAndPipe } from "../features/browser/io.js";
import { runConsoleCommand } from "../features/browser/console.js";
import { runNetworkCommand } from "../features/browser/network.js";
import { waitForBrowserEval } from "../features/browser/execution.js";
import {
  commandDisablesDefaultChromeProfile,
  createBrowserCommandOptionsFromMap,
  resolveBrowserLaunchConfiguration
} from "../features/browser/launch-configuration.js";
import { createDivebellExtensionApi } from "../features/extension/api.js";
import {
  runCloseHooks,
  runOpenHooks,
  type ExtensionOpenHookCompanionPage,
  type ExtensionHookFailure,
  type ExtensionOpenHookScript
} from "../features/extension/hooks.js";
import type { ExtensionHookPlan } from "../features/extension/plan.js";
import type { DivebellExtensionDefinition } from "../types/commands.js";

export interface OpenPageResult {
  url: string;
  openedUrl: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  bridgePort: number | null;
  sessionId: string | null;
  openedAt: number;
  injectedScriptPath?: string;
  requestControl?: {
    pid: number;
    controlUrl: string;
  };
}

const WEBMCP_BROWSER_ARGUMENTS = [
  "--enable-features=WebMCP",
  "--enable-features=WebMCPTesting",
  "--enable-features=DevToolsWebMCPSupport"
] as const;

const WEBMCP_EXTERNAL_BROWSER_WARNING =
  "Divebell could not enable WebMCP launch features for this externally managed or non-Chrome browser; opening it anyway. If WebMCP is unavailable, CLI calls will report webmcp_unsupported and Extension API calls will report WEBMCP_UNSUPPORTED.\n";

export async function runBrowserCliCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  fetcher: Fetcher,
  browserRunner: BrowserRunner,
  bridgeStarter: BridgeStarter,
  bridgeStateDirectory: string | undefined,
  operationLogStore: CliOperationLogStore,
  extensions: readonly DivebellExtensionDefinition[],
  openHookPlan: ExtensionHookPlan,
  stdin: AsyncIterable<string | Uint8Array>,
  env: NodeJS.ProcessEnv = process.env,
  requestControlStarter: NetworkControlStarter = createDetachedNetworkControlStarter(
    new URL("../bin.js", import.meta.url).href,
    resolveDivebellHomeDirectory(env)
  )
): Promise<number> {
  const command = args.command[0];
  if (command === "open") {
    const url = requireCommandArgument(args, 1, "URL");
    const previousOpenContext = await operationLogStore.read();
    validateWebMcpOpenArgs(args);
    const browserArgs = inheritOpenInitScripts(
      args,
      previousOpenContext
    );
    const sessionId = getOpenCommandSessionId(args);
    const browserRestoreDisabled = hasOption(args, "profile")
      || hasOption(args, "state")
      || hasOption(args, "allowed-domains");
    const browserDefaultProfileDisabled = disablesDefaultChromeProfile(args);
    const browserUi = hasOption(args, "ui");
    const webMcpLaunch = await createWebMcpBrowserLaunch(args, env);
    if (webMcpLaunch.warning !== undefined) {
      stderr.write(webMcpLaunch.warning);
    }
    const openedUrl = withDivebellSession(url, sessionId);
    const headers = parseHeadersOption(args);
    const networkConfiguration = await resolveNetworkConfiguration({
      args,
      previousOpenContext,
      env
    });
    let bridgeUrl: string | null = null;
    let startedRequestControl: ManagedNetworkControl | undefined;
    let committed = false;
    try {
      const bridge = await prepareOpenBridge(
        args,
        fetcher,
        bridgeStarter,
        bridgeStateDirectory,
        previousOpenContext?.bridgeUrl
      );
      bridgeUrl = bridge?.bridgeUrl ?? null;
      const bridgePort = bridge?.port ?? null;
      let requestControl = previousOpenContext?.requestControl;
      if (networkConfiguration.needsControl && requestControl === undefined) {
        startedRequestControl = await requestControlStarter.start({
          fingerprint: networkConfiguration.fingerprint as string,
          ...(networkConfiguration.rules === undefined ? {} : { rules: networkConfiguration.rules })
        });
        requestControl = startedRequestControl;
      }
      const browserArguments = appendBrowserArguments(
        webMcpLaunch.browserArguments,
        networkConfiguration.proxyPacUrl === undefined
          ? undefined
          : `--proxy-pac-url=${networkConfiguration.proxyPacUrl}`
      );
      if (previousOpenContext !== undefined) {
        await runExtensionCloseHooks({
          args: {
            command: ["stop"],
            options: new Map()
          },
          stderr,
          fetcher,
          browserRunner,
          bridgeStarter,
          bridgeStateDirectory,
          operationLogStore,
          extensions,
          openHookPlan
        });
      }
      const hookResult = await runOpenHooks(extensions, {
        args,
        url,
        openedUrl,
        bridgeUrl,
        ...(headers === undefined ? {} : { headers })
      }, openHookPlan);
      writeHookFailures(stderr, hookResult.failures);
      const effectiveOpenedUrl = hookResult.openedUrl ?? openedUrl;
      const browserReuseInitialBlankPage = hookResult.openedUrl === undefined;
      const openBrowserRunner = bindBrowserRunOptions(browserRunner, {
        ...(browserRestoreDisabled ? { disableRestore: true } : {}),
        ...(browserDefaultProfileDisabled ? { disableDefaultProfile: true } : {}),
        ...(browserArguments === undefined ? {} : { browserArguments })
      });
      const result = await openBrowserPage(
        openBrowserRunner,
        browserArgs,
        effectiveOpenedUrl,
        bridgeUrl,
        hookResult.scripts,
        {
          ui: browserUi,
          ...(browserReuseInitialBlankPage ? { reuseInitialBlankPage: true } : {}),
          ...(browserRestoreDisabled ? { disableRestore: true } : {}),
          ...(browserDefaultProfileDisabled ? { disableDefaultProfile: true } : {}),
          ...(browserArguments === undefined ? {} : { browserArguments })
        },
        requestControl === undefined
          ? undefined
          : (() => {
              const control = requestControl;
              return async () => {
                await attachNetworkControl(
                  control,
                  await readBrowserCdpUrl(openBrowserRunner)
                );
              };
            })()
      );
      if (result.exitCode !== 0) {
        throw createError({
          code: "PAGE_OPEN_FAILED",
          kind: "browser",
          message: result.stderr.trim() || result.stdout.trim() || "Could not open the page.",
          retryable: true,
          hint: "Run `divebell setup` to prepare browser startup.",
          details: {
            url,
            openedUrl,
            ...(result.stdout.trim().length === 0 ? {} : { stdout: result.stdout.trim() }),
            ...(result.stderr.trim().length === 0 ? {} : { stderr: result.stderr.trim() })
          }
        });
      }
      const companionFailures = await openCompanionPages(
        bindBrowserRunOptions(browserRunner, {
          ui: browserUi,
          ...(browserReuseInitialBlankPage ? { reuseInitialBlankPage: true } : {}),
          ...(browserRestoreDisabled ? { disableRestore: true } : {}),
          ...(browserDefaultProfileDisabled ? { disableDefaultProfile: true } : {}),
          ...(result.defaultProfile === undefined
            ? {}
            : { defaultProfile: result.defaultProfile })
        }),
        hookResult.companionPages
      );
      writeHookFailures(stderr, companionFailures);

      const openedAt = Date.now();
      const normalizedUrl = normalizeDivebellUrlForMatch(effectiveOpenedUrl);
      await operationLogStore.write({
        command: "open",
        url,
        openedUrl: effectiveOpenedUrl,
        normalizedUrl,
        bridgeUrl,
        bridgePort,
        sessionId,
        openedAt,
        exitCode: result.exitCode,
        activeExtensions: hookResult.activeExtensions,
        browserUi,
        browserReuseInitialBlankPage,
        browserRestoreDisabled,
        browserDefaultProfileDisabled,
        ...(browserArguments === undefined ? {} : { browserArguments }),
        ...(browserArgs.options.has("init-script")
          ? { browserInitScripts: [...(browserArgs.options.get("init-script") ?? [])] }
          : {}),
        ...(result.defaultProfile === undefined
          ? {}
          : { browserDefaultProfile: result.defaultProfile }),
        browserRestoreOptions: collectBrowserRestoreContextOptions(args),
        ...(networkConfiguration.fingerprint === undefined
          ? {}
          : { browserNetworkFingerprint: networkConfiguration.fingerprint }),
        ...(requestControl === undefined ? {} : { requestControl }),
        ...(headers === undefined ? {} : { headers })
      });
      committed = true;
      const output: OpenPageResult = {
        url,
        openedUrl: effectiveOpenedUrl,
        normalizedUrl,
        bridgeUrl,
        bridgePort,
        sessionId,
        openedAt,
        ...(result.injectedScriptPath === undefined
          ? {}
          : { injectedScriptPath: result.injectedScriptPath }),
        ...(requestControl === undefined
          ? {}
          : {
              requestControl: {
                pid: requestControl.pid,
                controlUrl: requestControl.controlUrl
              }
            })
      };
      createCommandOutput(stdout, args.command.join(" ")).ok(output, "Page opened.");
      if (previousOpenContext?.bridgeUrl !== bridgeUrl) {
        await stopOpenContextBridge(previousOpenContext?.bridgeUrl ?? null, bridgeStateDirectory);
      }
      return 0;
    } catch (error) {
      if (!committed) {
        await stopNetworkControl(startedRequestControl);
        if (previousOpenContext?.bridgeUrl !== bridgeUrl) {
          await stopOpenContextBridge(bridgeUrl, bridgeStateDirectory);
        }
      }
      throw error;
    }
  }

  const openContext = isBrowserPageCommand(command)
    ? await operationLogStore.read()
    : undefined;
  if (isBrowserPageCommand(command)) {
    applyOpenContextDefaultsOrThrow(args, openContext, "always");
  }
  const commandArgs = isBrowserPageCommand(command)
    ? applyBrowserRestoreContextDefaults(args, openContext)
    : args;
  const pageBrowserRunner = applyOpenContextBrowserMode(browserRunner, openContext);

  if (openContext?.requestControl !== undefined && isNetworkNavigationCommand(command)) {
    try {
      await attachNetworkControl(
        openContext.requestControl,
        await readBrowserCdpUrl(pageBrowserRunner)
      );
    } catch (error) {
      throw createError({
        code: "BROWSER_REQUEST_CONTROL_REATTACH_FAILED",
        kind: "browser",
        message: `Could not reattach Divebell request interception before navigation: ${errorMessage(error)}`,
        retryable: true,
        hint: "Run `divebell stop` and reopen the page with the same proxy and request-rule configuration."
      });
    }
  }

  if (command === "get-window") {
    const path = requireCommandArgument(commandArgs, 1, "window path");
    return await runBrowserAndPipe(pageBrowserRunner, ["eval", createGetWindowScript(path)], stdout, stderr);
  }

  if (command === "click") {
    return await runClickCommand(commandArgs, stdout, stderr, pageBrowserRunner);
  }

  if (command === "wait-eval") {
    const script = requireCommandArgument(commandArgs, 1, "eval script");
    const result = await waitForBrowserEval(pageBrowserRunner, script, getNumberOption(commandArgs, "timeout"));
    writeJson(stdout, result);
    return 0;
  }

  if (command === "network") {
    if (commandArgs.command.length > 1) {
      return await runBrowserAndPipe(
        pageBrowserRunner,
        createBrowserCommandArgs(commandArgs),
        stdout,
        stderr
      );
    }
    return await runNetworkCommand(commandArgs, stdout, stderr, pageBrowserRunner);
  }

  if (command === "console") {
    if (hasOption(commandArgs, "clear")) {
      return await runBrowserAndPipe(
        pageBrowserRunner,
        createBrowserCommandArgs(commandArgs),
        stdout,
        stderr
      );
    }
    return await runConsoleCommand(commandArgs, stdout, stderr, pageBrowserRunner);
  }

  if (command === "eval") {
    const file = getOptionValue(commandArgs, "file");
    if (file !== undefined) {
      return await runBrowserAndPipe(pageBrowserRunner, ["eval", await readFile(file, "utf8")], stdout, stderr);
    }
    if (hasOption(commandArgs, "stdin")) {
      return await runBrowserAndPipe(
        pageBrowserRunner,
        ["eval", "--stdin"],
        stdout,
        stderr,
        { input: await readInput(stdin) }
      );
    }
  }

  return await runBrowserAndPipe(
    pageBrowserRunner,
    createBrowserCommandArgs(commandArgs, {
      ...(openContext?.sessionId === null || openContext?.sessionId === undefined
        ? {}
        : { sessionId: openContext.sessionId })
    }),
    stdout,
    stderr
  );
}

function disablesDefaultChromeProfile(args: ParsedCliArgs): boolean {
  return hasOption(args, "no-default-profile")
    || commandDisablesDefaultChromeProfile(
      createBrowserCommandOptionsFromMap(args.options)
    );
}

function isNetworkNavigationCommand(command: string | undefined): boolean {
  return command === "goto" || command === "navigate" || command === "back" ||
    command === "forward" || command === "reload" || command === "pushstate";
}

function validateWebMcpOpenArgs(args: ParsedCliArgs): void {
  if (!hasOption(args, "no-webmcp") || getOptionValue(args, "no-webmcp") === "true") {
    return;
  }
  throw createError({
    code: "WEBMCP_OPTION_INVALID",
    kind: "validation",
    message: "--no-webmcp is a flag and does not accept a value.",
    retryable: false,
    hint: "Use `divebell open <url> --no-webmcp`."
  });
}

async function createWebMcpBrowserLaunch(
  args: ParsedCliArgs,
  env: NodeJS.ProcessEnv
): Promise<{ browserArguments?: string; warning?: string }> {
  if (hasOption(args, "no-webmcp")) {
    return {};
  }
  const launch = await resolveDivebellBrowserLaunchConfiguration(args, env);
  if (!launch.usesDivebellLaunchedChrome) {
    return { warning: WEBMCP_EXTERNAL_BROWSER_WARNING };
  }
  const cliArguments = (args.options.get("args") ?? [])
    .filter((value) => value !== "true");
  const configuredArguments = cliArguments.length === 0
    && env.AGENT_BROWSER_ARGS === undefined
    && typeof launch.config.args === "string"
    && launch.config.args.trim().length > 0
      ? [launch.config.args]
      : [];
  return {
    browserArguments: [
      ...configuredArguments,
      ...cliArguments,
      ...WEBMCP_BROWSER_ARGUMENTS
    ].join("\n")
  };
}

async function resolveDivebellBrowserLaunchConfiguration(
  args: ParsedCliArgs,
  env: NodeJS.ProcessEnv
): ReturnType<typeof resolveBrowserLaunchConfiguration> {
  return resolveBrowserLaunchConfiguration({
    command: createBrowserCommandOptionsFromMap(args.options),
    env,
    agentBrowserHome: env.AGENT_BROWSER_HOME?.trim()
      || join(resolveDivebellHomeDirectory(env), "agent-browser"),
    cwd: process.cwd()
  });
}

interface ResolvedNetworkConfiguration {
  rules?: BrowserRequestRules;
  proxyPacUrl?: string;
  fingerprint?: string;
  needsControl: boolean;
}

async function resolveNetworkConfiguration(options: {
  args: ParsedCliArgs;
  previousOpenContext: CliOperationLogEntry | undefined;
  env: NodeJS.ProcessEnv;
}): Promise<ResolvedNetworkConfiguration> {
  if (hasOption(options.args, "network-rules")) {
    throw createError({
      code: "BROWSER_OPEN_OPTION_INVALID",
      kind: "validation",
      message: "--network-rules is not a Divebell option.",
      retryable: false,
      hint: "Use --request-rules <path>."
    });
  }
  const hasNetworkConfigurationOption = hasOption(options.args, "request-rules") ||
    hasOption(options.args, "proxy-pac-url") || hasOption(options.args, "proxy");
  if (!hasNetworkConfigurationOption && options.previousOpenContext !== undefined) {
    return {
      ...(options.previousOpenContext.browserNetworkFingerprint === undefined
        ? {}
        : { fingerprint: options.previousOpenContext.browserNetworkFingerprint }),
      needsControl: options.previousOpenContext.requestControl !== undefined
    };
  }
  const rulesPath = getSingleValueOption(options.args, "request-rules");
  const fixedProxy = getSingleValueOption(options.args, "proxy");
  const proxyPacUrlValue = getSingleValueOption(options.args, "proxy-pac-url");
  if (fixedProxy !== undefined && proxyPacUrlValue !== undefined) {
    throw createError({
      code: "BROWSER_PROXY_CONFIGURATION_CONFLICT",
      kind: "validation",
      message: "--proxy and --proxy-pac-url cannot be used together.",
      retryable: false,
      hint: "Use --proxy for one fixed endpoint, or --proxy-pac-url for conditional PAC rules."
    });
  }
  const rules = rulesPath === undefined
    ? undefined
    : await readRequestRulesFile(rulesPath);
  let proxyPacUrl: string | undefined;
  if (proxyPacUrlValue !== undefined) {
    try {
      proxyPacUrl = validateBrowserProxyPacUrl(proxyPacUrlValue);
    } catch (error) {
      throw createError({
        code: "BROWSER_PROXY_PAC_URL_INVALID",
        kind: "validation",
        message: errorMessage(error),
        retryable: false
      });
    }
    const launch = await resolveDivebellBrowserLaunchConfiguration(options.args, options.env);
    if (!launch.usesDivebellLaunchedChrome) {
      throw createError({
        code: "BROWSER_PROXY_EXTERNAL_BROWSER_UNSUPPORTED",
        kind: "validation",
        message: "A PAC URL requires a Chromium instance launched by Divebell.",
        retryable: false,
        hint: "Remove --cdp, --auto-connect, or --provider and launch Chrome through divebell open."
      });
    }
  }
  const fingerprint = createBrowserNetworkFingerprint({
    ...(rules === undefined ? {} : { rules }),
    ...(fixedProxy === undefined ? {} : { fixedProxy }),
    ...(proxyPacUrl === undefined ? {} : { proxyPacUrl })
  });
  if (options.previousOpenContext !== undefined && options.previousOpenContext.browserNetworkFingerprint !== fingerprint) {
    throw createError({
      code: "BROWSER_PROXY_RESTART_REQUIRED",
      kind: "validation",
      message: "Browser proxy and request-rule configuration is scoped to the current browser daemon session and can only change at browser launch.",
      retryable: false,
      hint: "Run `divebell stop`, then run `divebell open` with the new --proxy, --proxy-pac-url, or --request-rules configuration."
    });
  }
  return {
    ...(rules === undefined ? {} : { rules }),
    ...(proxyPacUrl === undefined ? {} : { proxyPacUrl }),
    ...(fingerprint === undefined ? {} : { fingerprint }),
    needsControl: rules !== undefined
  };
}

async function readRequestRulesFile(path: string): Promise<BrowserRequestRules> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
  } catch (error) {
    throw createError({
      code: "BROWSER_REQUEST_RULES_READ_FAILED",
      kind: "validation",
      message: `Could not read --request-rules file: ${errorMessage(error)}`,
      retryable: false
    });
  }
  try {
    return validateBrowserRequestRules(parsed);
  } catch (error) {
    throw createError({
      code: "BROWSER_REQUEST_RULES_INVALID",
      kind: "validation",
      message: errorMessage(error),
      retryable: false
    });
  }
}

function getSingleValueOption(args: ParsedCliArgs, name: string): string | undefined {
  const values = getOptionValues(args, name);
  if (values.length === 0) return undefined;
  if (values.length !== 1 || values[0] === "true" || values[0]?.trim().length === 0) {
    throw createError({
      code: "BROWSER_OPEN_OPTION_INVALID",
      kind: "validation",
      message: `--${name} must be supplied once with a non-empty value.`,
      retryable: false
    });
  }
  return values[0];
}

async function readBrowserCdpUrl(browserRunner: BrowserRunner): Promise<string> {
  const result = await browserRunner.run(["get", "cdp-url", "--json"]);
  if (result.exitCode !== 0) throw new Error(result.stderr.trim() || result.stdout.trim() || "Could not read browser CDP URL.");
  let parsed: unknown;
  try { parsed = parseBrowserJsonOutput(result.stdout); } catch { throw new Error("Browser returned invalid CDP URL JSON."); }
  const cdpUrl = parsed !== null && typeof parsed === "object"
    ? (parsed as { cdpUrl?: unknown }).cdpUrl
    : undefined;
  if (typeof cdpUrl !== "string" || !/^wss?:\/\//i.test(cdpUrl)) {
    throw new Error("Browser did not return a ws(s) CDP URL.");
  }
  return cdpUrl;
}

function appendBrowserArguments(current: string | undefined, argument: string | undefined): string | undefined {
  if (argument === undefined) return current;
  return current === undefined || current.length === 0 ? argument : `${current}\n${argument}`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function readInput(stdin: AsyncIterable<string | Uint8Array>): Promise<string> {
  let input = "";
  for await (const chunk of stdin) {
    input += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  }
  return input;
}

export async function runExtensionCloseHooks(options: {
  args: ParsedCliArgs;
  stderr: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeStateDirectory: string | undefined;
  operationLogStore: CliOperationLogStore;
  extensions: readonly DivebellExtensionDefinition[];
  openHookPlan: ExtensionHookPlan;
}): Promise<void> {
  const openContext = await options.operationLogStore.read();
  if (openContext === undefined) return;
  const closeArgs = applyOpenContextDefaultsOrThrow(options.args, openContext, "always");
  const failures = await runCloseHooks(options.extensions, openContext.activeExtensions, {
    args: closeArgs,
    page: createExtensionPageContext(openContext),
    divebell: createDivebellExtensionApi({
      args: closeArgs,
      fetcher: options.fetcher,
      browserRunner: options.browserRunner,
      bridgeStarter: options.bridgeStarter,
      bridgeStateStore: createBridgeStateStore(closeArgs, options.bridgeStateDirectory),
      openContext
    })
  }, options.openHookPlan);
  writeHookFailures(options.stderr, failures);
}

async function openCompanionPages(
  browserRunner: BrowserRunner,
  pages: readonly ExtensionOpenHookCompanionPage[]
): Promise<ExtensionHookFailure[]> {
  if (pages.length === 0) return [];

  const activeTabId = await readActiveBrowserTabId(browserRunner);
  const failures: ExtensionHookFailure[] = [];
  try {
    for (const page of pages) {
      const args = ["tab", "new"];
      if (page.label !== undefined) {
        args.push("--label", page.label);
      }
      args.push(page.url);
      const opened = await browserRunner.run(args);
      if (opened.exitCode !== 0) {
        failures.push({
          extension: page.extension,
          hook: "open",
          message: opened.stderr.trim() || opened.stdout.trim() || "Could not open companion page."
        });
        continue;
      }
      if (page.waitFor === undefined) continue;
      const waited = await waitForBrowserEval(
        browserRunner,
        page.waitFor.script,
        page.waitFor.timeout
      );
      if (!waited.success) {
        failures.push({
          extension: page.extension,
          hook: "open",
          message: waited.reason ?? "Companion page did not become ready."
        });
      }
    }
  } finally {
    if (activeTabId !== undefined) {
      const restored = await browserRunner.run(["tab", activeTabId]);
      if (restored.exitCode !== 0) {
        failures.push({
          extension: pages.at(-1)?.extension ?? "unknown",
          hook: "open",
          message: restored.stderr.trim() || restored.stdout.trim() || "Could not return to the opened page."
        });
      }
    }
  }
  return failures;
}

async function readActiveBrowserTabId(browserRunner: BrowserRunner): Promise<string | undefined> {
  const result = await browserRunner.run(["tab", "--json"]);
  if (result.exitCode !== 0) return undefined;
  try {
    const parsed = parseBrowserJsonOutput(result.stdout) as {
      tabs?: Array<{ tabId?: unknown; active?: unknown }>;
    };
    const tabId = parsed.tabs?.find((tab) => tab.active === true)?.tabId;
    return typeof tabId === "string" ? tabId : undefined;
  } catch {
    return undefined;
  }
}

function inheritOpenInitScripts(
  args: ParsedCliArgs,
  previousOpenContext: CliOperationLogEntry | undefined
): ParsedCliArgs {
  if (args.options.has("init-script") || previousOpenContext?.browserInitScripts === undefined) {
    return args;
  }
  const options = new Map(args.options);
  options.set("init-script", [...previousOpenContext.browserInitScripts]);
  return { command: args.command, options };
}

async function prepareOpenBridge(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeStarter: BridgeStarter,
  bridgeStateDirectory: string | undefined,
  previousBridgeUrl: string | null | undefined
): Promise<{ bridgeUrl: string; port: number | null } | null> {
  if (hasOption(args, "no-bridge")) return null;

  if (hasOption(args, "bridge")) {
    const bridgeUrl = createBridgeUrl(args);
    await ensureBridge({
      fetcher,
      bridgeUrl,
      starter: bridgeStarter,
      stateStore: createFileBridgeStateStore(bridgeUrl, bridgeStateDirectory)
    });
    return {
      bridgeUrl,
      port: getExplicitBridgePort(bridgeUrl)
    };
  }

  const requestedPort = getNumberOption(args, "port");
  const reusableBridgeUrl = previousBridgeUrl !== null && previousBridgeUrl !== undefined && (
    requestedPort === undefined || getExplicitBridgePort(previousBridgeUrl) === requestedPort
  )
    ? previousBridgeUrl
    : undefined;
  if (reusableBridgeUrl !== undefined) {
    await ensureBridge({
      fetcher,
      bridgeUrl: reusableBridgeUrl,
      starter: bridgeStarter,
      stateStore: createFileBridgeStateStore(reusableBridgeUrl, bridgeStateDirectory)
    });
    return {
      bridgeUrl: reusableBridgeUrl,
      port: getExplicitBridgePort(reusableBridgeUrl)
    };
  }

  const result = await startDedicatedBridge({
    fetcher,
    starter: bridgeStarter,
    ...(bridgeStateDirectory === undefined ? {} : { stateDirectory: bridgeStateDirectory }),
    ...createOptionalNumberProperty("port", requestedPort)
  });
  return {
    bridgeUrl: result.bridgeUrl,
    port: result.port
  };
}

async function stopOpenContextBridge(
  bridgeUrl: string | null,
  bridgeStateDirectory: string | undefined
): Promise<void> {
  if (bridgeUrl === null) return;
  await stopManagedBridge({
    bridgeUrl,
    stateStore: createFileBridgeStateStore(bridgeUrl, bridgeStateDirectory)
  });
}

function getExplicitBridgePort(bridgeUrl: string): number | null {
  try {
    const url = new URL(bridgeUrl);
    if (url.port.length > 0) return Number(url.port);
    return url.protocol === "https:" ? 443 : url.protocol === "http:" ? 80 : null;
  } catch {
    return getBridgePort(bridgeUrl) ?? null;
  }
}

async function runClickCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const target = requireCommandArgument(args, 1, "ref, selector, or text");
  if (!shouldPreferInteractiveTextClick(target)) {
    return await runBrowserAndPipe(browserRunner, createBrowserCommandArgs(args), stdout, stderr);
  }

  const result = await browserRunner.run(["eval", createInteractiveTextClickScript(target)]);
  if (result.exitCode === 0) {
    stdout.write("clicked\n");
    return 0;
  }

  if (result.stdout.length > 0) {
    stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr.length > 0) {
    stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
}


export async function openBrowserPage(
  browserRunner: BrowserRunner,
  args: ParsedCliArgs,
  openedUrl: string,
  bridgeUrl: string | null,
  hookScripts: readonly ExtensionOpenHookScript[],
  options: BrowserRunOptions,
  beforeNavigate?: () => Promise<void>
): Promise<BrowserRunResult & { injectedScriptPath?: string }> {
  const cookies = getOptionValue(args, "cookies");
  if (beforeNavigate !== undefined) {
    const scriptPath = bridgeUrl === null && hookScripts.length === 0
      ? undefined
      : await ensureBrowserInitScript(bridgeUrl, hookScripts);
    const launch = await browserRunner.run(
      createBrowserLaunchArgs(
        args,
        scriptPath === undefined ? ["open"] : ["open", "--init-script", scriptPath],
        options.browserArguments !== undefined
      ),
      options
    );
    if (launch.exitCode !== 0) return scriptPath === undefined ? launch : withInjectedScriptPath(launch, scriptPath);
    if (cookies !== undefined) {
      const applied = await browserRunner.run(["cookies", "set", "--curl", cookies]);
      if (applied.exitCode !== 0) return scriptPath === undefined ? applied : withInjectedScriptPath(applied, scriptPath);
    }
    try {
      await beforeNavigate();
    } catch (error) {
      const failed = { exitCode: 1, stdout: "", stderr: errorMessage(error) };
      return scriptPath === undefined ? failed : withInjectedScriptPath(failed, scriptPath);
    }
    const navigated = await browserRunner.run(createBrowserNavigationArgs(args, "goto", openedUrl));
    return scriptPath === undefined ? navigated : withInjectedScriptPath(navigated, scriptPath);
  }
  if (cookies === undefined && bridgeUrl === null && hookScripts.length === 0) {
    return await browserRunner.run(
      createBrowserLaunchArgs(
        args,
        createBrowserNavigationArgs(args, "open", openedUrl),
        options.browserArguments !== undefined
      ),
      options
    );
  }

  if (bridgeUrl !== null || hookScripts.length > 0) {
    const scriptPath = await ensureBrowserInitScript(bridgeUrl, hookScripts);
    if (cookies === undefined) {
      return withInjectedScriptPath(
        await browserRunner.run(
          createBrowserLaunchArgs(
            args,
            createBrowserNavigationArgs(args, "open", openedUrl, ["--init-script", scriptPath]),
            options.browserArguments !== undefined
          ),
          options
        ),
        scriptPath
      );
    }

    const launch = await browserRunner.run(
      createBrowserLaunchArgs(
        args,
        ["open", "--init-script", scriptPath],
        options.browserArguments !== undefined
      ),
      options
    );
    if (launch.exitCode !== 0) return withInjectedScriptPath(launch, scriptPath);
    const applyCookies = await browserRunner.run(["cookies", "set", "--curl", cookies]);
    if (applyCookies.exitCode !== 0) {
      return withInjectedScriptPath(applyCookies, scriptPath);
    }
    return withInjectedScriptPath(
      await browserRunner.run(createBrowserNavigationArgs(args, "goto", openedUrl)),
      scriptPath
    );
  }

  if (cookies === undefined) {
    return await browserRunner.run(["open", openedUrl], options);
  }
  const launch = await browserRunner.run(
    createBrowserLaunchArgs(args, ["open"], options.browserArguments !== undefined),
    options
  );
  if (launch.exitCode !== 0) return launch;
  const applyCookies = await browserRunner.run(["cookies", "set", "--curl", cookies]);
  if (applyCookies.exitCode !== 0) return applyCookies;
  return await browserRunner.run(createBrowserNavigationArgs(args, "goto", openedUrl));
}

function createBrowserLaunchArgs(
  args: ParsedCliArgs,
  command: string[],
  browserArgumentsInjected: boolean
): string[] {
  const launchArgs: string[] = [];
  for (const name of [
    "profile",
    "state",
    "restore",
    "restore-save",
    "restore-initial-save",
    "restore-periodic-save",
    "restore-close-save",
    "restore-periodic-save-interval-ms",
    "restore-check-url",
    "restore-check-text",
    "restore-check-fn",
    "session-name",
    "auto-connect",
    "namespace",
    "executable-path",
    "extension",
    "init-script",
    "enable",
    "args",
    "user-agent",
    "proxy",
    "proxy-bypass",
    "ignore-https-errors",
    "allow-file-access",
    "hide-scrollbars",
    "provider",
    "device",
    "webgpu",
    "cdp",
    "color-scheme",
    "download-path",
    "screenshot-dir",
    "screenshot-quality",
    "screenshot-format",
    "content-boundaries",
    "max-output",
    "allowed-domains",
    "action-policy",
    "confirm-actions",
    "confirm-interactive",
    "engine",
    "idle-timeout",
    "no-auto-dialog",
    "config",
    "debug"
  ]) {
    if (name === "args" && browserArgumentsInjected) continue;
    appendBrowserOptions(launchArgs, args, name);
  }
  return [...launchArgs, ...command];
}

function createBrowserNavigationArgs(
  args: ParsedCliArgs,
  command: "open" | "goto",
  url: string,
  additionalArgs: readonly string[] = []
): string[] {
  const navigationArgs = [command, url, ...additionalArgs];
  appendBrowserOption(navigationArgs, args, "headers");
  appendBrowserOption(navigationArgs, args, "timeout");
  return navigationArgs;
}

function appendBrowserOption(browserArgs: string[], args: ParsedCliArgs, name: string): void {
  const value = getOptionValue(args, name);
  if (value !== undefined && value !== "true") {
    browserArgs.push(`--${name}`, value);
  }
}

function appendBrowserOptions(browserArgs: string[], args: ParsedCliArgs, name: string): void {
  for (const value of args.options.get(name) ?? []) {
    browserArgs.push(`--${name}`);
    if (value !== "true") browserArgs.push(value);
  }
}

function withInjectedScriptPath(
  result: BrowserRunResult,
  injectedScriptPath: string
): BrowserRunResult & { injectedScriptPath: string } {
  return {
    ...result,
    injectedScriptPath
  };
}

async function ensureBrowserInitScript(
  bridgeUrl: string | null,
  hookScripts: readonly ExtensionOpenHookScript[]
): Promise<string> {
  const directory = join(tmpdir(), "divebell-bridge-init");
  const script = [
    ...hookScripts.map(createIsolatedHookScript),
    ...(bridgeUrl === null ? [] : [createBridgeInitScript(bridgeUrl)])
  ].join("\n;\n");
  const key = createHash("sha256").update(script).digest("hex").slice(0, 16);
  const scriptPath = join(directory, `bridge-${key}.js`);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  await writeFile(scriptPath, script, { encoding: "utf8", mode: 0o600 });
  return scriptPath;
}

function createIsolatedHookScript(hookScript: ExtensionOpenHookScript): string {
  const message = `Divebell Extension "${hookScript.extension}" open hook script failed.`;
  return `try {
${hookScript.script}
} catch (error) {
  globalThis.console?.error?.(${JSON.stringify(message)}, error);
}`;
}

function writeHookFailures(
  stderr: { write(chunk: string): void },
  failures: readonly ExtensionHookFailure[]
): void {
  for (const failure of failures) {
    stderr.write(`Divebell extension ${failure.extension} ${failure.hook} hook failed: ${failure.message}\n`);
  }
}
