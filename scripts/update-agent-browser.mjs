import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const repoRoot = resolve(dirname(scriptPath), "..");
const cliPackagePath = join(repoRoot, "packages/cli/package.json");
const recordingRuntimeManifestPath = join(
  repoRoot,
  "skills/record-divebell-workflow/references/divebell-cli-runtime.json"
);
const cliRequire = createRequire(cliPackagePath);

export function parseUpdateAgentBrowserArguments(args) {
  const normalizedArgs = args.filter((argument) => argument !== "--");
  if (normalizedArgs.includes("--help")) return { help: true };

  const supportedFlags = new Set(["--no-verify"]);
  const unknownFlag = normalizedArgs.find(
    (argument) => argument.startsWith("-") && !supportedFlags.has(argument)
  );
  if (unknownFlag) {
    throw new Error(`Unknown option: ${unknownFlag}\n\n${usage()}`);
  }

  const versions = normalizedArgs.filter(
    (argument) => !argument.startsWith("-")
  );
  if (versions.length !== 1 || !isExactSemanticVersion(versions[0])) {
    throw new Error(
      `Provide exactly one exact semantic version, such as 0.35.0-divebell.1.\n\n${usage()}`
    );
  }

  return {
    help: false,
    version: versions[0],
    verify: !normalizedArgs.includes("--no-verify")
  };
}

export function createUpdateAgentBrowserSteps(version, { verify = true } = {}) {
  const steps = [
    {
      label: `install @divebell/agent-browser@${version}`,
      command: "pnpm",
      args: [
        "--filter",
        "@divebell/cli",
        "add",
        "--save-exact",
        `@divebell/agent-browser@${version}`
      ]
    },
    {
      label: "regenerate Extension browser.raw Skill references",
      command: "pnpm",
      args: ["run", "docs:raw"]
    }
  ];

  if (verify) {
    steps.push(
      {
        label: "check generated browser.raw references",
        command: "pnpm",
        args: ["run", "docs:raw:check"]
      },
      {
        label: "run script contract tests",
        command: "pnpm",
        args: ["run", "test:release-script"]
      },
      {
        label: "build and test @divebell/cli",
        command: "pnpm",
        args: ["--filter", "@divebell/cli", "test"]
      },
      {
        label: "lint the repository",
        command: "pnpm",
        args: ["run", "lint"]
      }
    );
  }

  return steps;
}

function isExactSemanticVersion(version) {
  return /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(
    version
  );
}

function assertInstalledAgentBrowserVersion(expectedVersion) {
  const cliPackage = JSON.parse(readFileSync(cliPackagePath, "utf8"));
  const declaredVersion = cliPackage.dependencies?.["@divebell/agent-browser"];
  if (declaredVersion !== expectedVersion) {
    throw new Error(
      `packages/cli must pin @divebell/agent-browser exactly to ${expectedVersion}; found ${String(declaredVersion)}.`
    );
  }

  const installedPackagePath = cliRequire.resolve(
    "@divebell/agent-browser/package.json"
  );
  const installedPackage = JSON.parse(
    readFileSync(installedPackagePath, "utf8")
  );
  if (installedPackage.version !== expectedVersion) {
    throw new Error(
      `Installed @divebell/agent-browser is ${installedPackage.version}; expected ${expectedVersion}.`
    );
  }
}

export function updateRecordingRuntimeAgentBrowser(manifest, version) {
  if (manifest === null || typeof manifest !== "object" || !Array.isArray(manifest.packages)) {
    throw new Error("Invalid recording runtime manifest.");
  }

  const matches = manifest.packages.filter(
    (item) => item?.name === "@divebell/agent-browser"
  );
  if (matches.length !== 1 || matches[0].source !== "registry") {
    throw new Error(
      "Recording runtime manifest must contain one registry @divebell/agent-browser package."
    );
  }

  return {
    ...manifest,
    packages: manifest.packages.map((item) =>
      item.name === "@divebell/agent-browser"
        ? {
            ...item,
            specifier: `@divebell/agent-browser@${version}`,
            file: `divebell-agent-browser-${version}.tgz`
          }
        : item
    )
  };
}

function synchronizeRecordingRuntimeAgentBrowser(version) {
  const manifest = JSON.parse(readFileSync(recordingRuntimeManifestPath, "utf8"));
  const updated = updateRecordingRuntimeAgentBrowser(manifest, version);
  writeFileSync(
    recordingRuntimeManifestPath,
    `${JSON.stringify(updated, null, 2)}\n`,
    "utf8"
  );
}

function runStep(step) {
  console.log(`\n[agent-browser:update] ${step.label}`);
  const result = spawnSync(step.command, step.args, {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit"
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function usage() {
  return [
    "Usage:",
    "  pnpm run update:agent-browser -- <exact-version> [--no-verify]",
    "",
    "Example:",
    "  pnpm run update:agent-browser -- 0.35.0-divebell.1"
  ].join("\n");
}

const isEntryPoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === scriptPath;

if (isEntryPoint) {
  try {
    const options = parseUpdateAgentBrowserArguments(process.argv.slice(2));
    if (options.help) {
      console.log(usage());
    } else {
      const steps = createUpdateAgentBrowserSteps(options.version, options);
      runStep(steps[0]);
      assertInstalledAgentBrowserVersion(options.version);
      synchronizeRecordingRuntimeAgentBrowser(options.version);
      for (const step of steps.slice(1)) runStep(step);
      console.log(
        `\n[agent-browser:update] @divebell/agent-browser@${options.version} and its Skill references are synchronized.`
      );
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
