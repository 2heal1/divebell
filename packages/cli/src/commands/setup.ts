import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import {
  createFileBridgeStateStore,
  startDedicatedBridge,
  stopManagedBridge,
  type BridgeProcessController,
  type BridgeStarter,
  type StartDedicatedBridgeResult
} from "../features/bridge/process.js";
import type {
  BrowserRunOptions,
  BrowserRunResult,
  BrowserRunner
} from "../features/browser/runner.js";
import {
  CHROME_REMOTE_DEBUGGING_URL,
  type RemoteDebuggingPageOpener
} from "../features/browser/remote-debugging.js";
import { createBridgeInitScript } from "../features/bridge/inject.js";
import type { Fetcher } from "../features/runtime/client.js";
import type { ParsedCliArgs } from "../utils/args.js";
import {
  createCommandOutput,
  createError,
  type CommandError
} from "../utils/output.js";
import { openBrowserPage } from "./browser.js";

const SETUP_URL = "data:text/html,%3Ctitle%3EDivebell%20Setup%3C/title%3E";
const EXISTING_CHROME_CONNECT_ATTEMPTS = 30;
const EXISTING_CHROME_CONNECT_INTERVAL_MS = 2000;
const CHECK_BROWSER_IDLE_TIMEOUT_MS = 5000;
export const SUPPORTED_NODE_RANGE = ">=20.19.0 <25";
const SETUP_CONTROL_SCRIPT = `(() => {
  const manager = globalThis.__DIVEBELL_BRIDGE_MANAGER__;
  if (manager === null || typeof manager !== "object") {
    throw new Error("Divebell Bridge initialization was not installed in the page.");
  }
  return {
    controlled: true,
    bridgeInjected: true,
    userAgent: typeof navigator === "object" ? navigator.userAgent : null
  };
})()`;

type CheckStatus = "passed" | "failed" | "skipped";

interface CheckEntry {
  id: "node" | "bridge" | "browser.open" | "browser.control";
  status: CheckStatus;
  message?: string;
}

interface BrowserProbeSuccess {
  ok: true;
  browser: BrowserIdentity;
}

interface BrowserProbeFailure {
  ok: false;
  stage: "browser.open" | "browser.control";
  reason: string;
}

type BrowserProbeResult = BrowserProbeSuccess | BrowserProbeFailure;

interface BrowserIdentity {
  name: string | null;
  version: string | null;
}

type BrowserSource =
  | { kind: "managed" }
  | { kind: "cdp"; port?: string }
  | { kind: "auto-connect" }
  | { kind: "provider"; name: string }
  | { kind: "engine"; name: string }
  | { kind: "executable" };

type FixMethod =
  | "install-managed-browser"
  | "connect-existing-chrome";

