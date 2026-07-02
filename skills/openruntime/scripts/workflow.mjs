#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import { homedir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const MAX_ATTEMPTS = 3;
const DEFAULT_BRIDGE = "http://localhost:17321";
const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_ACTION_REQUIRED = 2;
const REQUIRED_INTEGRATION_ALLOWED_ACTIONS = [
  "apply_required_integration",
  "rerun_connected",
  "report_blocked"
];
const DONE_ALLOWED_ACTIONS = ["write_result", "cleanup"];
const REPORT_BLOCKED_ALLOWED_ACTIONS = ["report_blocked"];
const FORBIDDEN_REQUIRED_ACTION_COMMANDS = [
  "actions",
  "click",
  "console",
  "eval",
  "events",
  "fill",
  "get-window",
  "goto",
  "input-options",
  "network",
  "page-snapshot",
  "run-action",
  "runtimes",
  "screenshot",
  "snapshot",
  "targets",
  "verify",
  "wait-eval",
  "wait-for"
];
const DEFAULT_REQUIRED_ACTION_DIR = path.join(homedir(), ".openruntime", "required-actions");
const REQUIRED_ACTION_KIND = "openruntime.requiredAction";
const REQUIRED_ACTION_SCHEMA_VERSION = 1;
const REQUIRED_ACTION_BLOCK_CODES = new Set([
  "OPENRUNTIME_INTEGRATION_REQUIRED",
  "OPENRUNTIME_INTEGRATION_REQUIRED_BLOCKED"
]);

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const resolveIntegrationScript = path.join(scriptDir, "resolve-integration.mjs");

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  writeJson({
    status: "fail",
    error: message
  });
  process.stderr.write(`${message}\n`);
  process.exitCode = EXIT_FAIL;
});

async function main() {
  const [command, ...argv] = process.argv.slice(2);
  const args = parseArgs(argv);

  if (command === "connected") {
    process.exitCode = await runConnected(args);
    return;
  }
  if (command === "observe") {
    process.exitCode = await runObserve(args);
    return;
  }
  if (command === "verify") {
    process.exitCode = await runVerify(args);
    return;
  }
  usage();
  process.exitCode = EXIT_FAIL;
}

async function runConnected(args) {
  const packageJsonPath = requireOption(args, "package-json");
  const bridge = String(args.bridge ?? DEFAULT_BRIDGE);
  const url = optionalString(args.url);
  const outPath = optionalString(args.out);
  const sourceEditable = parseBooleanOption(args["source-editable"], true);
  const stateDirectory = optionalString(args["state-dir"]);
  const evidence = readEvidence(outPath);
  evidence.attempts.connected += 1;

  const integration = resolveIntegration(packageJsonPath);
  evidence.integration = {
    executed: true,
    packageJson: path.resolve(packageJsonPath),
    install: integration.install,
    use: integration.use,
    required: integration.required
  };

  const bridgeResult = await readBridgeRuntimes(bridge);
  const runtimes = Array.isArray(bridgeResult.runtimes) ? bridgeResult.runtimes : [];
  const connectedRuntimes = runtimes.filter((runtime) => runtime?.status === "connected");
  const selectedRuntime = pickRuntime(connectedRuntimes, url);
  const openOperation = readOpenOperationLog(process.cwd());
  const matchingOpenOperation = getMatchingOpenOperation(openOperation, url);

  if (selectedRuntime !== undefined) {
    const effectiveBridge = bridgeResult.bridgeUrl ?? bridge;
    evidence.connected = {
      ok: true,
      bridge: effectiveBridge,
      url: url ?? null,
      runtimeId: selectedRuntime.runtimeId ?? null,
      runtimeUrl: selectedRuntime.url ?? null,
      status: selectedRuntime.status,
      runtimeCount: runtimes.length,
      connectedCount: connectedRuntimes.length
    };
    evidence.open = createOpenEvidence(matchingOpenOperation, url);
    if (evidence.doneLock === true || evidence.finalVerify.businessVerified === true) {
      evidence.status = "pass";
      evidence.doneLock = true;
      evidence.allowedNextActions = DONE_ALLOWED_ACTIONS;
      evidence.requiredAction = null;
      evidence.nextAction = null;
    } else {
      evidence.status = "action_required";
      evidence.allowedNextActions = ["observe"];
      evidence.requiredAction = null;
      evidence.nextAction = createObserveNextAction();
    }
    removeRequiredActionState(stateDirectory);
    writeEvidence(outPath, evidence);
    writeJson({
      status: "pass",
      connected: evidence.connected,
      open: evidence.open,
      integration: evidence.integration,
      requiredAction: evidence.requiredAction,
      doneLock: evidence.doneLock,
      allowedNextActions: evidence.allowedNextActions,
      nextAction: evidence.nextAction
    });
    return EXIT_PASS;
  }

  const nextAction = createConnectedFailureNextAction({
    bridgeResult,
    matchingOpenOperation,
    integration,
    bridge,
    url,
    sourceEditable
  });
  const integrationRequired = isIntegrationRequired(integration);
  const exhausted = evidence.attempts.connected >= MAX_ATTEMPTS;
  const blocked = exhausted || (integrationRequired && sourceEditable !== true);
  evidence.connected = {
    ok: false,
    bridge: bridgeResult.bridgeUrl ?? bridge,
    url: url ?? null,
    runtimeCount: runtimes.length,
    connectedCount: connectedRuntimes.length,
    reason: bridgeResult.ok === false
      ? bridgeResult.error
      : "No runtime with status \"connected\" was found."
  };
  evidence.open = createOpenEvidence(matchingOpenOperation, url);
  evidence.status = blocked ? "fail" : "action_required";
  evidence.requiredAction = integrationRequired
    ? writeRequiredIntegrationState({
        integration,
        bridge,
        url,
        sourceEditable,
        status: blocked ? "blocked" : "pending",
        code: blocked
          ? "OPENRUNTIME_INTEGRATION_REQUIRED_BLOCKED"
          : "OPENRUNTIME_INTEGRATION_REQUIRED",
        attempts: evidence.attempts.connected,
        maxAttempts: MAX_ATTEMPTS,
        reason: evidence.connected.reason,
        nextAction,
        stateDirectory
      })
    : null;
  if (!integrationRequired) {
    removeRequiredActionState(stateDirectory);
  }
  evidence.allowedNextActions = evidence.requiredAction?.allowedNextActions ??
    (blocked ? REPORT_BLOCKED_ALLOWED_ACTIONS : ["open_page", "rerun_connected", "report_blocked"]);
  evidence.nextAction = blocked
    ? createReportBlockedNextAction({
        code: evidence.requiredAction?.code ?? "OPENRUNTIME_CONNECTED_BLOCKED",
        previousAction: nextAction
      })
    : nextAction;
  writeEvidence(outPath, evidence);
  writeJson({
    status: evidence.status,
    connected: evidence.connected,
    open: evidence.open,
    integration: evidence.integration,
    requiredAction: evidence.requiredAction,
    attempts: evidence.attempts.connected,
    maxAttempts: MAX_ATTEMPTS,
    allowedNextActions: evidence.allowedNextActions,
    nextAction: evidence.nextAction
  });
  return blocked ? EXIT_FAIL : EXIT_ACTION_REQUIRED;
}

