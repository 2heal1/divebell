import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  createDivebellCli,
  createDivebellCliWithExternalExtensions,
  validateExtension
} from "@divebell/cli";
import { implementedMfCommandMetadata } from "../dist/commands/metadata.js";

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packageJson = JSON.parse(readFileSync(resolve(packageRoot, "package.json"), "utf8"));
const packageArchiveName = `${
  packageJson.name.replace(/^@/, "").replaceAll("/", "-")
}-${packageJson.version}.tgz`;

test("extension manifest is valid and implementation stays lazy", async () => {
  const extensionModule = await import(
    pathToFileURL(resolve(packageRoot, "dist/extension.js")).href
  );
  const extension = extensionModule.default;
  const validated = validateExtension(extension);
  assert.equal(validated.name, "mf");
  assert.match(validated.description, /divebell open <url> --mf/);
  assert.deepEqual(validated.commands.map((command) => command.name), ["mf"]);
  assert.equal(existsSync(validated.commands[0].skill.path), true);
  assert.match(
    validated.commands[0].skill.path,
    /skills\/inspect-module-federation\/SKILL\.md$/
  );
  assert.equal(typeof validated.hooks.open, "function");
  assert.equal(typeof validated.hooks.detectStack, "function");
  const entrySource = readFileSync(resolve(packageRoot, "dist/extension.js"), "utf8");
  assert.match(entrySource, /import\("\.\/index\.js"\)/);
  assert.match(entrySource, /import\("\.\/open\.js"\)/);
  assert.match(entrySource, /import\("\.\/detect-stack\.js"\)/);
  assert.doesNotMatch(entrySource, /module-performance\/format/);
  assert.doesNotMatch(entrySource, /getRuntimeState|readFile/);
  const commandSource = readFileSync(resolve(packageRoot, "dist/index.js"), "utf8");
  assert.match(commandSource, /import\("\.\/module-performance\/format\.js"\)/);
  const commandReferences = validated.commands[0].commandReferences;
  assert.deepEqual(
    commandReferences,
    implementedMfCommandMetadata.map(({ usage, description }) => ({
      category: "External Extensions",
      usage,
      description
    }))
  );
  const readme = readFileSync(resolve(packageRoot, "README.md"), "utf8");
  for (const command of implementedMfCommandMetadata) {
    assert.match(readme, new RegExp(escapeRegExp(command.usage)));
  }
  assert.doesNotMatch(
    JSON.stringify(commandReferences),
    /divebell mf trace|divebell mf remote check|divebell mf preload trace/
  );

  const vmok = validateExtension(extensionModule.createMfExtension({
    name: "vmok",
    commandName: "vmok",
    displayName: "Vmok"
  }));
  assert.equal(vmok.name, "vmok");
  assert.equal(vmok.displayName, "Vmok");
  assert.deepEqual(vmok.commands.map((command) => command.name), ["vmok"]);
  assert.equal(vmok.commands[0].skill.path, validated.commands[0].skill.path);
  assert.equal(typeof vmok.hooks.open, "function");
  assert.equal(typeof vmok.hooks.detectStack, "function");
  assert.ok(
    vmok.commands[0].commandReferences.every((reference) =>
      reference.usage.startsWith("divebell vmok ")
    )
  );
  assert.doesNotMatch(
    JSON.stringify(vmok.commands[0].commandReferences),
    /divebell mf/
  );
});