export async function runSetupCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  remoteDebuggingPageOpener: RemoteDebuggingPageOpener;
  bridgeStarter: BridgeStarter;
  bridgeProcessController?: BridgeProcessController;
  env: NodeJS.ProcessEnv;
  nodeVersion?: string;
  wait?: (milliseconds: number) => Promise<void>;
}): Promise<number> {
  const output = createCommandOutput(options.stdout, "setup");
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const browserSource = detectBrowserSource(options.env);
  let resolvedBrowserSource = browserSource;
  if (!isSupportedNodeVersion(nodeVersion)) {
    const checks: CheckEntry[] = [
      {
        id: "node",
        status: "failed",
        message: `Node.js ${nodeVersion} does not satisfy ${SUPPORTED_NODE_RANGE}.`
      },
      {
        id: "bridge",
        status: "skipped"
      },
      {
        id: "browser.open",
        status: "skipped"
      },
      {
        id: "browser.control",
        status: "skipped"
      }
    ];
    output.error(createError({
      code: "DIVEBELL_SETUP_NODE_UNSUPPORTED",
      kind: "validation",
      message: `Divebell requires Node.js ${SUPPORTED_NODE_RANGE}, but this command is running on Node.js ${nodeVersion}.`,
      retryable: false,
      hint: `Install and select a Node.js version that satisfies ${SUPPORTED_NODE_RANGE}, then run \`divebell setup\` again.`,
      data: {
        ready: false,
        fixed: false,
        environment: createEnvironmentData(
          nodeVersion,
          false,
          browserSource,
          emptyBrowserIdentity()
        ),
        checks
      }
    }));
    return 1;
  }

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "divebell-setup-"));
  const bridgeStateDirectory = join(temporaryDirectory, "bridge");
  const browserOptions: BrowserRunOptions = {
    session: `ds-${randomUUID().replaceAll("-", "")}`,
    disableRestore: true,
    headless: true,
    idleTimeoutMs: CHECK_BROWSER_IDLE_TIMEOUT_MS
  };
  let bridge: StartDedicatedBridgeResult | undefined;
  let browserTouched = false;
  let fixed = false;
  let fixAttempted = false;
  const fixMethods: FixMethod[] = [];
  let remoteDebuggingSettingsOpened = false;
  let initialFailure: string | undefined;
  const nodeCheck: CheckEntry = {
    id: "node",
    status: "passed"
  };
  let checks: CheckEntry[] = [nodeCheck];
  let browserIdentity = emptyBrowserIdentity();
  let failure: CommandError | undefined;
  let cleanupFailure: string | undefined;

  try {
    try {
      bridge = await startDedicatedBridge({
        fetcher: options.fetcher,
        starter: options.bridgeStarter,
        stateDirectory: bridgeStateDirectory
      });
      checks = [
        nodeCheck,
        {
          id: "bridge",
          status: "passed"
        }
      ];
    } catch (error) {
      const reason = errorMessage(error);
      checks = [
        nodeCheck,
        {
          id: "bridge",
          status: "failed",
          message: reason
        },
        {
          id: "browser.open",
          status: "skipped"
        },
        {
          id: "browser.control",
          status: "skipped"
        }
      ];
      failure = createError({
        code: "DIVEBELL_SETUP_BRIDGE_FAILED",
        kind: "internal",
        message: `Divebell could not start its local Bridge: ${reason}`,
        retryable: true,
        hint: "Check whether this machine allows local processes to listen on an available port, then run `divebell setup` again."
      });
    }

    if (failure === undefined && bridge !== undefined) {
      const usesExistingBrowser = isExistingBrowserSource(browserSource);
      browserTouched = !usesExistingBrowser;
      let probe = usesExistingBrowser
        ? await runExistingBrowserProbe(
          options.browserRunner,
          bridge.bridgeUrl,
          createExistingBrowserOptions(
            browserOptions,
            browserSource.kind === "auto-connect"
          )
        )
        : await runBrowserProbe(
          options.browserRunner,
          options.args,
          bridge.bridgeUrl,
          browserOptions
        );
      checks = [
        ...checks.slice(0, 2),
        ...createBrowserChecks(probe)
      ];
      if (probe.ok) {
        browserIdentity = probe.browser;
      }

      if (
        !probe.ok
        && probe.stage === "browser.open"
        && (
          browserSource.kind === "managed"
          || browserSource.kind === "auto-connect"
        )
      ) {
        fixAttempted = true;
        initialFailure = probe.reason;

        if (browserTouched) {
          await closeCheckBrowser(options.browserRunner, browserOptions);
          browserTouched = false;
        }

        if (
          browserSource.kind === "managed"
          && isMissingBrowserFailure(probe.reason)
        ) {
          fixMethods.push("install-managed-browser");
          const install = await installBrowserRequirements(
            options.browserRunner,
            browserOptions
          );
          if (install.exitCode !== 0) {
            const reason = browserResultMessage(
              install,
              "Browser requirements could not be installed."
            );
            failure = createInstallFailure(reason);
          } else {
            browserTouched = true;
            probe = await runBrowserProbe(
              options.browserRunner,
              options.args,
              bridge.bridgeUrl,
              browserOptions
            );
            checks = [
              ...checks.slice(0, 2),
              ...createBrowserChecks(probe)
            ];
            if (probe.ok) {
              fixed = true;
              browserIdentity = probe.browser;
            }
          }
        }

        if (
          failure === undefined
          && !probe.ok
          && probe.stage === "browser.open"
        ) {
          fixMethods.push("connect-existing-chrome");
          if (browserTouched) {
            await closeCheckBrowser(options.browserRunner, browserOptions);
            browserTouched = false;
          }
          const existingChrome = await connectExistingChrome({
            browserRunner: options.browserRunner,
            bridgeUrl: bridge.bridgeUrl,
            browserOptions,
            remoteDebuggingPageOpener: options.remoteDebuggingPageOpener,
            wait: options.wait ?? defaultWait
          });
          probe = existingChrome.probe;
          remoteDebuggingSettingsOpened = existingChrome.settingsOpened;
          resolvedBrowserSource = {
            kind: "auto-connect"
          };
          checks = [
            ...checks.slice(0, 2),
            ...createBrowserChecks(probe)
          ];
          if (probe.ok) {
            fixed = true;
            browserIdentity = probe.browser;
          } else {
            failure = createExistingChromeFailure(
              probe,
              existingChrome.settingsOpened,
              existingChrome.openFailure
            );
          }
        }
      }

      if (failure === undefined && !probe.ok) {
        failure = createProbeFailure(
          probe,
          browserSource,
          fixed
        );
      }
    }
  } finally {
    if (browserTouched) {
      const close = await closeCheckBrowser(options.browserRunner, browserOptions);
      if (close.exitCode !== 0) {
        cleanupFailure = browserResultMessage(close, "The temporary browser session could not be closed.");
      }
    }

    if (bridge !== undefined) {
      try {
        const stopped = await stopManagedBridge({
          bridgeUrl: bridge.bridgeUrl,
          stateStore: createFileBridgeStateStore(
            bridge.bridgeUrl,
            bridgeStateDirectory
          ),
          ...(options.bridgeProcessController === undefined
            ? {}
            : { processController: options.bridgeProcessController })
        });
        if (bridge.pid !== undefined && !stopped.stopped && cleanupFailure === undefined) {
          cleanupFailure = stopped.reason ?? "The temporary Bridge could not be stopped.";
        }
      } catch (error) {
        cleanupFailure ??= errorMessage(error);
      }
    }

    try {
      await rm(temporaryDirectory, {
        recursive: true,
        force: true
      });
    } catch (error) {
      cleanupFailure ??= errorMessage(error);
    }
  }

  if (failure === undefined && cleanupFailure !== undefined) {
    failure = createError({
      code: "DIVEBELL_SETUP_CLEANUP_FAILED",
      kind: "internal",
      message: `Divebell opened and controlled the browser, but could not clean up the temporary check: ${cleanupFailure}`,
      retryable: true,
      hint: "Run `divebell setup` again after confirming no temporary Divebell process is still running."
    });
  }

  const data = {
    ready: failure === undefined,
    fixed,
    environment: createEnvironmentData(
      nodeVersion,
      true,
      resolvedBrowserSource,
      browserIdentity
    ),
    checks,
    ...(fixAttempted ? {
      fix: {
        attempted: true,
        status: fixed ? "applied" : "failed",
        methods: fixMethods,
        ...(remoteDebuggingSettingsOpened
          ? { openedRemoteDebuggingSettings: true }
          : {}),
        ...(initialFailure === undefined ? {} : { initialFailure })
      }
    } : {}),
    ...(cleanupFailure === undefined ? {} : {
      cleanup: {
        status: "failed",
        message: cleanupFailure
      }
    })
  };

  if (failure !== undefined) {
    output.error(createError({
      code: failure.code,
      kind: failure.kind,
      message: failure.message,
      retryable: failure.retryable,
      ...(failure.hint === undefined ? {} : { hint: failure.hint }),
      ...(failure.details === undefined ? {} : { details: failure.details }),
      data
    }));
    return 1;
  }

  output.ok(
    data,
    createSuccessMessage(fixed, fixMethods)
  );
  return 0;
}

