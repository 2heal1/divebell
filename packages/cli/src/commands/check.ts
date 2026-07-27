import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
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
import type { Fetcher } from "../features/runtime/client.js";
import type { ParsedCliArgs } from "../utils/args.js";
import { hasOption } from "../utils/command.js";
import {
  createCommandOutput,
  createError,
  type CommandError
} from "../utils/output.js";
import { openBrowserPage } from "./browser.js";

const CHECK_URL = "about:blank";
export const SUPPORTED_NODE_RANGE = ">=24.0.0 <25";
const CHECK_CONTROL_SCRIPT = `(() => {
  const manager = globalThis.__OPEN_RUNTIME_BRIDGE_MANAGER__;
  if (manager === null || typeof manager !== "object") {
    throw new Error("OpenRuntime Bridge initialization was not installed in the page.");
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

export async function runCheckCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  fetcher: Fetcher;
  browserRunner: BrowserRunner;
  bridgeStarter: BridgeStarter;
  bridgeProcessController?: BridgeProcessController;
  env: NodeJS.ProcessEnv;
  nodeVersion?: string;
}): Promise<number> {
  const output = createCommandOutput(options.stdout, "check");
  const nodeVersion = options.nodeVersion ?? process.versions.node;
  const browserSource = detectBrowserSource(options.env);
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
      code: "OPENRUNTIME_CHECK_NODE_UNSUPPORTED",
      kind: "validation",
      message: `OpenRuntime requires Node.js 24, but this command is running on Node.js ${nodeVersion}.`,
      retryable: false,
      hint: "Install and select Node.js 24, then run `openruntime check` again.",
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

  const temporaryDirectory = await mkdtemp(join(tmpdir(), "openruntime-check-"));
  const bridgeStateDirectory = join(temporaryDirectory, "bridge");
  const browserOptions: BrowserRunOptions = {
    session: `openruntime-check-${randomUUID().replaceAll("-", "")}`,
    disableRestore: true
  };
  const fixRequested = hasOption(options.args, "fix");
  let bridge: StartDedicatedBridgeResult | undefined;
  let browserTouched = false;
  let fixed = false;
  let fixAttempted = false;
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
        code: "OPENRUNTIME_CHECK_BRIDGE_FAILED",
        kind: "internal",
        message: `OpenRuntime could not start its local Bridge: ${reason}`,
        retryable: true,
        hint: "Check whether this machine allows local processes to listen on an available port, then run `openruntime check` again."
      });
    }

    if (failure === undefined && bridge !== undefined) {
      browserTouched = true;
      let probe = await runBrowserProbe(
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

      if (!probe.ok && probe.stage === "browser.open" && fixRequested && browserSource.kind === "managed") {
        fixAttempted = true;
        initialFailure = probe.reason;
        await closeCheckBrowser(options.browserRunner, browserOptions);
        browserTouched = false;

        const install = await installBrowserRequirements(
          options.browserRunner,
          browserOptions
        );
        if (install.exitCode !== 0) {
          const reason = browserResultMessage(install, "Browser requirements could not be installed.");
          failure = createError({
            code: "OPENRUNTIME_CHECK_FIX_FAILED",
            kind: "browser",
            message: `OpenRuntime could not install the browser requirements: ${reason}`,
            retryable: false,
            hint: "Install the browser requirements with administrator help if needed, then run `openruntime check` again."
          });
        } else {
          fixed = true;
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
            browserIdentity = probe.browser;
          }
        }
      }

      if (failure === undefined && !probe.ok) {
        failure = createProbeFailure(
          probe,
          browserSource,
          fixRequested,
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
      code: "OPENRUNTIME_CHECK_CLEANUP_FAILED",
      kind: "internal",
      message: `OpenRuntime opened and controlled the browser, but could not clean up the temporary check: ${cleanupFailure}`,
      retryable: true,
      hint: "Run `openruntime check` again after confirming no temporary OpenRuntime process is still running."
    });
  }

  const data = {
    ready: failure === undefined,
    fixed,
    environment: createEnvironmentData(
      nodeVersion,
      true,
      browserSource,
      browserIdentity
    ),
    checks,
    ...(fixAttempted ? {
      fix: {
        attempted: true,
        status: fixed ? "applied" : "failed",
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
    fixed
      ? "OpenRuntime is ready. Browser requirements were installed."
      : "OpenRuntime is ready."
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
      CHECK_URL,
      bridgeUrl,
      [],
      {
        ...browserOptions,
        reuseInitialBlankPage: true
      }
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
      ["eval", CHECK_CONTROL_SCRIPT],
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
  fixRequested: boolean,
  fixed: boolean
): CommandError {
  if (probe.stage === "browser.control") {
    return createError({
      code: "OPENRUNTIME_CHECK_CONTROL_FAILED",
      kind: "browser",
      message: `OpenRuntime opened the browser but could not control it: ${probe.reason}`,
      retryable: true,
      hint: "Close any temporary OpenRuntime browser process, then run `openruntime check` again."
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
      code: "OPENRUNTIME_CHECK_DEBUG_CONNECTION_REQUIRED",
      kind: "needs_input",
      message: `OpenRuntime could not connect to ${target}: ${probe.reason}`,
      retryable: false,
      hint: `${setup}, then run \`openruntime check\` again.`
    });
  }

  if (browserSource.kind === "auto-connect") {
    return createError({
      code: "OPENRUNTIME_CHECK_DEBUG_CONNECTION_REQUIRED",
      kind: "needs_input",
      message: `OpenRuntime could not find a Chrome instance with remote debugging enabled: ${probe.reason}`,
      retryable: false,
      hint: "In Chrome 144 or newer, open `chrome://inspect/#remote-debugging`, enable remote debugging, then run `openruntime check` again."
    });
  }

  if (
    browserSource.kind === "provider"
    || browserSource.kind === "engine"
    || browserSource.kind === "executable"
  ) {
    return createError({
      code: "OPENRUNTIME_CHECK_CONFIGURED_BROWSER_FAILED",
      kind: "needs_input",
      message: `OpenRuntime could not use the configured browser source: ${probe.reason}`,
      retryable: false,
      hint: "Check the configured browser source and its credentials, then run `openruntime check` again."
    });
  }

  if (!fixRequested) {
    return createError({
      code: "OPENRUNTIME_CHECK_BROWSER_NOT_READY",
      kind: "browser",
      message: `OpenRuntime could not open a browser: ${probe.reason}`,
      retryable: true,
      hint: "Run `openruntime check --fix` to install the browser requirements and retry."
    });
  }

  return createError({
    code: "OPENRUNTIME_CHECK_BROWSER_FAILED",
    kind: "browser",
    message: `OpenRuntime could not open a browser after the automatic repair: ${probe.reason}`,
    retryable: false,
    hint: fixed
      ? "Review the browser startup reason and any operating-system security prompt, then run `openruntime check` again."
      : "Install the browser requirements manually, then run `openruntime check` again."
  });
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
  return match?.[1] === "24";
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
