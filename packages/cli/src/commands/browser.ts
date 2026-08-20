import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getNumberOption, getOptionValue, type ParsedCliArgs } from "../utils/args.js";
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
import { normalizeDivebellUrlForMatch, type CliOperationLogStore } from "../utils/operation-log.js";
import { bindBrowserRunOptions, createGetWindowScript, createInteractiveTextClickScript, parseBrowserJsonOutput, type BrowserRunOptions, type BrowserRunResult, type BrowserRunner } from "../features/browser/runner.js";
import {
  createOptionalNumberProperty,
  hasOption,
  parseHeadersOption,
  requireCommandArgument,
  writeJson
} from "../utils/command.js";
import { withDivebellSession } from "../utils/url.js";
import { applyBrowserRestoreContextDefaults, applyOpenContextBrowserMode, applyOpenContextDefaultsOrThrow, collectBrowserRestoreContextOptions, createExtensionPageContext } from "../open-context.js";
import { createBrowserCommandArgs, getOpenCommandSessionId, shouldPreferInteractiveTextClick } from "../features/browser/command-args.js";
import { runBrowserAndPipe } from "../features/browser/io.js";
import { runConsoleCommand } from "../features/browser/console.js";
import { runNetworkCommand } from "../features/browser/network.js";
import { waitForBrowserEval } from "../features/browser/execution.js";
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
import {
  createBrowserTempProfile,
  removeBrowserTempProfile,
  type BrowserTempProfile
} from "../features/browser/temp-profile.js";