export function createBrowserInstallArgs(
  platform: NodeJS.Platform = process.platform
): string[] {
  return platform === "linux"
    ? ["install", "--with-deps"]
    : ["install"];
}

async function runBrowserProbe(
  browserRunner: BrowserRunner,
  args: ParsedCliArgs,
  bridgeUrl: string,
  browserOptions: BrowserRunOptions
): Promise<BrowserProbeResult> {
  let opened: BrowserRunResult;
  try {
    opened = await openBrowserPage(
      browserRunner,
      args,
      SETUP_URL,
      bridgeUrl,
      [],
      browserOptions
    );
  } catch (error) {
    return {
      ok: false,
      stage: "browser.open",
      reason: errorMessage(error)
    };
  }

  if (opened.exitCode !== 0) {
    return {
      ok: false,
      stage: "browser.open",
      reason: browserResultMessage(opened, "The browser exited before it was ready.")
    };
  }

  let controlled: BrowserRunResult;
  try {
    controlled = await browserRunner.run(
      ["eval", SETUP_CONTROL_SCRIPT],
      browserOptions
    );
  } catch (error) {
    return {
      ok: false,
      stage: "browser.control",
      reason: errorMessage(error)
    };
  }

  if (controlled.exitCode !== 0) {
    return {
      ok: false,
      stage: "browser.control",
      reason: browserResultMessage(controlled, "The opened browser could not be controlled.")
    };
  }

  return {
    ok: true,
    browser: readBrowserIdentity(controlled.stdout)
  };
}