async function runObserve(args) {
  const outPath = optionalString(args.out);
  const url = optionalString(args.url);
  const stateDirectory = optionalString(args["state-dir"]);
  const evidence = readEvidence(outPath);

  if (evidence.doneLock === true) {
    evidence.status = "pass";
    evidence.allowedNextActions = DONE_ALLOWED_ACTIONS;
    evidence.requiredAction = null;
    evidence.nextAction = null;
    removeRequiredActionState(stateDirectory);
    writeEvidence(outPath, evidence);
    writeJson({
      status: "pass",
      doneLock: true,
      terminal: true,
      requiredAction: evidence.requiredAction,
      allowedNextActions: evidence.allowedNextActions
    });
    return EXIT_PASS;
  }

  const requiredAction = readRequiredActionState(stateDirectory) ?? evidence.requiredAction;
  if (isBlockingRequiredAction(requiredAction)) {
    return writeRequiredActionFailure({
      evidence,
      requiredAction,
      outPath,
      payload: { observe: evidence.observe }
    });
  }

  if (evidence.connected.ok !== true) {
    evidence.status = "action_required";
    evidence.allowedNextActions = ["rerun_connected", "report_blocked"];
    evidence.nextAction = {
      type: "rerun_connected",
      code: "OPENRUNTIME_CONNECTED_REQUIRED",
      required: true
    };
    writeEvidence(outPath, evidence);
    writeJson({
      status: "action_required",
      observe: evidence.observe,
      allowedNextActions: evidence.allowedNextActions,
      nextAction: evidence.nextAction
    });
    return EXIT_ACTION_REQUIRED;
  }

  const pluginSnapshot = resolvePluginSnapshotAvailability(evidence.integration);
  const nextAction = pluginSnapshot.available
    ? createSnapshotObserveNextAction(pluginSnapshot, url)
    : createBrowserDiagnoseNextAction(pluginSnapshot, url);

  evidence.observe = {
    executed: true,
    mode: pluginSnapshot.available ? "snapshot_observe" : "browser_diagnose",
    snapshotAvailable: pluginSnapshot.available,
    plugins: pluginSnapshot.plugins,
    missingInstall: pluginSnapshot.missingInstall,
    url: url ?? null,
    recordedAt: new Date().toISOString()
  };
  evidence.status = "action_required";
  evidence.allowedNextActions = [nextAction.type];
  evidence.requiredAction = null;
  evidence.nextAction = nextAction;
  writeEvidence(outPath, evidence);
  writeJson({
    status: "pass",
    observe: evidence.observe,
    requiredAction: evidence.requiredAction,
    allowedNextActions: evidence.allowedNextActions,
    nextAction
  });
  return EXIT_PASS;
}