export interface OpenPageResult {
  url: string;
  openedUrl: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  bridgePort: number | null;
  sessionId: string | null;
  openedAt: number;
  injectedScriptPath?: string;
  tempProfile?: {
    exportCommand: "divebell profile export";
  };
}

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
  env: NodeJS.ProcessEnv = process.env
): Promise<number> {
  const command = args.command[0];
  if (command === "open") {
    const url = requireCommandArgument(args, 1, "URL");
    const previousOpenContext = await operationLogStore.read();
    if (previousOpenContext?.browserTempProfile !== undefined) {
      throw createError({
        code: "TEMP_PROFILE_ACTIVE",
        kind: "validation",
        message: "A temporary Profile is already open in this directory.",
        retryable: false,
        hint: "Run `divebell profile export [path]` to keep it, or `divebell stop` to discard it, before opening another page."
      });
    }
    validateTempProfileOpenArgs(args);
    const tempProfile = hasOption(args, "temp-profile")
      ? await createBrowserTempProfile(env)
      : undefined;
    const browserArgs = tempProfile === undefined
      ? args
      : withBrowserProfile(args, tempProfile.path);
    const sessionId = getOpenCommandSessionId(args);
    const browserRestoreDisabled = tempProfile !== undefined
      || hasOption(args, "profile")
      || hasOption(args, "state")
      || hasOption(args, "allowed-domains");
    const browserDefaultProfileDisabled = disablesDefaultChromeProfile(args);
    const browserUi = hasOption(args, "ui");
    const openedUrl = withDivebellSession(url, sessionId);
    const headers = parseHeadersOption(args);
    let bridgeUrl: string | null = null;
    let committed = false;
    try {
      const bridge = await prepareOpenBridge(args, fetcher, bridgeStarter, bridgeStateDirectory);
      bridgeUrl = bridge?.bridgeUrl ?? null;
      const bridgePort = bridge?.port ?? null;
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
      const tempProfileRunOptions = createTempProfileRunOptions(tempProfile);
      const openBrowserRunner = bindBrowserRunOptions(browserRunner, {
        ...(browserRestoreDisabled ? { disableRestore: true } : {}),
        ...(browserDefaultProfileDisabled ? { disableDefaultProfile: true } : {}),
        ...tempProfileRunOptions
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
          ...tempProfileRunOptions
        }
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
            : { defaultProfile: result.defaultProfile }),
          ...tempProfileRunOptions
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
        ...(result.defaultProfile === undefined || tempProfile !== undefined
          ? {}
          : { browserDefaultProfile: result.defaultProfile }),
        ...(tempProfile === undefined ? {} : { browserTempProfile: tempProfile }),
        browserRestoreOptions: collectBrowserRestoreContextOptions(args),
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
        ...(tempProfile === undefined
          ? {}
          : { tempProfile: { exportCommand: "divebell profile export" } })
      };
      createCommandOutput(stdout, args.command.join(" ")).ok(output, "Page opened.");
      if (previousOpenContext?.bridgeUrl !== bridgeUrl) {
        await stopOpenContextBridge(previousOpenContext?.bridgeUrl ?? null, bridgeStateDirectory);
      }
      return 0;
    } catch (error) {
      if (!committed) {
        if (tempProfile !== undefined) {
          await bindBrowserRunOptions(browserRunner, createTempProfileRunOptions(tempProfile))
            .run(["close"])
            .catch(() => undefined);
        }
        await removeBrowserTempProfile(tempProfile?.path, env);
        await stopOpenContextBridge(bridgeUrl, bridgeStateDirectory);
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
  if ([
    "no-default-profile",
    "temp-profile",
    "profile",
    "state",
    "restore",
    "allowed-domains",
    "cdp",
    "auto-connect",
    "provider",
    "executable-path",
    "args"
  ].some((name) => hasOption(args, name))) {
    return true;
  }
  const engine = getOptionValue(args, "engine")?.trim().toLowerCase();
  return engine !== undefined && engine !== "" && engine !== "chrome";
}

function validateTempProfileOpenArgs(args: ParsedCliArgs): void {
  if (!hasOption(args, "temp-profile")) return;
  if (getOptionValue(args, "temp-profile") !== "true") {
    throw createError({
      code: "TEMP_PROFILE_OPTION_INVALID",
      kind: "validation",
      message: "--temp-profile is a flag and does not accept a value.",
      retryable: false,
      hint: "Use `divebell open <url> --ui --temp-profile`."
    });
  }
  const conflicts = [
    "profile",
    "state",
    "restore",
    "allowed-domains",
    "cdp",
    "auto-connect",
    "provider",
    "args",
    "cookies"
  ].filter((name) => hasOption(args, name));
  const engine = getOptionValue(args, "engine")?.trim().toLowerCase();
  if (engine !== undefined && engine !== "" && engine !== "chrome") {
    conflicts.push("engine");
  }
  if (conflicts.length === 0) return;
  throw createError({
    code: "TEMP_PROFILE_CONTEXT_CONFLICT",
    kind: "validation",
    message: `--temp-profile cannot be combined with: ${conflicts.map((name) => `--${name}`).join(", ")}.`,
    retryable: false,
    hint: "Remove the other browser context options so Divebell can start a clean local Chrome Profile."
  });
}

function withBrowserProfile(args: ParsedCliArgs, path: string): ParsedCliArgs {
  const options = new Map(
    [...args.options].map(([name, values]) => [name, [...values]])
  );
  options.set("profile", [path]);
  return { command: args.command, options };
}

function createTempProfileRunOptions(
  profile: BrowserTempProfile | undefined
): BrowserRunOptions {
  return profile === undefined
    ? {}
    : {
        session: profile.session,
        ignoreConfiguredProfile: true,
        ignoreConfiguredState: true
      };
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

async function prepareOpenBridge(
  args: ParsedCliArgs,
  fetcher: Fetcher,
  bridgeStarter: BridgeStarter,
  bridgeStateDirectory: string | undefined
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

  const result = await startDedicatedBridge({
    fetcher,
    starter: bridgeStarter,
    ...(bridgeStateDirectory === undefined ? {} : { stateDirectory: bridgeStateDirectory }),
    ...createOptionalNumberProperty("port", getNumberOption(args, "port"))
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
  options: BrowserRunOptions
): Promise<BrowserRunResult & { injectedScriptPath?: string }> {
  const cookies = getOptionValue(args, "cookies");
  if (cookies === undefined && bridgeUrl === null && hookScripts.length === 0) {
    return await browserRunner.run(
      createBrowserLaunchArgs(args, createBrowserNavigationArgs(args, "open", openedUrl)),
      options
    );
  }

  if (bridgeUrl !== null || hookScripts.length > 0) {
    const scriptPath = await ensureBrowserInitScript(bridgeUrl, hookScripts);
    if (cookies === undefined) {
      return withInjectedScriptPath(
        await browserRunner.run(
          createBrowserLaunchArgs(args, createBrowserNavigationArgs(args, "open", openedUrl, ["--init-script", scriptPath])),
          options
        ),
        scriptPath
      );
    }

    const launch = await browserRunner.run(createBrowserLaunchArgs(args, ["open", "--init-script", scriptPath]), options);
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
  const launch = await browserRunner.run(createBrowserLaunchArgs(args, ["open"]), options);
  if (launch.exitCode !== 0) return launch;
  const applyCookies = await browserRunner.run(["cookies", "set", "--curl", cookies]);
  if (applyCookies.exitCode !== 0) return applyCookies;
  return await browserRunner.run(createBrowserNavigationArgs(args, "goto", openedUrl));
}

function createBrowserLaunchArgs(args: ParsedCliArgs, command: string[]): string[] {
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