test("command skill keeps MF performance answers inside attributed evidence", () => {
  const skillRoot = resolve(
    packageRoot,
    "skills/inspect-module-federation"
  );
  const skill = readFileSync(resolve(skillRoot, "SKILL.md"), "utf8");
  const performance = readFileSync(
    resolve(skillRoot, "references/performance.md"),
    "utf8"
  );
  const shared = readFileSync(
    resolve(skillRoot, "references/shared.md"),
    "utf8"
  );

  assert.doesNotMatch(skill, /Scope the performance request/);
  assert.match(
    performance,
    /only when the user explicitly asks about MF[\s\S]*performance/
  );
  assert.match(
    performance,
    /Start with `module-perf`\.[\s\S]*## `--report` return/
  );
  assert.match(
    performance,
    /consumer name\/instanceRef[\s\S]*remote name\/alias\/entry[\s\S]*producer name\/version[\s\S]*expose/
  );
  assert.match(performance, /Do\s+not list TTFB, CLS, INP/);
  assert.match(
    performance,
    /remoteEntry\.start - page\.fcp[\s\S]*remoteEntry\.start - loadRemote\.start/
  );
  assert.match(
    performance,
    /## `--report` return[\s\S]*preload-remote-entry[\s\S]*interaction-triggered lazy\s+load/
  );
  assert.match(
    performance,
    /## `--report` return[\s\S]*code-usage[\s\S]*universal size threshold/
  );
  assert.match(
    performance,
    /two-column `Event` \/[\s\S]*marker and its label together[\s\S]*do not[\s\S]*extend it as a vertical line[\s\S]*seconds-based axis/i
  );
  assert.match(performance, /always the first report field/);
  assert.match(
    performance,
    /firstObservedModuleLoad[\s\S]*mf-shared[\s\S]*loadShare[\s\S]*mf-resource[\s\S]*Shared JavaScript resources/
  );
  assert.match(
    performance,
    /inspect-reused-shared-asset[\s\S]*Rsdoctor[\s\S]*Do not recommend version unification/
  );
  assert.match(
    performance,
    /Terminal timeline example[\s\S]*Event[\s\S]*Timeline[\s\S]*FP · FCP[\s\S]*◇ LCP[\s\S]*260ms · 45 KB[\s\S]*◆ reuse/
  );
  assert.match(
    performance,
    /Event column contains only[\s\S]*consumer interval `loadRemote`, not consumer initialization[\s\S]*omits `page-script` events[\s\S]*Producer[\s\S]*`Preload` group[\s\S]*Preserve observed overlap/
  );
  assert.match(
    performance,
    /Ordinary page preload resources are omitted[\s\S]*does not create an MF preload lane/
  );
  assert.match(
    shared,
    /Multiple registered or unloaded[\s\S]*do not by[\s\S]*themselves prove a conflict/
  );
});

test("configured extension exposes complete vmok help and routing guidance", async () => {
  const { createMfExtension } = await import(
    pathToFileURL(resolve(packageRoot, "dist/extension.js")).href
  );
  const cli = createDivebellCli({
    extensions: [createMfExtension({
      name: "vmok",
      commandName: "vmok",
      displayName: "Vmok"
    })]
  });

  let rootHelp = "";
  const rootHelpExitCode = await cli.run(["--help"], {
    stdout: { write(chunk) { rootHelp += chunk; } },
    stderr: { write() {} }
  });
  assert.equal(rootHelpExitCode, 0);
  assert.match(rootHelp, /divebell vmok - Requires `divebell open <url> --mf`/);
  assert.match(rootHelp, /divebell vmok/);
  assert.doesNotMatch(rootHelp, /divebell mf/);

  let commandHelp = "";
  const commandHelpExitCode = await cli.run(["vmok", "--help"], {
    stdout: { write(chunk) { commandHelp += chunk; } },
    stderr: { write() {} }
  });
  assert.equal(commandHelpExitCode, 0);
  for (const command of implementedMfCommandMetadata) {
    assert.match(
      commandHelp,
      new RegExp(escapeRegExp(
        command.usage.replace("divebell mf", "divebell vmok")
      ))
    );
  }
  assert.doesNotMatch(commandHelp, /divebell mf/);

  let commandError = "";
  const commandExitCode = await cli.run(["vmok"], {
    stdout: { write(chunk) { commandError += chunk; } },
    stderr: { write() {} }
  });
  assert.equal(commandExitCode, 1);
  const parsedError = JSON.parse(commandError);
  assert.match(parsedError.message, /^vmok requires a subcommand/);
  assert.match(parsedError.error.hint, /divebell vmok status/);
  assert.doesNotMatch(parsedError.error.hint, /divebell mf/);
});