async function runVerify(args) {
  const targetId = requireOption(args, "target");
  const expectedStatus = String(args.status ?? "ready");
  const bridge = String(args.bridge ?? DEFAULT_BRIDGE);
  const url = optionalString(args.url);
  const outPath = optionalString(args.out);
  const stateDirectory = optionalString(args["state-dir"]);
  const evidence = readEvidence(outPath);

  if (evidence.doneLock === true && evidence.finalVerify.businessVerified === true) {
    evidence.status = "pass";
    evidence.allowedNextActions = DONE_ALLOWED_ACTIONS;
    evidence.requiredAction = null;
    evidence.nextAction = null;
    removeRequiredActionState(stateDirectory);
    writeEvidence(outPath, evidence);
    writeJson({
      status: "pass",
      doneLock: true,
      terminal: true,
      finalVerify: evidence.finalVerify,
      requiredAction: evidence.requiredAction,
      allowedNextActions: evidence.allowedNextActions
    });
    return EXIT_PASS;
  }

  const requiredAction = readRequiredActionState(stateDirectory) ?? evidence.requiredAction;
  if (isBlockingRequiredAction(requiredAction)) {
    return writeRequiredActionFailure({
      evidence,
      requiredAction,
      outPath,
      payload: { finalVerify: evidence.finalVerify }
    });
  }

  evidence.attempts.verify += 1;

  const verifyResult = runOpenRuntimeVerify({
    targetId,
    status: expectedStatus,
    bridge,
    url,
    timeout: optionalString(args.timeout)
  });
  const parsed = verifyResult.parsed;
  const result = parsed?.result;
  const verifyEvidence = result?.evidence ?? {};
  const success = result?.success === true;
  const evidenceLevel = typeof verifyEvidence.level === "string" ? verifyEvidence.level : null;
  const businessVerified = verifyEvidence.businessVerified === true;
  const passed = success && evidenceLevel === "business" && businessVerified;

  evidence.finalVerify = {
    executed: true,
    targetId,
    expectedStatus,
    command: verifyResult.command,
    exitCode: verifyResult.exitCode,
    success,
    evidenceLevel,
    businessVerified,
    targetClass: verifyEvidence.targetClass ?? null,
    message: verifyEvidence.message ?? null,
    nextStep: verifyEvidence.nextStep ?? null
  };

  if (passed) {
    evidence.status = "pass";
    evidence.doneLock = true;
    evidence.allowedNextActions = DONE_ALLOWED_ACTIONS;
    evidence.requiredAction = null;
    evidence.nextAction = null;
    removeRequiredActionState(stateDirectory);
    writeEvidence(outPath, evidence);
    writeJson({
      status: "pass",
      doneLock: true,
      terminal: true,
      finalVerify: evidence.finalVerify,
      requiredAction: evidence.requiredAction,
      allowedNextActions: evidence.allowedNextActions
    });
    return EXIT_PASS;
  }

  const exhausted = evidence.attempts.verify >= MAX_ATTEMPTS;
  evidence.status = exhausted ? "fail" : "action_required";
  evidence.allowedNextActions = exhausted
    ? REPORT_BLOCKED_ALLOWED_ACTIONS
    : ["run_final_verify", "report_blocked"];
  evidence.nextAction = exhausted
    ? createReportBlockedNextAction({
        code: "OPENRUNTIME_FINAL_VERIFY_BLOCKED",
        previousAction: createVerifyNextAction(evidence.finalVerify)
      })
    : createVerifyNextAction(evidence.finalVerify);
  writeEvidence(outPath, evidence);
  writeJson({
    status: evidence.status,
    finalVerify: evidence.finalVerify,
    attempts: evidence.attempts.verify,
    maxAttempts: MAX_ATTEMPTS,
    allowedNextActions: evidence.allowedNextActions,
    nextAction: evidence.nextAction
  });
  return exhausted ? EXIT_FAIL : EXIT_ACTION_REQUIRED;
}

function runOpenRuntimeVerify(options) {
  const command = "pnpm";
  const commandArgs = [
    "exec",
    "openruntime",
    "verify",
    options.targetId,
    options.status,
    "--bridge",
    options.bridge
  ];
  if (options.url !== undefined) {
    commandArgs.push("--url", options.url);
  }
  if (options.timeout !== undefined) {
    commandArgs.push("--timeout", options.timeout);
  }

  const result = spawnSync(command, commandArgs, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024
  });
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const parsed = parseJsonOutput(stdout);
  if (parsed === undefined) {
    return {
      command: [command, ...commandArgs].join(" "),
      exitCode: result.status ?? 1,
      parsed: {
        result: {
          success: false,
          evidence: {
            level: "insufficient",
            businessVerified: false,
            targetClass: "unknown",
            message: stderr.trim() || stdout.trim() || "openruntime verify did not return JSON.",
            nextStep: "Install @openruntime/cli, connect the page runtime, then rerun workflow verify."
          }
        }
      }
    };
  }

  return {
    command: [command, ...commandArgs].join(" "),
    exitCode: result.status ?? 0,
    parsed
  };
}

