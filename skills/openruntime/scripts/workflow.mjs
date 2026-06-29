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
const LOW_LEVEL_PROBE_TYPES = new Set([
  "console",
  "network",
  "page-snapshot",
  "eval",
  "wait-eval"
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
  if (command === "verify") {
    process.exitCode = await runVerify(args);
    return;
  }
  if (command === "record-probe") {
    process.exitCode = await runRecordProbe(args);
    return;
  }
  if (command === "target-added") {
    process.exitCode = await runTargetAdded(args);
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
  const evidence = readEvidence(outPath);
  evidence.attempts.connected += 1;

  const integration = resolveIntegration(packageJsonPath);
  evidence.integration = {
    executed: true,
    packageJson: path.resolve(packageJsonPath),
    install: integration.install,
    use: integration.use
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
      evidence.allowedNextActions = ["write_result", "cleanup"];
      evidence.nextAction = null;
    } else if (evidence.discoveryProbe.mustAddTarget === true) {
      evidence.status = "action_required";
      evidence.nextAction = createAddTargetAfterProbeNextAction(getLastProbeRecord(evidence));
    } else {
      evidence.status = "action_required";
      evidence.nextAction = createRunVerifyNextAction();
    }
    writeEvidence(outPath, evidence);
    writeJson({
      status: "pass",
      connected: evidence.connected,
      open: evidence.open,
      integration: evidence.integration,
      doneLock: evidence.doneLock,
      allowedNextActions: evidence.allowedNextActions,
      nextAction: evidence.nextAction
    });
    return EXIT_PASS;
  }

  const nextAction = bridgeResult.ok === false || matchingOpenOperation === undefined
    ? createOpenPageNextAction(bridge, url, { bridgeReachable: bridgeResult.ok !== false })
    : createConnectBridgeNextAction(integration, bridge, url);
  const exhausted = evidence.attempts.connected >= MAX_ATTEMPTS;
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
  evidence.status = exhausted ? "fail" : "action_required";
  evidence.nextAction = exhausted
    ? {
        type: "blocked",
        summary: `OpenRuntime runtime was not connected after ${MAX_ATTEMPTS} attempts.`,
        previousAction: nextAction
      }
    : nextAction;
  writeEvidence(outPath, evidence);
  writeJson({
    status: evidence.status,
    connected: evidence.connected,
    open: evidence.open,
    integration: evidence.integration,
    attempts: evidence.attempts.connected,
    maxAttempts: MAX_ATTEMPTS,
    nextAction: evidence.nextAction
  });
  return exhausted ? EXIT_FAIL : EXIT_ACTION_REQUIRED;
}

async function runVerify(args) {
  const targetId = requireOption(args, "target");
  const expectedStatus = String(args.status ?? "ready");
  const bridge = String(args.bridge ?? DEFAULT_BRIDGE);
  const url = optionalString(args.url);
  const outPath = optionalString(args.out);
  const evidence = readEvidence(outPath);

  if (evidence.doneLock === true && evidence.finalVerify.businessVerified === true) {
    evidence.status = "pass";
    evidence.allowedNextActions = ["write_result", "cleanup"];
    evidence.nextAction = null;
    writeEvidence(outPath, evidence);
    writeJson({
      status: "pass",
      doneLock: true,
      terminal: true,
      finalVerify: evidence.finalVerify,
      allowedNextActions: evidence.allowedNextActions
    });
    return EXIT_PASS;
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
    evidence.allowedNextActions = ["write_result", "cleanup"];
    evidence.discoveryProbe.mustAddTarget = false;
    evidence.nextAction = null;
    writeEvidence(outPath, evidence);
    writeJson({
      status: "pass",
      doneLock: true,
      terminal: true,
      finalVerify: evidence.finalVerify,
      allowedNextActions: evidence.allowedNextActions
    });
    return EXIT_PASS;
  }

  const exhausted = evidence.attempts.verify >= MAX_ATTEMPTS;
  evidence.status = exhausted ? "fail" : "action_required";
  evidence.nextAction = exhausted
    ? {
        type: "blocked",
        summary: `Business verification did not pass after ${MAX_ATTEMPTS} attempts.`,
        previousAction: createVerifyNextAction(evidence.finalVerify)
      }
    : createVerifyNextAction(evidence.finalVerify);
  writeEvidence(outPath, evidence);
  writeJson({
    status: evidence.status,
    finalVerify: evidence.finalVerify,
    attempts: evidence.attempts.verify,
    maxAttempts: MAX_ATTEMPTS,
    nextAction: evidence.nextAction
  });
  return exhausted ? EXIT_FAIL : EXIT_ACTION_REQUIRED;
}

async function runRecordProbe(args) {
  const type = requireOption(args, "type");
  const outPath = optionalString(args.out);
  const evidence = readEvidence(outPath);

  if (!LOW_LEVEL_PROBE_TYPES.has(type)) {
    throw new Error(`Invalid --type "${type}". Expected one of: ${[...LOW_LEVEL_PROBE_TYPES].join(", ")}.`);
  }

  if (evidence.doneLock === true) {
    const violation = addViolation(evidence, `Discovery probe "${type}" was attempted after doneLock=true.`);
    evidence.status = "fail";
    evidence.nextAction = {
      type: "blocked",
      summary: "Final verify already passed. Only writing results and cleanup are allowed.",
      violation
    };
    writeEvidence(outPath, evidence);
    writeJson({
      status: "fail",
      doneLock: true,
      violation,
      nextAction: evidence.nextAction
    });
    return EXIT_FAIL;
  }

  if (evidence.discoveryProbe.mustAddTarget === true) {
    const violation = addViolation(evidence, "A previous discovery probe has not been converted into a business/debug target.");
    evidence.status = "fail";
    evidence.nextAction = createAddTargetAfterProbeNextAction(getLastProbeRecord(evidence));
    writeEvidence(outPath, evidence);
    writeJson({
      status: "fail",
      violation,
      discoveryProbe: evidence.discoveryProbe,
      nextAction: evidence.nextAction
    });
    return EXIT_FAIL;
  }

  const record = {
    type,
    summary: optionalString(args.summary) ?? null,
    url: optionalString(args.url) ?? null,
    recordedAt: new Date().toISOString()
  };
  evidence.discoveryProbe.usedCount += 1;
  evidence.discoveryProbe.lastType = type;
  evidence.discoveryProbe.mustAddTarget = true;
  evidence.discoveryProbe.records.push(record);
  evidence.status = "action_required";
  evidence.nextAction = createAddTargetAfterProbeNextAction(record);
  writeEvidence(outPath, evidence);
  writeJson({
    status: "action_required",
    discoveryProbe: evidence.discoveryProbe,
    nextAction: evidence.nextAction
  });
  return EXIT_ACTION_REQUIRED;
}

async function runTargetAdded(args) {
  const targetId = requireOption(args, "target");
  const outPath = optionalString(args.out);
  const evidence = readEvidence(outPath);
  const kind = optionalString(args.kind) ?? inferTargetKind(targetId);

  if (kind !== "business" && kind !== "debug") {
    throw new Error(`Invalid target kind "${kind}". Use --kind business or --kind debug.`);
  }

  if (evidence.doneLock === true) {
    const violation = addViolation(evidence, `Target "${targetId}" was recorded after doneLock=true.`);
    evidence.status = "fail";
    evidence.nextAction = {
      type: "blocked",
      summary: "Final verify already passed. Only writing results and cleanup are allowed.",
      violation
    };
    writeEvidence(outPath, evidence);
    writeJson({
      status: "fail",
      doneLock: true,
      violation,
      nextAction: evidence.nextAction
    });
    return EXIT_FAIL;
  }

  evidence.discoveryProbe.mustAddTarget = false;
  evidence.targetGate = {
    required: false,
    satisfied: true,
    targetId,
    kind,
    recordedAt: new Date().toISOString()
  };
  evidence.status = evidence.doneLock === true ? "pass" : "action_required";
  evidence.nextAction = evidence.doneLock === true
    ? null
    : createUseStructuredEvidenceNextAction(targetId, kind);
  writeEvidence(outPath, evidence);
  writeJson({
    status: "pass",
    targetGate: evidence.targetGate,
    discoveryProbe: evidence.discoveryProbe,
    doneLock: evidence.doneLock,
    nextAction: evidence.nextAction
  });
  return EXIT_PASS;
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
  return {
    install: Array.isArray(parsed.install) ? parsed.install : [],
    use: Array.isArray(parsed.use) ? parsed.use : []
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
      reference: "skills/openruntime/references/module-federation.md",
      summary: "Wire @module-federation/observability-plugin in the MF/Vmok consumer if mf:* targets are required."
    });
  }

  if (use.has("@openruntime/modern-plugin")) {
    return {
      type: "connect_modern_plugin",
      summary: "No connected runtime was found. Wire the Modern plugin with a Bridge port in source, restart the app, then rerun this connected check.",
      commands: install,
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
    summary: "No connected runtime was found. Install a Core runtime at the app entry, connect Bridge in source, restart the app, then rerun this connected check.",
    commands: install,
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

function createRunVerifyNextAction() {
  return {
    type: "run_final_verify",
    summary: "Runtime is connected. After fixing the task, run workflow verify with a business target."
  };
}

function createAddTargetAfterProbeNextAction(record) {
  return {
    type: "add_observability_target",
    summary: "A low-level discovery probe was used. Convert the probe result into a business/debug target before any further low-level probing.",
    probe: record ?? null,
    commands: [
      "node <openruntime-skill-dir>/scripts/workflow.mjs target-added --target <business-or-debug-target-id> --kind <business|debug> --out openruntime-evidence.json"
    ],
    snippets: [
      {
        pathHint: "stable business component, loader, or error boundary",
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
      },
      {
        pathHint: "stable error boundary or runtime error handler",
        language: "ts",
        code: `runtime.registerTarget({
  id: "debug:<area>:runtime-error",
  type: "debug.runtime-error",
  statuses: ["ready", "error"],
  source: "<app-or-package>",
});

runtime.updateSnapshot({
  id: "debug:<area>:runtime-error",
  status: "error",
  data: {
    message: error.message,
    stack: error.stack,
  },
});`
      }
    ]
  };
}

function createUseStructuredEvidenceNextAction(targetId, kind) {
  if (kind === "business") {
    return {
      type: "use_structured_business_evidence",
      summary: "Target was added. Continue with snapshot/events/wait-for/verify only; do not run another low-level probe unless structured evidence is still insufficient.",
      target: targetId,
      allowedCommands: [
        "pnpm exec openruntime snapshot --id <target-id> --url <app-url>",
        "pnpm exec openruntime events --target-id <target-id> --url <app-url> --limit 50",
        "pnpm exec openruntime wait-for <target-id> ready --url <app-url>",
        "node <openruntime-skill-dir>/scripts/workflow.mjs verify --target <target-id> --status ready --bridge http://localhost:17321 --url <app-url> --out openruntime-evidence.json"
      ]
    };
  }

  return {
    type: "use_structured_debug_evidence",
    summary: "Debug target was added. Continue with snapshot/events only, patch the issue, then add or use a business target for final verify.",
    target: targetId,
    allowedCommands: [
      "pnpm exec openruntime snapshot --id <target-id> --url <app-url>",
      "pnpm exec openruntime events --target-id <target-id> --url <app-url> --limit 50"
    ]
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
      use: []
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
    discoveryProbe: {
      usedCount: 0,
      lastType: null,
      mustAddTarget: false,
      records: []
    },
    targetGate: {
      required: false,
      satisfied: false,
      targetId: null,
      kind: null,
      recordedAt: null
    },
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
      ...parsed.integration
    },
    connected: {
      ...base.connected,
      ...parsed.connected
    },
    open: {
      ...base.open,
      ...parsed.open
    },
    finalVerify: {
      ...base.finalVerify,
      ...parsed.finalVerify
    },
    discoveryProbe: {
      ...base.discoveryProbe,
      ...parsed.discoveryProbe,
      records: Array.isArray(parsed.discoveryProbe?.records)
        ? parsed.discoveryProbe.records
        : base.discoveryProbe.records
    },
    targetGate: {
      ...base.targetGate,
      ...parsed.targetGate
    }
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

function getLastProbeRecord(evidence) {
  return evidence.discoveryProbe.records[evidence.discoveryProbe.records.length - 1] ?? null;
}

function inferTargetKind(targetId) {
  if (targetId.startsWith("business:")) return "business";
  if (targetId.startsWith("debug:") || targetId.includes("runtime-error")) return "debug";
  return "unknown";
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
  workflow.mjs connected --package-json <path> --bridge <url> --url <app-url> --out <file>
  workflow.mjs verify --target <id> --status <status> --bridge <url> --url <app-url> --out <file>
  workflow.mjs record-probe --type <console|network|page-snapshot|eval|wait-eval> --summary <text> --out <file>
  workflow.mjs target-added --target <id> --kind <business|debug> --out <file>
`);
}
