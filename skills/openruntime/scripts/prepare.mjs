#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const EXIT_PASS = 0;
const EXIT_FAIL = 1;
const EXIT_ACTION_REQUIRED = 2;

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const resolveIntegrationScript = path.join(scriptDir, "resolve-integration.mjs");
const openRuntimeCliPackage = "@openruntime/cli";
const packageInstallSpecEnvironment = {
  [openRuntimeCliPackage]: "OPENRUNTIME_CLI_PACKAGE"
};

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify({
    status: "fail",
    error: message
  }, null, 2)}\n`);
  process.stderr.write(`${message}\n`);
  process.exitCode = EXIT_FAIL;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJsonPath = args.packageJson ?? args._[0];
  if (packageJsonPath === undefined || packageJsonPath.trim() === "") {
    usage();
    process.exitCode = EXIT_FAIL;
    return;
  }

  const resolvedPackageJsonPath = path.resolve(packageJsonPath);
  const sourceEditable = parseBooleanOption(args.sourceEditable, true);
  const sourceAffectsPage = parseBooleanOption(args.sourceAffectsPage, true);
  if (sourceEditable !== true || sourceAffectsPage !== true) {
    writeBrowserCliPrepare({
      packageJsonPath: resolvedPackageJsonPath,
      sourceEditable,
      sourceAffectsPage
    });
    return;
  }

  const integration = runResolveIntegration(resolvedPackageJsonPath);
  const dependency = normalizeDependencyStatus(integration.dependency);
  const usage = normalizeUsageStatus(integration.usage);
  const install = dependency.install;
  const use = Array.isArray(integration.use)
    ? integration.use.filter((item) => typeof item === "string")
    : dependency.required;
  const nextAction = createNextAction({ dependency, usage, install, use });
  const status = nextAction.type === "continue_workflow" ? "pass" : "action_required";

  process.stdout.write(`${JSON.stringify({
    status,
    packageJson: resolvedPackageJsonPath,
    mode: "source_integration",
    sourceEditable,
    sourceAffectsPage,
    dependency,
    usage,
    install,
    use,
    required: integration.required === true || dependency.required.length > 0 || usage.required.length > 0,
    nextAction
  }, null, 2)}\n`);
  process.exitCode = status === "pass" ? EXIT_PASS : EXIT_ACTION_REQUIRED;
}

function writeBrowserCliPrepare({ packageJsonPath, sourceEditable, sourceAffectsPage }) {
  const packageJson = readPackageJson(packageJsonPath);
  const dependencies = collectDependencies(packageJson);
  const dependency = resolveRequiredPackageStatus({
    dependencies,
    packageJsonPath,
    projectRoot: path.dirname(packageJsonPath),
    requiredPackages: [openRuntimeCliPackage]
  });
  const install = dependency.install;
  const status = install.length > 0 ? "action_required" : "pass";
  const nextAction = install.length > 0
    ? {
        type: "install_openruntime_cli",
        required: true,
        commands: createCliInstallCommands(dependency.installSpecs),
        install,
        installSpecs: dependency.installSpecs,
        dependency,
        afterInstall: {
          type: "use_browser_cli"
        }
      }
    : {
        type: "use_browser_cli",
        required: false,
        commands: [
          "pnpm exec openruntime open <app-url> --bridge http://localhost:17321"
        ],
        allowedCommands: [
          "open",
          "console",
          "network",
          "page-snapshot",
          "eval",
          "wait-eval",
          "screenshot",
          "close"
        ]
      };

  process.stdout.write(`${JSON.stringify({
    status,
    packageJson: packageJsonPath,
    mode: "browser_cli",
    sourceEditable,
    sourceAffectsPage,
    reason: sourceEditable !== true
      ? "source_not_editable"
      : "source_changes_do_not_affect_page",
    dependency,
    usage: {
      checkedFrom: [],
      required: ["browser_cli"],
      detected: [],
      missing: [],
      unknown: []
    },
    install,
    use: [openRuntimeCliPackage],
    required: false,
    nextAction
  }, null, 2)}\n`);
  process.exitCode = status === "pass" ? EXIT_PASS : EXIT_ACTION_REQUIRED;
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
      args[toCamelCase(arg.slice(2, eqIndex))] = arg.slice(eqIndex + 1);
      continue;
    }

    const key = toCamelCase(arg.slice(2));
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

function toCamelCase(value) {
  return value.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

function usage() {
  process.stderr.write(
    "Usage: node skills/openruntime/scripts/prepare.mjs --package-json <path-to-package.json> [--source-editable true|false] [--source-affects-page true|false]\n"
  );
}

function runResolveIntegration(packageJsonPath) {
  const result = spawnSync(process.execPath, [resolveIntegrationScript, packageJsonPath], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024
  });
  if (result.status !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || "resolve-integration failed.");
  }
  return JSON.parse(result.stdout);
}

function normalizeDependencyStatus(value) {
  const required = stringArray(value?.required);
  const declared = stringArray(value?.declared);
  const installed = stringArray(value?.installed);
  const missing = stringArray(value?.missing);
  const invalid = Array.isArray(value?.invalid)
    ? value.invalid.filter((item) =>
        item !== null &&
        typeof item === "object" &&
        typeof item.name === "string" &&
        typeof item.reason === "string"
      )
    : [];
  const install = stringArray(value?.install, [
    ...missing,
    ...invalid.map((item) => item.name)
  ]);
  const installSpecs = stringArray(value?.installSpecs, install);
  return {
    checkedFrom: stringArray(value?.checkedFrom),
    required,
    declared,
    installed,
    missing,
    invalid,
    install,
    installSpecs
  };
}

function readPackageJson(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found: ${packageJsonPath}`);
  }
  return JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
}