function resolveIntegration(packageJsonPath) {
  const result = spawnSync(process.execPath, [resolveIntegrationScript, packageJsonPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "resolve-integration failed.");
  }
  const parsed = JSON.parse(result.stdout);
  const install = Array.isArray(parsed.install) ? parsed.install : [];
  const use = Array.isArray(parsed.use) ? parsed.use : [];
  return {
    install,
    use,
    required: parsed.required === true || install.length > 0 || use.length > 0
  };
}

async function readBridgeRuntimes(bridgeUrl) {
  const bridgeCandidates = getBridgeUrlCandidates(bridgeUrl);
  const timeoutMs = isLoopbackUrl(bridgeUrl) ? 1000 : 5000;
  let lastFailure;
  for (const candidate of bridgeCandidates) {
    const result = await readBridgeRuntimesOnce(candidate, timeoutMs);
    if (result.ok === true) return result;
    lastFailure = result;
  }
  return lastFailure ?? {
    ok: false,
    bridgeUrl,
    runtimes: [],
    error: "Bridge is not reachable."
  };
}

async function readBridgeRuntimesOnce(bridgeUrl, timeoutMs) {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${trimTrailingSlash(bridgeUrl)}/runtimes`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    const text = await response.text();
    if (!response.ok) {
      return {
        ok: false,
        runtimes: [],
        error: `Bridge returned HTTP ${response.status}: ${text.slice(0, 200)}`
      };
    }
    const parsed = JSON.parse(text);
    return {
      ok: true,
      bridgeUrl,
      runtimes: Array.isArray(parsed.runtimes) ? parsed.runtimes : []
    };
  } catch (error) {
    return {
      ok: false,
      bridgeUrl,
      runtimes: [],
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

function pickRuntime(runtimes, url) {
  if (runtimes.length === 0) return undefined;
  if (url === undefined) return runtimes[0];
  const normalizedUrl = normalizeUrlForCompare(url);
  return runtimes.find((runtime) => normalizeUrlForCompare(runtime.url) === normalizedUrl) ?? runtimes[0];
}

function writeRequiredIntegrationState({
  integration,
  bridge,
  url,
  sourceEditable,
  status,
  code,
  attempts,
  maxAttempts,
  reason,
  nextAction,
  stateDirectory
}) {
  const stateFile = getRequiredActionStateFile(stateDirectory);
  const existing = readRequiredActionState(stateDirectory);
  const cwd = getRequiredActionCwd();
  const allowedNextActions = status === "pending" && sourceEditable === true
    ? REQUIRED_INTEGRATION_ALLOWED_ACTIONS
    : REPORT_BLOCKED_ALLOWED_ACTIONS;
  const requiredAction = sourceEditable === true && status === "pending"
    ? nextAction
    : createReportBlockedNextAction({
        code,
        previousAction: nextAction
      });
  const state = {
    schemaVersion: REQUIRED_ACTION_SCHEMA_VERSION,
    kind: REQUIRED_ACTION_KIND,
    key: createRequiredActionStateKey(cwd),
    cwd,
    source: "workflow.connected",
    status,
    code,
    sourceEditable,
    canFallback: false,
    allowedNextActions,
    forbiddenCommands: FORBIDDEN_REQUIRED_ACTION_COMMANDS,
    integration: {
      install: integration.install,
      use: integration.use,
      required: true
    },
    requiredAction,
    connected: {
      bridge,
      url: url ?? null,
      attempts,
      maxAttempts,
      reason
    },
    createdAt: existing?.createdAt ?? new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    stateFile
  };
  fs.mkdirSync(path.dirname(stateFile), { recursive: true });
  fs.writeFileSync(stateFile, `${JSON.stringify(state, null, 2)}\n`, "utf8");
  return state;
}

function readRequiredActionState(stateDirectory) {
  const stateFile = getRequiredActionStateFile(stateDirectory);
  const direct = readRequiredActionStateFile(stateFile);
  if (direct !== undefined) return direct;
  return findRequiredActionStateForCwd(stateDirectory, getRequiredActionCwd());
}

function removeRequiredActionState(stateDirectory) {
  try {
    fs.rmSync(getRequiredActionStateFile(stateDirectory), { force: true });
  } catch {
    // Best effort cleanup only.
  }
}

function getRequiredActionStateFile(stateDirectory) {
  const directory = stateDirectory ?? DEFAULT_REQUIRED_ACTION_DIR;
  return path.join(directory, `${createRequiredActionStateKey(getRequiredActionCwd())}.json`);
}

function createRequiredActionStateKey(cwd) {
  return `required-action-${createHash("sha256").update(normalizeRequiredActionCwd(cwd)).digest("hex").slice(0, 16)}`;
}

function getRequiredActionCwd() {
  return normalizeRequiredActionCwd(process.cwd());
}

function normalizeRequiredActionCwd(cwd) {
  const resolved = path.resolve(cwd);
  try {
    return fs.realpathSync.native(resolved);
  } catch {
    try {
      return fs.realpathSync(resolved);
    } catch {
      return resolved;
    }
  }
}

function readRequiredActionStateFile(stateFile) {
  try {
    const parsed = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (!isRequiredActionState(parsed)) return undefined;
    return {
      ...parsed,
      stateFile
    };
  } catch {
    return undefined;
  }
}

function findRequiredActionStateForCwd(stateDirectory, cwd) {
  const directory = stateDirectory ?? DEFAULT_REQUIRED_ACTION_DIR;
  let entries;
  try {
    entries = fs.readdirSync(directory);
  } catch {
    return undefined;
  }
  for (const entry of entries) {
    if (!entry.startsWith("required-action-") || !entry.endsWith(".json")) continue;
    const stateFile = path.join(directory, entry);
    const state = readRequiredActionStateFile(stateFile);
    if (state === undefined) continue;
    if (normalizeRequiredActionCwd(state.cwd) === cwd) return state;
  }
  return undefined;
}

function isRequiredActionState(value) {
  if (value === null || typeof value !== "object") return false;
  const state = value;
  return state.schemaVersion === REQUIRED_ACTION_SCHEMA_VERSION &&
    state.kind === REQUIRED_ACTION_KIND &&
    typeof state.key === "string" &&
    typeof state.cwd === "string" &&
    (state.status === "pending" || state.status === "blocked") &&
    typeof state.code === "string" &&
    REQUIRED_ACTION_BLOCK_CODES.has(state.code) &&
    state.canFallback === false &&
    Array.isArray(state.allowedNextActions) &&
    Array.isArray(state.forbiddenCommands) &&
    state.requiredAction !== null &&
    typeof state.requiredAction === "object";
}

function isBlockingRequiredAction(value) {
  return isRequiredActionState(value);
}

function writeRequiredActionFailure({ evidence, requiredAction, outPath, payload = {} }) {
  const terminal = requiredAction.status === "blocked";
  evidence.status = terminal ? "fail" : "action_required";
  evidence.requiredAction = requiredAction;
  evidence.allowedNextActions = requiredAction.allowedNextActions;
  evidence.nextAction = requiredAction.requiredAction;
  writeEvidence(outPath, evidence);
  writeJson({
    status: evidence.status,
    ...payload,
    requiredAction,
    allowedNextActions: evidence.allowedNextActions,
    nextAction: evidence.nextAction
  });
  return terminal ? EXIT_FAIL : EXIT_ACTION_REQUIRED;
}

function createReportBlockedNextAction({ code, previousAction }) {
  return {
    type: "report_blocked",
    code,
    required: true,
    canFallback: false,
    fallbackAllowed: false,
    previousAction: previousAction ?? null
  };
}

function createOpenPageNextAction(bridge, url, options = {}) {
  const command = url === undefined
    ? null
    : `pnpm exec openruntime open ${quoteShellArg(url)} --bridge ${quoteShellArg(bridge)}`;
  const summary = options.bridgeReachable === false
    ? "Bridge is not reachable. Open the target page with the OpenRuntime CLI so it can auto-start Bridge, then rerun this connected check."
    : "No openruntime open operation was recorded for this working directory. Open the target page with the CLI, then rerun this connected check.";
  return {
    type: "open_page",
    summary,
    ...(command === null ? {} : { commands: [command] }),
    bridge,
    url: url ?? null
  };
}

function createConnectedFailureNextAction({ bridgeResult, matchingOpenOperation, integration, bridge, url }) {
  const openAction = createOpenPageNextAction(bridge, url, { bridgeReachable: bridgeResult.ok !== false });
  const integrationRequired = isIntegrationRequired(integration);

  if (integrationRequired) {
    return createApplyRequiredIntegrationNextAction({
      integration,
      bridge,
      url,
      openAction: bridgeResult.ok === false || matchingOpenOperation === undefined ? openAction : null
    });
  }

  if (matchingOpenOperation === undefined) return openAction;
  return createConnectBridgeNextAction(integration, bridge, url);
}

function createApplyRequiredIntegrationNextAction({ integration, bridge, url, openAction }) {
  const connectAction = createConnectBridgeNextAction(integration, bridge, url);
  const preconditions = openAction === null ? [] : [createOpenPagePrecondition(openAction)];
  return {
    type: "apply_required_integration",
    code: "OPENRUNTIME_INTEGRATION_REQUIRED",
    required: true,
    canFallback: false,
    fallbackAllowed: false,
    commands: connectAction.commands ?? [],
    requiredCommands: connectAction.requiredCommands ?? [],
    integration: {
      install: integration.install,
      use: integration.use,
      required: true
    },
    bridge,
    url: url ?? null,
    reference: connectAction.reference ?? null,
    snippets: connectAction.snippets ?? [],
    additionalActions: connectAction.additionalActions ?? [],
    preconditions,
    rerun: {
      type: "rerun_connected"
    }
  };
}

function createOpenPagePrecondition(openAction) {
  return {
    type: openAction.type,
    commands: openAction.commands ?? [],
    bridge: openAction.bridge,
    url: openAction.url
  };
}

function createConnectBridgeNextAction(integration, bridge, url) {
  const port = bridgePort(bridge);
  const install = integration.install.length > 0
    ? [`pnpm add ${integration.install.join(" ")}`]
    : [];
  const use = new Set(integration.use);
  const additionalActions = [];
  if (use.has("@module-federation/observability-plugin")) {
    additionalActions.push({
      type: "wire_mf_observability",
      required: true,
      canFallback: false,
      fallbackAllowed: false,
      reference: "skills/openruntime/references/module-federation.md"
    });
  }

  if (use.has("@openruntime/modern-plugin")) {
    return {
      type: "connect_modern_plugin",
      required: true,
      canFallback: false,
      fallbackAllowed: false,
      commands: install,
      requiredCommands: install,
      reference: "skills/openruntime/references/modernjs.md",
      bridge,
      url: url ?? null,
      snippets: [
        {
          pathHint: "src/modern.runtime.ts",
          language: "ts",
          code: `import { defineRuntimeConfig } from "@modern-js/runtime";
import { openRuntimeModernPlugin } from "@openruntime/modern-plugin";

export default defineRuntimeConfig({
  plugins: [
    openRuntimeModernPlugin({
      bridge: {
        port: ${port},
      },
    }),
  ],
});`
        }
      ],
      additionalActions
    };
  }

  return {
    type: "connect_core_runtime",
    required: true,
    canFallback: false,
    fallbackAllowed: false,
    commands: install,
    requiredCommands: install,
    reference: "skills/openruntime/references/modernjs.md",
    bridge,
    url: url ?? null,
    snippets: [
      {
        pathHint: "app entrypoint",
        language: "ts",
        code: `import { createOpenRuntime, installOpenRuntimeOnWindow } from "@openruntime/core";

const runtime = installOpenRuntimeOnWindow(createOpenRuntime());

runtime.registerTarget({
  id: "app:ready",
  type: "app",
  statuses: ["ready", "error"],
  source: "app",
});

runtime.updateSnapshot({
  id: "app:ready",
  status: "ready",
});

runtime.connectBridge({
  port: ${port},
});`
      }
    ],
    additionalActions
  };
}

function isIntegrationRequired(integration) {
  return integration?.required === true ||
    integration?.install?.length > 0 ||
    integration?.use?.length > 0;
}

function createRunVerifyNextAction() {
  return {
    type: "run_final_verify",
    summary: "Run workflow verify only when the final check must prove a business fact or code execution with a business target."
  };
}

function createObserveNextAction() {
  return {
    type: "run_observe",
    summary: "Runtime is connected. Run workflow observe to choose plugin snapshot evidence or normal browser diagnosis."
  };
}

function createSnapshotObserveNextAction(pluginSnapshot, url) {
  const commands = [
    "pnpm exec openruntime snapshot --url <app-url>"
  ];
  return {
    type: "snapshot_observe",
    summary: "Plugin snapshot evidence is available. First run one full snapshot without --id/--query. If it is not useful, switch to OpenRuntime browser diagnosis such as console/network/page-snapshot/eval.",
    plugins: pluginSnapshot.plugins,
    url: url ?? null,
    commands,
    rules: [
      "Do not run multiple snapshot variants in parallel on first observe.",
      "Use --id or --query only after the full snapshot reveals a concrete target or keyword worth narrowing.",
      "Do not add a business target during observe; add or reuse it when entering patch/final verification."
    ]
  };
}

function createBrowserDiagnoseNextAction(pluginSnapshot, url) {
  return {
    type: "browser_diagnose",
    summary: "No installed MF/Vmok/Modern snapshot plugin was found. Diagnose normally with console/page-snapshot/network. Add a business target only when business facts or JS execution must be verified.",
    missingInstall: pluginSnapshot.missingInstall,
    url: url ?? null
  };
}

function createVerifyNextAction(finalVerify) {
  if (finalVerify.evidenceLevel !== "business") {
    return {
      type: "add_business_target",
      summary: "Final verification is not business-level. Add or use a minimal business target, then rerun workflow verify with that target.",
      requestedTarget: finalVerify.targetId ?? null,
      snippets: [
        {
          pathHint: "stable business component or loader",
          language: "ts",
          code: `runtime.registerTarget({
  id: "business:<area>:<capability>",
  type: "business.<capability>",
  statuses: ["ready", "error"],
  source: "<app-or-package>",
});

runtime.updateSnapshot({
  id: "business:<area>:<capability>",
  status: "ready",
  data: {
    // Keep only the fields needed to prove the business result.
  },
});`
        }
      ]
    };
  }

  return {
    type: "fix_business_failure",
    summary: "Business target exists but did not reach the expected status. Use the target status, snapshot data, and related events to fix the failure, then rerun workflow verify.",
    target: finalVerify.targetId ?? null,
    message: finalVerify.message ?? null,
    nextStep: finalVerify.nextStep ?? null
  };
}

function resolvePluginSnapshotAvailability(integration) {
  const use = new Set(Array.isArray(integration?.use) ? integration.use : []);
  const install = new Set(Array.isArray(integration?.install) ? integration.install : []);
  const plugins = [];
  const missingInstall = [];

  if (use.has("@module-federation/observability-plugin")) {
    if (install.has("@module-federation/observability-plugin")) {
      missingInstall.push("@module-federation/observability-plugin");
    } else {
      plugins.push("module-federation");
    }
  }
  if (use.has("@openruntime/modern-plugin")) {
    if (install.has("@openruntime/modern-plugin")) {
      missingInstall.push("@openruntime/modern-plugin");
    } else {
      plugins.push("modern");
    }
  }

  return {
    available: plugins.length > 0,
    plugins,
    missingInstall
  };
}

function readEvidence(filePath) {
  const base = createEmptyEvidence();
  if (filePath === undefined || !fs.existsSync(filePath)) {
    return base;
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return mergeEvidence(base, parsed);
}

function writeEvidence(filePath, evidence) {
  if (filePath === undefined) return;
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(evidence, null, 2)}\n`);
}

