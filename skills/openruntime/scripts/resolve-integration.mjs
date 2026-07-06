#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MODERN_PLUGIN_MIN_VERSION = "3.4.0";
const SOURCE_FILE_EXTENSIONS = new Set([
  ".cjs",
  ".cts",
  ".html",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx"
]);
const SOURCE_SCAN_EXCLUDED_DIRECTORIES = new Set([
  ".cache",
  ".eden-mono",
  ".git",
  ".next",
  ".openruntime",
  ".output",
  ".turbo",
  ".vmok",
  "build",
  "coverage",
  "dist",
  "node_modules"
]);
const SOURCE_SCAN_MAX_BYTES = 512 * 1024;
const SOURCE_SCAN_MAX_FILES = 2000;
const modernPackages = [
  "@modern-js/runtime",
  "@modern-js/plugin",
  "@modern-js/app-tools"
];
const openRuntimeCorePackage = "@openruntime/core";
const openRuntimeModernPluginPackage = "@openruntime/modern-plugin";
const mfObservabilityPackage = "@module-federation/observability-plugin";
const packageInstallSpecEnvironment = {
  [openRuntimeCorePackage]: "OPENRUNTIME_CORE_PACKAGE",
  [openRuntimeModernPluginPackage]: "OPENRUNTIME_MODERN_PLUGIN_PACKAGE",
  [mfObservabilityPackage]: "OPENRUNTIME_MF_OBSERVABILITY_PACKAGE"
};
const mfDependencySignals = [
  "@module-federation/enhanced",
  "@module-federation/"
];
const vmokDependencySignals = [
  "vmok"
];

function main() {
  const args = parseArgs(process.argv.slice(2));
  const packageJsonPath = args.packageJson ?? args._[0];
  if (packageJsonPath === undefined || packageJsonPath.trim() === "") {
    usage();
    process.exitCode = 1;
    return;
  }

  const resolvedPackageJsonPath = path.resolve(packageJsonPath);
  const packageJson = readPackageJson(resolvedPackageJsonPath);
  const dependencies = collectDependencies(packageJson);
  const result = resolveIntegration({
    dependencies,
    packageJsonPath: resolvedPackageJsonPath,
    projectRoot: path.dirname(resolvedPackageJsonPath)
  });

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
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

function usage() {
  process.stderr.write(
    "Usage: node skills/openruntime/scripts/resolve-integration.mjs <path-to-package.json>\n"
  );
}

function readPackageJson(packageJsonPath) {
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(`package.json not found: ${packageJsonPath}`);
  }

  const content = fs.readFileSync(packageJsonPath, "utf8");
  return JSON.parse(content);
}

function collectDependencies(packageJson) {
  return {
    ...packageJson.dependencies,
    ...packageJson.devDependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies
  };
}

function resolveIntegration({ dependencies, packageJsonPath, projectRoot }) {
  const modern = resolveModern(dependencies);
  const moduleFederation = resolveModuleFederation(dependencies);
  const requiredPackages = dedupe([
    ...modern.requiredPackages,
    ...moduleFederation.requiredPackages
  ]);
  const requiredUsage = dedupe([
    ...modern.usage,
    ...moduleFederation.usage
  ]);
  const dependencyStatus = resolveDependencyStatus({
    dependencies,
    packageJsonPath,
    projectRoot,
    requiredPackages
  });
  const detectedUsage = detectUsage(projectRoot, requiredUsage);

  return {
    dependency: dependencyStatus,
    usage: {
      checkedFrom: [projectRoot],
      required: requiredUsage,
      detected: detectedUsage,
      missing: requiredUsage.filter((item) => !detectedUsage.includes(item))
    },
    install: dependencyStatus.install,
    use: requiredPackages,
    required: requiredPackages.length > 0 || requiredUsage.length > 0
  };
}