async function runExistingBrowserProbe(
  browserRunner: BrowserRunner,
  bridgeUrl: string,
  browserOptions: BrowserRunOptions
): Promise<BrowserProbeResult> {
  let tabOpened = false;
  let probe: BrowserProbeResult;
  try {
    const opened = await browserRunner.run(
      ["tab", "new", SETUP_URL],
      browserOptions
    );
    if (opened.exitCode !== 0) {
      return {
        ok: false,
        stage: "browser.open",
        reason: browserResultMessage(
          opened,
          "Divebell could not create a temporary tab in the existing browser."
        )
      };
    }
    tabOpened = true;

    const injected = await browserRunner.run(
      ["eval", createBridgeInitScript(bridgeUrl)],
      browserOptions
    );
    if (injected.exitCode !== 0) {
      probe = {
        ok: false,
        stage: "browser.control",
        reason: browserResultMessage(
          injected,
          "Divebell could not initialize its Bridge in the temporary tab."
        )
      };
    } else {
      const controlled = await browserRunner.run(
        ["eval", SETUP_CONTROL_SCRIPT],
        browserOptions
      );
      probe = controlled.exitCode === 0
        ? {
          ok: true,
          browser: readBrowserIdentity(controlled.stdout)
        }
        : {
          ok: false,
          stage: "browser.control",
          reason: browserResultMessage(
            controlled,
            "The existing browser could not be controlled."
          )
        };
    }
  } catch (error) {
    probe = {
      ok: false,
      stage: tabOpened ? "browser.control" : "browser.open",
      reason: errorMessage(error)
    };
  }

  if (tabOpened) {
    const closed = await closeCheckTab(browserRunner, browserOptions);
    if (closed.exitCode !== 0 && probe.ok) {
      return {
        ok: false,
        stage: "browser.control",
        reason: browserResultMessage(
          closed,
          "Divebell could not close the temporary tab."
        )
      };
    }
  }
  return probe;
}

