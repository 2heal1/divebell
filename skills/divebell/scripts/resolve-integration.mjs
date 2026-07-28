#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

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
    "Usage: node skills/divebell/scripts/resolve-integration.mjs <path-to-package.json>\n"
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
  const notices = modern.detected
    ? [{
        integration: "@divebell/modern-plugin",
        status: "wip",
        reason: "Waiting for a Modern.js release with the required lifecycle hooks.",
        fallback: "@divebell/core"
      }]
    : [];

  return {
    install,
    use,
    notices
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
  const hasCore = dependencies["@divebell/core"] !== undefined;

  if (!detected) {
    return {
      detected: false,
      versionGate: {
        status: "wip",
        satisfied: false
      },
      versions,
      install: [],
      use: []
    };
  }

  return {
    detected: true,
    versionGate: {
      status: "wip",
      satisfied: false
    },
    versions,
    install: hasCore ? [] : ["@divebell/core"],
    use: ["@divebell/core"]
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

function dedupe(items) {
  return [...new Set(items)];
}

try {
  main();
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