function resolveDependencyStatus({ dependencies, packageJsonPath, projectRoot, requiredPackages }) {
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

function resolveModern(dependencies) {
  const versions = {};
  for (const name of modernPackages) {
    if (dependencies[name] !== undefined) {
      versions[name] = String(dependencies[name]);
    }
  }

  const detected = Object.keys(versions).length > 0 || dependencies.edenx !== undefined || dependencies["@edenx/app-tools"] !== undefined;
  const versionEntries = Object.entries(versions).map(([name, range]) => ({
    name,
    range,
    parsed: parseVersion(range),
    isPreview: /preview/i.test(range)
  }));
  const hasSupportedVersion = versionEntries.some((entry) =>
    entry.isPreview || compareVersions(entry.parsed, parseVersion(MODERN_PLUGIN_MIN_VERSION)) >= 0
  );
  if (!detected) {
    return {
      detected: false,
      versionGate: {
        minVersion: MODERN_PLUGIN_MIN_VERSION,
        previewAllowed: true,
        satisfied: false
      },
      versions,
      requiredPackages: [],
      usage: []
    };
  }

  if (hasSupportedVersion) {
    return {
      detected: true,
      versionGate: {
        minVersion: MODERN_PLUGIN_MIN_VERSION,
        previewAllowed: true,
        satisfied: true
      },
      versions,
      requiredPackages: [openRuntimeModernPluginPackage],
      usage: ["modern_plugin"]
    };
  }

  return {
    detected: true,
    versionGate: {
      minVersion: MODERN_PLUGIN_MIN_VERSION,
      previewAllowed: true,
      satisfied: false
    },
    versions,
    requiredPackages: [openRuntimeCorePackage],
    usage: ["core_runtime"]
  };
}

function resolveModuleFederation(dependencies) {
  const dependencyNames = Object.keys(dependencies);
  const detected = dependencyNames.some((name) => isMfDependency(name) || isVmokDependency(name));

  if (!detected) {
    return {
      detected: false,
      versionGate: {
        required: false
      },
      requiredPackages: [],
      usage: []
    };
  }

  return {
    detected: true,
    versionGate: {
      required: false
    },
    requiredPackages: [mfObservabilityPackage],
    usage: ["mf_observability"]
  };
}

function detectUsage(projectRoot, requiredUsage) {
  if (requiredUsage.length === 0) return [];
  const content = readProjectSourceContent(projectRoot);
  const detected = [];
  if (requiredUsage.includes("core_runtime") && detectsCoreRuntimeUsage(content)) {
    detected.push("core_runtime");
  }
  if (requiredUsage.includes("modern_plugin") && detectsModernPluginUsage(content)) {
    detected.push("modern_plugin");
  }
  if (requiredUsage.includes("mf_observability") && detectsMfObservabilityUsage(content)) {
    detected.push("mf_observability");
  }
  return detected;
}

function readProjectSourceContent(projectRoot) {
  const chunks = [];
  let scannedFiles = 0;

  function walk(directory) {
    if (scannedFiles >= SOURCE_SCAN_MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(directory, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (scannedFiles >= SOURCE_SCAN_MAX_FILES) return;
      const entryPath = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        if (!SOURCE_SCAN_EXCLUDED_DIRECTORIES.has(entry.name)) {
          walk(entryPath);
        }
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SOURCE_FILE_EXTENSIONS.has(path.extname(entry.name))) continue;

      try {
        const stat = fs.statSync(entryPath);
        if (stat.size > SOURCE_SCAN_MAX_BYTES) continue;
        chunks.push(fs.readFileSync(entryPath, "utf8"));
        scannedFiles += 1;
      } catch {
        // Ignore unreadable generated or transient files.
      }
    }
  }

  walk(projectRoot);
  return chunks.join("\n");
}

function detectsCoreRuntimeUsage(content) {
  return (
    content.includes(openRuntimeCorePackage) &&
    /(?:createOpenRuntime|installOpenRuntimeOnWindow|connectBridge)\s*\(/.test(content)
  ) || (
    /connectBridge\s*\(/.test(content) &&
    /openruntime/i.test(content)
  );
}

function detectsModernPluginUsage(content) {
  return content.includes(openRuntimeModernPluginPackage) ||
    /openRuntimeModernPlugin\s*\(/.test(content);
}

function detectsMfObservabilityUsage(content) {
  return content.includes(mfObservabilityPackage) ||
    /ObservabilityPlugin\s*\(/.test(content);
}

function isMfDependency(name) {
  return mfDependencySignals.some((signal) =>
    signal.endsWith("/")
      ? name.startsWith(signal)
      : name === signal
  );
}

function isVmokDependency(name) {
  const normalizedName = name.toLowerCase();
  return vmokDependencySignals.some((signal) => normalizedName.includes(signal));
}

function parseVersion(input) {
  const match = String(input).match(/(\d+)\.(\d+)\.(\d+)/);
  if (match === null) {
    return [0, 0, 0];
  }

  return [
    Number(match[1]),
    Number(match[2]),
    Number(match[3])
  ];
}

function compareVersions(left, right) {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] > right[index]) return 1;
    if (left[index] < right[index]) return -1;
  }
  return 0;
}

function dedupe(items) {
  return [...new Set(items)];
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