function createEmptyEvidence() {
  return {
    schemaVersion: 1,
    status: "action_required",
    doneLock: false,
    allowedNextActions: [],
    violations: [],
    attempts: {
      connected: 0,
      verify: 0
    },
    integration: {
      executed: false,
      packageJson: null,
      install: [],
      use: [],
      required: false
    },
    connected: {
      ok: false,
      bridge: null,
      url: null,
      runtimeId: null,
      runtimeUrl: null,
      status: null
    },
    open: {
      checked: true,
      ok: false,
      cwd: path.resolve(process.cwd()),
      url: null,
      normalizedUrl: null,
      openedAt: null,
      reason: "No open operation log was found."
    },
    observe: {
      executed: false,
      mode: null,
      snapshotAvailable: false,
      plugins: [],
      missingInstall: [],
      url: null,
      recordedAt: null
    },
    finalVerify: {
      executed: false,
      targetId: null,
      expectedStatus: null,
      command: null,
      exitCode: null,
      success: false,
      evidenceLevel: null,
      businessVerified: false,
      targetClass: null,
      message: null,
      nextStep: null
    },
    requiredAction: null,
    nextAction: null
  };
}

function mergeEvidence(base, parsed) {
  return {
    ...base,
    ...parsed,
    allowedNextActions: Array.isArray(parsed.allowedNextActions)
      ? parsed.allowedNextActions
      : base.allowedNextActions,
    violations: Array.isArray(parsed.violations) ? parsed.violations : base.violations,
    attempts: {
      ...base.attempts,
      ...parsed.attempts
    },
    integration: {
      ...base.integration,
      ...parsed.integration,
      install: Array.isArray(parsed.integration?.install) ? parsed.integration.install : base.integration.install,
      use: Array.isArray(parsed.integration?.use) ? parsed.integration.use : base.integration.use,
      required: parsed.integration?.required === true ||
        (Array.isArray(parsed.integration?.install) && parsed.integration.install.length > 0) ||
        (Array.isArray(parsed.integration?.use) && parsed.integration.use.length > 0)
    },
    connected: {
      ...base.connected,
      ...parsed.connected
    },
    open: {
      ...base.open,
      ...parsed.open
    },
    observe: {
      ...base.observe,
      ...parsed.observe,
      plugins: Array.isArray(parsed.observe?.plugins) ? parsed.observe.plugins : base.observe.plugins,
      missingInstall: Array.isArray(parsed.observe?.missingInstall)
        ? parsed.observe.missingInstall
        : base.observe.missingInstall
    },
    finalVerify: {
      ...base.finalVerify,
      ...parsed.finalVerify
    },
    requiredAction: isRequiredActionState(parsed.requiredAction) ? parsed.requiredAction : base.requiredAction
  };
}