async function connectExistingChrome(options: {
  browserRunner: BrowserRunner;
  bridgeUrl: string;
  browserOptions: BrowserRunOptions;
  remoteDebuggingPageOpener: RemoteDebuggingPageOpener;
  wait(milliseconds: number): Promise<void>;
}): Promise<{
  probe: BrowserProbeResult;
  settingsOpened: boolean;
  openFailure?: string;
}> {
  const connectOptions = createExistingBrowserOptions(
    options.browserOptions,
    true
  );
  let probe = await runExistingBrowserProbe(
    options.browserRunner,
    options.bridgeUrl,
    connectOptions
  );
  if (probe.ok || probe.stage === "browser.control") {
    return {
      probe,
      settingsOpened: false
    };
  }

  const opened = await options.remoteDebuggingPageOpener.open();
  if (!opened.opened) {
    return {
      probe,
      settingsOpened: false,
      ...(opened.reason === undefined ? {} : { openFailure: opened.reason })
    };
  }

  for (let attempt = 0; attempt < EXISTING_CHROME_CONNECT_ATTEMPTS; attempt += 1) {
    await options.wait(EXISTING_CHROME_CONNECT_INTERVAL_MS);
    probe = await runExistingBrowserProbe(
      options.browserRunner,
      options.bridgeUrl,
      connectOptions
    );
    if (probe.ok || probe.stage === "browser.control") {
      break;
    }
  }
  return {
    probe,
    settingsOpened: true
  };
}

function createExistingBrowserOptions(
  browserOptions: BrowserRunOptions,
  autoConnect: boolean
): BrowserRunOptions {
  return {
    ...browserOptions,
    session: `${browserOptions.session ?? "ds"}-existing`,
    ...(autoConnect ? { autoConnect: true } : {})
  };
}

function createBrowserChecks(probe: BrowserProbeResult): CheckEntry[] {
  if (probe.ok) {
    return [
      {
        id: "browser.open",
        status: "passed"
      },
      {
        id: "browser.control",
        status: "passed"
      }
    ];
  }
  if (probe.stage === "browser.open") {
    return [
      {
        id: "browser.open",
        status: "failed",
        message: probe.reason
      },
      {
        id: "browser.control",
        status: "skipped"
      }
    ];
  }
  return [
    {
      id: "browser.open",
      status: "passed"
    },
    {
      id: "browser.control",
      status: "failed",
      message: probe.reason
    }
  ];
}

function createProbeFailure(
  probe: BrowserProbeFailure,
  browserSource: BrowserSource,
  fixed: boolean
): CommandError {
  if (probe.stage === "browser.control") {
    return createError({
      code: "DIVEBELL_SETUP_CONTROL_FAILED",
      kind: "browser",
      message: `Divebell opened the browser but could not control it: ${probe.reason}`,
      retryable: true,
      hint: "Close any temporary Divebell browser process, then run `divebell setup` again."
    });
  }

  if (browserSource.kind === "cdp") {
    const target = browserSource.port === undefined
      ? "the configured Chrome DevTools endpoint"
      : `Chrome DevTools port ${browserSource.port}`;
    const setup = browserSource.port === undefined
      ? "Start Chrome with remote debugging enabled"
      : `Start Chrome with \`--remote-debugging-port=${browserSource.port}\` and a non-default \`--user-data-dir\``;
    return createError({
      code: "DIVEBELL_SETUP_DEBUG_CONNECTION_REQUIRED",
      kind: "needs_input",
      message: `Divebell could not connect to ${target}: ${probe.reason}`,
      retryable: false,
      hint: `${setup}, then run \`divebell setup\` again.`
    });
  }

  if (browserSource.kind === "auto-connect") {
    return createError({
      code: "DIVEBELL_SETUP_DEBUG_CONNECTION_REQUIRED",
      kind: "needs_input",
      message: `Divebell could not find a Chrome instance with remote debugging enabled: ${probe.reason}`,
      retryable: false,
      hint: "In Chrome 144 or newer, open `chrome://inspect/#remote-debugging`, enable remote debugging, then run `divebell setup` again."
    });
  }

  if (
    browserSource.kind === "provider"
    || browserSource.kind === "engine"
    || browserSource.kind === "executable"
  ) {
    return createError({
      code: "DIVEBELL_SETUP_CONFIGURED_BROWSER_FAILED",
      kind: "needs_input",
      message: `Divebell could not use the configured browser source: ${probe.reason}`,
      retryable: false,
      hint: "Check the configured browser source and its credentials, then run `divebell setup` again."
    });
  }

  return createError({
    code: "DIVEBELL_SETUP_BROWSER_FAILED",
    kind: "browser",
    message: `Divebell could not open a browser after the automatic repair: ${probe.reason}`,
    retryable: false,
    hint: fixed
      ? "Review the browser startup reason and any operating-system security prompt, then run `divebell setup` again."
      : "Install the browser requirements manually, then run `divebell setup` again."
  });
}