function collectDependencies(packageJson) {
  return {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies
  };
}

function resolveRequiredPackageStatus({ dependencies, packageJsonPath, projectRoot, requiredPackages }) {
  const checkedFrom = [packageJsonPath];
  const declared = [];
  const installed = [];
  const missing = [];
  const invalid = [];

  for (const name of requiredPackages) {
    if (dependencies[name] === undefined) {
      missing.push(name);
      continue;
    }

    declared.push(name);
    const installation = inspectPackageInstallation(projectRoot, name);
    checkedFrom.push(installation.checkedFrom);
    if (installation.ok) {
      installed.push(name);
    } else {
      invalid.push({
        name,
        reason: installation.reason,
        checkedFrom: installation.checkedFrom,
        entry: installation.entry ?? null
      });
    }
  }

  const install = dedupe([
    ...missing,
    ...invalid.map((item) => item.name)
  ]);
  return {
    checkedFrom: dedupe(checkedFrom),
    required: requiredPackages,
    declared,
    installed,
    missing,
    invalid,
    install,
    installSpecs: install.map((name) => resolveInstallSpec(name))
  };
}

function inspectPackageInstallation(projectRoot, name) {
  const packageRoot = path.join(projectRoot, "node_modules", ...name.split("/"));
  const packageJsonPath = path.join(packageRoot, "package.json");
  if (!fs.existsSync(packageJsonPath)) {
    return {
      ok: false,
      checkedFrom: packageJsonPath,
      reason: "package_json_not_found"
    };
  }

  let packageJson;
  try {
    packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  } catch {
    return {
      ok: false,
      checkedFrom: packageJsonPath,
      reason: "package_json_invalid"
    };
  }

  const entry = resolvePackageEntry(packageJson);
  if (entry === null) {
    return {
      ok: false,
      checkedFrom: packageJsonPath,
      reason: "package_entry_not_declared"
    };
  }

  const entryPath = path.join(packageRoot, entry);
  if (!fs.existsSync(entryPath)) {
    return {
      ok: false,
      checkedFrom: packageJsonPath,
      reason: "package_entry_not_found",
      entry
    };
  }

  return {
    ok: true,
    checkedFrom: packageJsonPath,
    entry
  };
}

function resolvePackageEntry(packageJson) {
  const exported = packageJson.exports?.["."] ?? packageJson.exports;
  const exportEntry = typeof exported === "string"
    ? exported
    : firstString([
        exported?.browser,
        exported?.import,
        exported?.default,
        exported?.require
      ]);
  const entry = firstString([
    exportEntry,
    packageJson.module,
    packageJson.main
  ]);
  return entry === null ? null : entry.replace(/^\.\//, "");
}

function firstString(values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim() !== "") return value;
  }
  return null;
}

function resolveInstallSpec(name) {
  const envName = packageInstallSpecEnvironment[name];
  const envValue = envName === undefined ? undefined : process.env[envName];
  return typeof envValue === "string" && envValue.trim() !== ""
    ? envValue.trim()
    : name;
}

function parseBooleanOption(value, fallback) {
  if (value === undefined) return fallback;
  if (value === true) return true;
  if (value === false) return false;
  const normalized = String(value).trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  throw new Error(`Expected boolean option, got: ${value}`);
}

function normalizeUsageStatus(value) {
  const required = stringArray(value?.required);
  const detected = stringArray(value?.detected);
  const missing = stringArray(value?.missing, required.filter((item) => !detected.includes(item)));
  return {
    checkedFrom: stringArray(value?.checkedFrom),
    required,
    detected,
    missing,
    unknown: []
  };
}

function stringArray(value, fallback = []) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string")
    : fallback;
}

function createNextAction({ dependency, usage, install, use }) {
  if (install.length > 0) {
    return {
      type: "install_missing_dependencies",
      required: true,
      commands: createInstallCommands(dependency.installSpecs),
      install,
      installSpecs: dependency.installSpecs,
      dependency,
      afterInstall: {
        type: usage.missing.length > 0 ? "apply_required_usage" : "continue_workflow"
      }
    };
  }

  if (usage.missing.length > 0) {
    return {
      type: "apply_required_usage",
      required: true,
      use,
      usage,
      afterApply: {
        type: "open_page"
      }
    };
  }

  return {
    type: "continue_workflow",
    required: false
  };
}

function createInstallCommands(installSpecs) {
  return installSpecs.length > 0
    ? [`pnpm add ${installSpecs.join(" ")}`]
    : [];
}

function createCliInstallCommands(installSpecs) {
  return installSpecs.length > 0
    ? [`pnpm add -D ${installSpecs.join(" ")}`]
    : [];
}

function dedupe(items) {
  return [...new Set(items)];
}