function addViolation(evidence, summary) {
  const violation = {
    summary,
    recordedAt: new Date().toISOString()
  };
  evidence.violations.push(violation);
  return violation;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg.startsWith("--")) {
      args._.push(arg);
      continue;
    }
    const eqIndex = arg.indexOf("=");
    if (eqIndex !== -1) {
      args[arg.slice(2, eqIndex)] = arg.slice(eqIndex + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function requireOption(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.trim() === "") {
    throw new Error(`Missing required option --${name}.`);
  }
  return value;
}

function optionalString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : undefined;
}

function parseBooleanOption(value, defaultValue) {
  if (value === undefined) return defaultValue;
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return defaultValue;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function parseJsonOutput(output) {
  const trimmed = String(output ?? "").trim();
  if (trimmed === "") return undefined;
  try {
    return JSON.parse(trimmed);
  } catch {
    for (const line of trimmed.split(/\r?\n/).reverse()) {
      try {
        return JSON.parse(line);
      } catch {
        // Try the next line.
      }
    }
  }
  return undefined;
}

function bridgePort(bridge) {
  try {
    return new URL(bridge).port || "17321";
  } catch {
    return "17321";
  }
}

function trimTrailingSlash(value) {
  return String(value).replace(/\/+$/, "");
}

function getBridgeUrlCandidates(bridge) {
  try {
    const original = new URL(bridge);
    if (!isLoopbackHostname(original.hostname)) {
      return [trimTrailingSlash(bridge)];
    }

    const candidates = [];
    const localhost = new URL(original.toString());
    localhost.hostname = "localhost";
    candidates.push(trimTrailingSlash(localhost.toString()));

    const ipv4 = new URL(original.toString());
    ipv4.hostname = "127.0.0.1";
    candidates.push(trimTrailingSlash(ipv4.toString()));

    const originalTrimmed = trimTrailingSlash(original.toString());
    candidates.push(originalTrimmed);
    return [...new Set(candidates)];
  } catch {
    return [trimTrailingSlash(bridge)];
  }
}

function isLoopbackUrl(value) {
  try {
    return isLoopbackHostname(new URL(value).hostname);
  } catch {
    return false;
  }
}

function readOpenOperationLog(cwd) {
  const filePath = path.join(homedir(), ".openruntime", "operations", `${createOperationLogKey(cwd)}.json`);
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    if (!isOpenOperationLog(parsed)) return undefined;
    return parsed;
  } catch {
    return undefined;
  }
}