function createInstallFailure(reason: string): CommandError {
  if (isBrowserDownloadFailure(reason)) {
    return createError({
      code: "DIVEBELL_SETUP_BROWSER_DOWNLOAD_FAILED",
      kind: "browser",
      message: `Divebell could not download Chrome for Testing: ${reason}`,
      retryable: true,
      hint: "Allow access to `googlechromelabs.github.io` and `storage.googleapis.com`, or use an existing Chrome with remote debugging enabled."
    });
  }
  return createError({
    code: "DIVEBELL_SETUP_REPAIR_FAILED",
    kind: "browser",
    message: `Divebell could not install the browser requirements: ${reason}`,
    retryable: false,
    hint: "Resolve the reported browser installation error, then run `divebell setup` again."
  });
}

function createExistingChromeFailure(
  probe: BrowserProbeFailure,
  settingsOpened: boolean,
  openFailure?: string
): CommandError {
  const action = settingsOpened
    ? "The Chrome remote-debugging page was opened, but Divebell did not receive permission before setup timed out."
    : `Open \`${CHROME_REMOTE_DEBUGGING_URL}\` in Chrome and enable remote debugging.`;
  return createError({
    code: "DIVEBELL_SETUP_REMOTE_DEBUGGING_REQUIRED",
    kind: "needs_input",
    message: `Divebell could not connect to the existing Chrome session: ${probe.reason}`,
    retryable: true,
    hint: `${action} Approve the Chrome connection prompt, then run \`divebell setup\` again.`,
    ...(openFailure === undefined
      ? {}
      : {
        details: {
          settingsPageOpenFailure: openFailure
        }
      })
  });
}

function isMissingBrowserFailure(reason: string): boolean {
  return [
    "chrome not found. checked:",
    "no chrome binary found",
    "no chrome/chromium executable",
    "run `agent-browser install` to download chrome"
  ].some((pattern) => reason.toLowerCase().includes(pattern));
}

function isBrowserDownloadFailure(reason: string): boolean {
  return [
    "failed to fetch version info",
    "operation timed out",
    "error sending request",
    "googlechromelabs.github.io",
    "storage.googleapis.com"
  ].some((pattern) => reason.toLowerCase().includes(pattern));
}

function isExistingBrowserSource(browserSource: BrowserSource): boolean {
  return browserSource.kind === "cdp"
    || browserSource.kind === "auto-connect";
}

function createSuccessMessage(
  fixed: boolean,
  fixMethods: readonly FixMethod[]
): string {
  if (!fixed) return "Divebell is ready.";
  if (fixMethods.includes("connect-existing-chrome")) {
    return "Divebell is ready. Connected to the existing Chrome session.";
  }
  return "Divebell is ready. Browser requirements were installed.";
}

async function closeCheckBrowser(
  browserRunner: BrowserRunner,
  browserOptions: BrowserRunOptions
): Promise<BrowserRunResult> {
  try {
    return await browserRunner.run(["close"], browserOptions);
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: errorMessage(error)
    };
  }
}

async function closeCheckTab(
  browserRunner: BrowserRunner,
  browserOptions: BrowserRunOptions
): Promise<BrowserRunResult> {
  try {
    return await browserRunner.run(["tab", "close"], browserOptions);
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: errorMessage(error)
    };
  }
}

async function installBrowserRequirements(
  browserRunner: BrowserRunner,
  browserOptions: BrowserRunOptions
): Promise<BrowserRunResult> {
  try {
    return await browserRunner.run(
      createBrowserInstallArgs(),
      browserOptions
    );
  } catch (error) {
    return {
      exitCode: 1,
      stdout: "",
      stderr: errorMessage(error)
    };
  }
}