test("public build output has no external runtime imports or embedded MF CLI guidance", () => {
  const publicFiles = [
    "public.js",
    "function-location.js",
    "reader.js",
    "selection.js",
    "results.js",
    "errors.js",
    "types.js",
    "bridge/aggregate.js",
    "bridge/selection.js",
    "bridge/result.js",
    "bridge/types.js",
    "remote/errors.js",
    "remote/selection.js",
    "remote/results.js",
    "remote/types.js",
    "module-performance/open.js",
    "module-performance/result.js",
    "module-performance/types.js",
    "shared/selection.js",
    "shared/status.js",
    "shared/trace.js",
    "shared/types.js"
  ];
  const sources = publicFiles.map((file) =>
    readFileSync(resolve(packageRoot, "dist", file), "utf8")
  );
  for (const source of sources) {
    assert.doesNotMatch(
      source,
      /(?:from|import\()\s*["'](?!\.\.?\/|node:)/
    );
  }
  assert.doesNotMatch(sources.join("\n"), /divebell mf (?:status|module-info|module-perf|remote status|remote trace|shared status|shared trace|bridge trace)/);
});

test("packed npm archive is self-contained and has no runtime dependencies", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-mf-pack-"));
  try {
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", outputDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(outputDirectory, packageArchiveName);
    const listed = spawnSync("tar", ["-tf", archive], { encoding: "utf8" });
    assert.equal(listed.status, 0, listed.stderr);
    assert.match(listed.stdout, /package\/dist\/extension\.js/);
    assert.match(listed.stdout, /package\/dist\/module-performance\/result\.js/);
    assert.match(
      listed.stdout,
      /package\/skills\/inspect-module-federation\/references\/performance\.md/
    );
    assert.doesNotMatch(
      listed.stdout,
      /package\/dist\/commands\/(?:trace|preload-trace|remote-check)\./
    );
    assert.match(listed.stdout, /package\/dist\/package\.js/);
    assert.match(listed.stdout, /package\/dist\/package\.d\.ts/);
    assert.match(listed.stdout, /package\/dist\/public\.js/);
    assert.match(listed.stdout, /package\/dist\/public\.d\.ts/);
    assert.match(listed.stdout, /package\/dist\/extension\.d\.ts/);
    assert.match(listed.stdout, /package\/dist\/test-commands\.js/);
    assert.match(listed.stdout, /package\/dist\/test-commands\.d\.ts/);
    assert.match(listed.stdout, /package\/dist\/observability-chrome-devtool\.iife\.js/);
    assert.match(listed.stdout, /package\/dist\/install-observability\.js/);
    assert.match(listed.stdout, /package\/dist\/observability-build\.json/);
    assert.match(listed.stdout, /package\/dist\/install-runtime-debug\.js/);
    assert.match(listed.stdout, /package\/dist\/runtime-debug-build\.json/);
    assert.match(listed.stdout, /package\/dist\/vmok-proxy-sdk\.iife\.js/);
    assert.match(listed.stdout, /package\/dist\/proxy-sdk-build\.json/);
    assert.match(
      listed.stdout,
      /package\/skills\/inspect-module-federation\/SKILL\.md/
    );
    assert.match(
      listed.stdout,
      /package\/skills\/inspect-module-federation\/agents\/openai\.yaml/
    );
    assert.match(
      listed.stdout,
      /package\/skills\/inspect-module-federation\/references\/shared\.md/
    );
    assert.match(listed.stdout, /package\/README\.md/);
    const metadata = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/observability-build.json"
    ], { encoding: "utf8" });
    assert.equal(metadata.status, 0, metadata.stderr);
    assert.doesNotMatch(metadata.stdout, /\/Users\/|outter\/core|registry|token/i);
    const runtimeMetadata = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/runtime-debug-build.json"
    ], { encoding: "utf8" });
    assert.equal(runtimeMetadata.status, 0, runtimeMetadata.stderr);
    assert.doesNotMatch(runtimeMetadata.stdout, /\/Users\/|outter\/core|registry|token/i);
    const proxyMetadata = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/proxy-sdk-build.json"
    ], { encoding: "utf8" });
    assert.equal(proxyMetadata.status, 0, proxyMetadata.stderr);
    assert.doesNotMatch(proxyMetadata.stdout, /\/Users\/|work\/garfish|registry|token/i);
    const publicTypes = spawnSync("tar", [
      "-xOf",
      archive,
      "package/dist/public.d.ts"
    ], { encoding: "utf8" });
    assert.equal(publicTypes.status, 0, publicTypes.stderr);
    assert.match(publicTypes.stdout, /types\.js/);
    const reportTypes = readFileSync(resolve(packageRoot, "dist", "types.d.ts"), "utf8");
    assert.match(reportTypes, /interface RuntimeResource/);
    assert.match(reportTypes, /interface RuntimeShared/);
    assert.match(reportTypes, /interface RuntimeBridgeInfo/);
    assert.equal(packageJson.dependencies, undefined);
    assert.equal(packageJson.divebell.extensions[0], "./dist/extension.js");
    assert.equal(packageJson.exports["."].import, "./dist/package.js");
    assert.equal(packageJson.exports["./core"].import, "./dist/public.js");
    assert.equal(packageJson.exports["./extension"].import, "./dist/extension.js");
    assert.equal(packageJson.exports["./test"].import, "./dist/test-commands.js");
    assert.deepEqual(
      Object.keys(packageJson.exports),
      [".", "./core", "./extension", "./test"]
    );

    const extracted = join(outputDirectory, "extracted");
    mkdirSync(extracted);
    const unpacked = spawnSync("tar", ["-xzf", archive, "-C", extracted], {
      encoding: "utf8"
    });
    assert.equal(unpacked.status, 0, unpacked.stderr);
    const publishedSource = listFiles(extracted)
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    assert.doesNotMatch(publishedSource, /\/Users\/|outter\/core/);
    assert.doesNotMatch(publishedSource, /(?:"|')(?:file|link):(?:\/|\.)/);
    const publishedBundle = readFileSync(
      join(extracted, "package", "dist", "observability-chrome-devtool.iife.js"),
      "utf8"
    );
    assert.doesNotMatch(publishedBundle, /\brequire\s*\(|\bimport\s*\(|\bimport\s+[\w{*]/);
    const publishedProxyBundle = readFileSync(
      join(extracted, "package", "dist", "vmok-proxy-sdk.iife.js"),
      "utf8"
    );
    assert.doesNotMatch(
      publishedProxyBundle,
      /\brequire\s*\(|\bimport\s*\(|\bimport\s+[\w{*]/
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

test("packed extension exposes its installed command skill", () => {
  const outputDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-mf-skill-"));
  try {
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", outputDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(outputDirectory, packageArchiveName);
    const extensionsDirectory = join(outputDirectory, "extensions");
    const cliPath = resolve(packageRoot, "../../..", "divebell");
    const env = {
      ...process.env,
      DIVEBELL_EXTENSIONS_DIR: extensionsDirectory
    };
    const installed = spawnSync(process.execPath, [
      cliPath,
      "extensions",
      "add",
      archive,
      "--extensions-dir",
      extensionsDirectory
    ], {
      cwd: resolve(packageRoot, "../../.."),
      env,
      encoding: "utf8"
    });
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    const skill = spawnSync(process.execPath, [cliPath, "mf", "--skill"], {
      cwd: resolve(packageRoot, "../../.."),
      env,
      encoding: "utf8"
    });
    assert.equal(skill.status, 0, skill.stderr || skill.stdout);
    const installedSkillPath = skill.stdout.trim();
    assert.equal(existsSync(installedSkillPath), true);
    assert.equal(
      realpathSync(installedSkillPath).startsWith(realpathSync(extensionsDirectory)),
      true
    );
  } finally {
    rmSync(outputDirectory, { recursive: true, force: true });
  }
});

function listFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : statSync(path).isFile() ? [path] : [];
  });
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

test("packed archive supports real package-name imports for public API and extension", () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-mf-public-import-"));
  const packDirectory = join(tempDirectory, "pack");
  try {
    mkdirSync(packDirectory, { recursive: true });
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packDirectory, packageArchiveName);
    const installed = spawnSync("npm", [
      "install",
      "--ignore-scripts",
      "--no-package-lock",
      archive
    ], {
      cwd: tempDirectory,
      encoding: "utf8",
      env: {
        ...process.env,
        npm_config_cache: join(tempDirectory, "npm-cache")
      }
    });
    assert.equal(installed.status, 0, installed.stderr);
    const imported = spawnSync(process.execPath, [
      "--input-type=module",
      "-e",
      `const extension = await import("@divebell/extension-mf");
       const api = await import("@divebell/extension-mf/core");
       const extensionFactory = await import("@divebell/extension-mf/extension");
       const testApi = await import("@divebell/extension-mf/test");
       const names = ["readMfObservability", "parseBrowserReadResult", "parseRuntimeState", "selectStatusInstances", "selectConsumer", "selectRemote", "createStatusResult", "createModuleInfoResult", "createCompatibilitySummary", "filterGlobalShared", "filterRelationshipsForInstances", "collectBridgeOperations", "listBridgeCurrentStates", "selectBridgeTrace", "createBridgeTraceResult", "selectRemoteTrace", "selectRemoteStatus", "createRemoteTraceResult", "createRemoteStatusResult", "buildRemoteTrace", "selectSharedInstances", "createSharedStatusResult", "createSharedTraceResult", "groupSharedTraceOperations"];
       if (!names.every((name) => typeof api[name] === "function")) process.exit(2);
       if (!names.every((name) => typeof extension[name] === "function")) process.exit(4);
       if ("formatRemoteTrace" in api || "formatRemoteStatus" in api) process.exit(5);
       if (extension.default?.name !== "mf") process.exit(3);
       if (typeof extensionFactory.createMfExtension !== "function") process.exit(6);
       const vmok = extensionFactory.createMfExtension({ commandName: "vmok" });
       if (vmok.name !== "vmok" || vmok.commands?.[0]?.name !== "vmok") process.exit(7);
       if (typeof testApi.mfTestCommands?.status !== "function") process.exit(8);`
    ], {
      cwd: tempDirectory,
      encoding: "utf8"
    });
    assert.equal(imported.status, 0, imported.stderr);
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("packed archive installs and loads through the external extension mechanism", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "divebell-extension-mf-install-"));
  const packDirectory = join(tempDirectory, "pack");
  const extensionsDirectory = join(tempDirectory, "extensions");
  try {
    mkdirSync(packDirectory, { recursive: true });
    const packed = spawnSync("pnpm", ["pack", "--pack-destination", packDirectory], {
      cwd: packageRoot,
      encoding: "utf8"
    });
    assert.equal(packed.status, 0, packed.stderr);
    const archive = join(packDirectory, packageArchiveName);
    let stdout = "";
    let stderr = "";
    const cli = createDivebellCli();
    const exitCode = await cli.run([
      "extensions",
      "add",
      "@divebell/extension-mf"
    ], {
      stdout: { write(chunk) { stdout += chunk; } },
      stderr: { write(chunk) { stderr += chunk; } },
      extensionsDirectory,
      extensionPackageDownloader: {
        download: async () => archive
      }
    });
    assert.equal(exitCode, 0, stderr);
    const addOutput = JSON.parse(stdout);
    assert.equal(addOutput.status, "ok");
    assert.equal(addOutput.data.package.name, "@divebell/extension-mf");

    const loaded = await createDivebellCliWithExternalExtensions({}, {
      ...process.env,
      DIVEBELL_EXTENSIONS_DIR: extensionsDirectory,
      DIVEBELL_DISABLE_EXTENSIONS: "0"
    });
    assert.deepEqual(loaded.cli.extensions.map((extension) => extension.name), ["mf"]);
    assert.deepEqual(loaded.cli.extensions[0].commands.map((command) => command.name), ["mf"]);
    assert.equal(typeof loaded.cli.extensions[0].hooks.open, "function");
    assert.equal(typeof loaded.cli.extensions[0].hooks.detectStack, "function");
    let rootHelp = "";
    const rootHelpExitCode = await loaded.cli.run(["--help"], {
      stdout: { write(chunk) { rootHelp += chunk; } },
      stderr: { write() {} }
    });
    assert.equal(rootHelpExitCode, 0);
    assert.match(rootHelp, /External Extensions:/);
    assert.match(rootHelp, /divebell mf - Requires `divebell open <url> --mf`/);

    let commandHelp = "";
    const commandHelpExitCode = await loaded.cli.run(["mf", "--help"], {
      stdout: { write(chunk) { commandHelp += chunk; } },
      stderr: { write() {} }
    });
    assert.equal(commandHelpExitCode, 0);
    let previousIndex = -1;
    for (const command of implementedMfCommandMetadata) {
      const index = commandHelp.indexOf(command.usage);
      assert.ok(index > previousIndex, `${command.usage} is missing or out of order in --help`);
      previousIndex = index;
    }
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});