function getMatchingOpenOperation(operation, url) {
  if (operation === undefined) return undefined;
  if (url === undefined) return operation;
  return urlsMatchForOpenOperation(operation.url, url) ||
    urlsMatchForOpenOperation(operation.normalizedUrl, url)
    ? operation
    : undefined;
}

function createOpenEvidence(operation, requestedUrl) {
  if (operation === undefined) {
    return {
      checked: true,
      ok: false,
      cwd: path.resolve(process.cwd()),
      url: null,
      normalizedUrl: null,
      openedAt: null,
      reason: requestedUrl === undefined
        ? "No open operation log was found."
        : `No open operation log matched ${requestedUrl}.`
    };
  }

  return {
    checked: true,
    ok: true,
    cwd: operation.cwd,
    url: operation.url,
    normalizedUrl: operation.normalizedUrl,
    openedAt: operation.openedAt,
    reason: null
  };
}

function createOperationLogKey(cwd) {
  return `open-${createHash("sha256").update(path.resolve(cwd)).digest("hex").slice(0, 16)}`;
}

function isOpenOperationLog(value) {
  if (value === null || typeof value !== "object") return false;
  return value.schemaVersion === 1 &&
    value.command === "open" &&
    typeof value.cwd === "string" &&
    typeof value.url === "string" &&
    typeof value.normalizedUrl === "string" &&
    typeof value.openedAt === "number" &&
    typeof value.exitCode === "number";
}