function detectBrowserSource(env: NodeJS.ProcessEnv): BrowserSource {
  const cdp = env.AGENT_BROWSER_CDP?.trim();
  if (cdp !== undefined && cdp.length > 0) {
    return {
      kind: "cdp",
      ...(/^\d+$/.test(cdp) ? { port: cdp } : {})
    };
  }
  if (isTruthyEnvironmentValue(env.AGENT_BROWSER_AUTO_CONNECT)) {
    return {
      kind: "auto-connect"
    };
  }
  const provider = env.AGENT_BROWSER_PROVIDER?.trim();
  if (provider) {
    return {
      kind: "provider",
      name: provider
    };
  }
  const engine = env.AGENT_BROWSER_ENGINE?.trim().toLowerCase();
  if (engine !== undefined && engine.length > 0 && engine !== "chrome") {
    return {
      kind: "engine",
      name: engine
    };
  }
  if (env.AGENT_BROWSER_EXECUTABLE_PATH?.trim()) {
    return {
      kind: "executable"
    };
  }
  return {
    kind: "managed"
  };
}

export function isSupportedNodeVersion(version: string): boolean {
  const match = /^(?:v)?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (match === null) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return (major === 20 && minor >= 19) || (major > 20 && major < 25);
}

function createEnvironmentData(
  nodeVersion: string,
  nodeSupported: boolean,
  browserSource: BrowserSource,
  browserIdentity: BrowserIdentity
) {
  return {
    node: {
      version: nodeVersion,
      requirement: SUPPORTED_NODE_RANGE,
      supported: nodeSupported
    },
    browser: {
      source: createBrowserSourceData(browserSource),
      name: browserIdentity.name,
      version: browserIdentity.version
    }
  };
}

function createBrowserSourceData(browserSource: BrowserSource) {
  switch (browserSource.kind) {
    case "cdp":
      return {
        kind: browserSource.kind,
        ...(browserSource.port === undefined ? {} : { port: browserSource.port })
      };
    case "provider":
    case "engine":
      return {
        kind: browserSource.kind,
        name: browserSource.name
      };
    default:
      return {
        kind: browserSource.kind
      };
  }
}

function readBrowserIdentity(stdout: string): BrowserIdentity {
  let result: unknown;
  try {
    result = JSON.parse(stdout);
  } catch {
    return emptyBrowserIdentity();
  }
  if (
    result === null
    || typeof result !== "object"
    || !("userAgent" in result)
    || typeof result.userAgent !== "string"
  ) {
    return emptyBrowserIdentity();
  }
  return parseBrowserUserAgent(result.userAgent);
}

function parseBrowserUserAgent(userAgent: string): BrowserIdentity {
  const patterns: Array<{
    name: string;
    pattern: RegExp;
  }> = [
    {
      name: "Edge",
      pattern: /\bEdg(?:A|iOS)?\/([\d.]+)/
    },
    {
      name: "Opera",
      pattern: /\bOPR\/([\d.]+)/
    },
    {
      name: "Chrome",
      pattern: /\b(?:HeadlessChrome|Chrome|CriOS)\/([\d.]+)/
    },
    {
      name: "Chromium",
      pattern: /\bChromium\/([\d.]+)/
    },
    {
      name: "Lightpanda",
      pattern: /\bLightpanda\/([\d.]+)/
    },
    {
      name: "Firefox",
      pattern: /\b(?:Firefox|FxiOS)\/([\d.]+)/
    },
    {
      name: "Safari",
      pattern: /\bVersion\/([\d.]+).*\bSafari\//
    }
  ];
  for (const entry of patterns) {
    const match = entry.pattern.exec(userAgent);
    if (match?.[1]) {
      return {
        name: entry.name,
        version: match[1]
      };
    }
  }
  return emptyBrowserIdentity();
}

function emptyBrowserIdentity(): BrowserIdentity {
  return {
    name: null,
    version: null
  };
}

async function defaultWait(milliseconds: number): Promise<void> {
  await delay(milliseconds);
}

function isTruthyEnvironmentValue(value: string | undefined): boolean {
  return value === "1" || value?.toLowerCase() === "true";
}

function browserResultMessage(
  result: BrowserRunResult,
  fallback: string
): string {
  return result.stderr.trim() || result.stdout.trim() || fallback;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
