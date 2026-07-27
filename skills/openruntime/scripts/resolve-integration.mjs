#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const MODERN_PLUGIN_MIN_VERSION = "3.4.0";
const modernPackages = [
  "@modern-js/runtime",
  "@modern-js/plugin",
  "@modern-js/app-tools"
];
const mfObservabilityPackage = "@module-federation/observability-plugin";
const mfDependencySignals = [
  "@module-federation/enhanced",
  "@module-federation/"
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
  const result = resolveIntegration({ dependencies });

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

function resolveIntegration({ dependencies }) {
  const modern = resolveModern(dependencies);
  const moduleFederation = resolveModuleFederation(dependencies);
  const install = dedupe([
    ...modern.install,
    ...moduleFederation.install
  ]);
  const use = dedupe([
    ...modern.use,
    ...moduleFederation.use
  ]);

  return {
    install,
    use
  };
}

function resolveModern(dependencies) {
  const versions = {};
  for (const name of modernPackages) {
    if (dependencies[name] !== undefined) {
      versions[name] = String(dependencies[name]);
    }
  }

  const detected = Object.keys(versions).length > 0;
  const versionEntries = Object.entries(versions).map(([name, range]) => ({
    name,
    range,
    parsed: parseVersion(range),
    isPreview: /preview/i.test(range)
  }));
  const hasSupportedVersion = versionEntries.some((entry) =>
    entry.isPreview || compareVersions(entry.parsed, parseVersion(MODERN_PLUGIN_MIN_VERSION)) >= 0
  );
  const hasModernPlugin = dependencies["@openruntime/modern-plugin"] !== undefined;
  const hasCore = dependencies["@openruntime/core"] !== undefined;

  if (!detected) {
    return {
      detected: false,
      versionGate: {
        minVersion: MODERN_PLUGIN_MIN_VERSION,
        previewAllowed: true,
        satisfied: false
      },
      versions,
      install: [],
      use: []
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
      install: hasModernPlugin ? [] : ["@openruntime/modern-plugin"],
      use: ["@openruntime/modern-plugin"]
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
    install: hasCore ? [] : ["@openruntime/core"],
    use: ["@openruntime/core"]
  };
}

function resolveModuleFederation(dependencies) {
  const dependencyNames = Object.keys(dependencies);
  const detected = dependencyNames.some((name) => isMfDependency(name));
  const hasObservability = dependencies[mfObservabilityPackage] !== undefined;

  if (!detected) {
    return {
      detected: false,
      versionGate: {
        required: false
      },
      install: [],
      use: []
    };
  }

  return {
    detected: true,
    versionGate: {
      required: false
    },
    install: hasObservability ? [] : [mfObservabilityPackage],
    use: [mfObservabilityPackage]
  };
}

function isMfDependency(name) {
  return mfDependencySignals.some((signal) =>
    signal.endsWith("/")
      ? name.startsWith(signal)
      : name === signal
  );
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