function normalizeUrlForCompare(value) {
  if (typeof value !== "string" || value.trim() === "") return "";
  try {
    const url = new URL(value);
    url.searchParams.delete("openruntimeSessionId");
    if (isLoopbackHostname(url.hostname)) {
      url.hostname = "localhost";
    }
    const pathName = url.pathname.replace(/\/+$/, "") || "/";
    return `${url.origin}${pathName}`;
  } catch {
    return String(value).replace(/\/+$/, "");
  }
}

function urlsMatchForOpenOperation(operationUrl, requestedUrl) {
  const normalizedOperationUrl = normalizeUrlForCompare(operationUrl);
  const normalizedRequestedUrl = normalizeUrlForCompare(requestedUrl);
  if (normalizedOperationUrl === normalizedRequestedUrl) return true;

  try {
    const operation = new URL(normalizedOperationUrl);
    const requested = new URL(normalizedRequestedUrl);
    if (operation.origin !== requested.origin) return false;

    const operationPath = operation.pathname.replace(/\/+$/, "") || "/";
    const requestedPath = requested.pathname.replace(/\/+$/, "") || "/";
    return operationPath === "/" || requestedPath === "/";
  } catch {
    return false;
  }
}

function isLoopbackHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function quoteShellArg(value) {
  return `'${String(value).replace(/'/g, "'\\''")}'`;
}

function usage() {
  process.stderr.write(`Usage:
  workflow.mjs connected --package-json <path> --bridge <url> --url <app-url> --out <file> [--source-editable true|false]
  workflow.mjs observe --url <app-url> --out <file>
  workflow.mjs verify --target <id> --status <status> --bridge <url> --url <app-url> --out <file>
`);
}
