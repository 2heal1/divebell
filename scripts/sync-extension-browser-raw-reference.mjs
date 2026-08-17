import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GENERATED_RAW_REFERENCE_START =
  "<!-- BEGIN GENERATED AGENT-BROWSER REFERENCE -->";
export const GENERATED_RAW_REFERENCE_END =
  "<!-- END GENERATED AGENT-BROWSER REFERENCE -->";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDirectory, "..");
const referencePath = join(
  repoRoot,
  "skills/divebell-extension/references/browser-raw.md"
);
const commandReferenceDirectory = join(
  repoRoot,
  "skills/divebell-extension/references/browser-raw"
);
const cliRequire = createRequire(join(repoRoot, "packages/cli/package.json"));

export function resolveAgentBrowserReferenceSource() {
  const packagePath = cliRequire.resolve("@divebell/agent-browser/package.json");
  const packageDirectory = dirname(packagePath);
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8"));
  const entryPath = cliRequire.resolve("@divebell/agent-browser/bin/agent-browser.js");
  const commandsPath = join(
    packageDirectory,
    "skill-data/core/references/commands.md"
  );

  return {
    version: packageJson.version,
    entryPath,
    commandsPath,
    markdownPaths: [
      join(packageDirectory, "README.md"),
      ...collectMarkdownPaths(join(packageDirectory, "skill-data"))
    ].filter((path) => existsSync(path))
  };
}

export function discoverAgentBrowserCommandCandidates({
  topLevelHelp,
  markdownSources
}) {
  const candidates = [];
  const seen = new Set();
  const declaredCommands = new Set();
  let commandsEnded = false;
  let readsCommandRows = false;

  const add = (command, { declared = false } = {}) => {
    if (!/^[a-z][a-z0-9-]*$/.test(command)) return;
    if (!seen.has(command)) {
      seen.add(command);
      candidates.push(command);
    }
    if (declared) declaredCommands.add(command);
  };

  for (const line of topLevelHelp.split("\n")) {
    const directInvocation = line.match(/^\s*agent-browser\s+([a-z][a-z0-9-]*)\b/);
    if (!commandsEnded && directInvocation) {
      add(directInvocation[1], { declared: true });
    }

    const inlineCommand = line.match(
      /^\S.*?:\s+agent-browser\s+([a-z][a-z0-9-]*)\b/
    );
    if (!commandsEnded && inlineCommand) {
      add(inlineCommand[1], { declared: true });
      readsCommandRows = false;
      continue;
    }

    const heading = line.match(/^(\S.*):$/);
    if (heading) {
      if (heading[1] === "Snapshot Options") commandsEnded = true;
      readsCommandRows = !commandsEnded
        && heading[1] !== "Start here (for AI agents)";
      continue;
    }

    if (!readsCommandRows || commandsEnded) continue;
    const commandRow = line.match(/^ {2}([a-z][a-z0-9-]*)(?=\s|$)/);
    if (commandRow) add(commandRow[1], { declared: true });
  }

  const optionMetadata = parseGlobalOptionMetadata(topLevelHelp);
  for (const markdown of markdownSources) {
    for (const block of markdown.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
      for (const line of block[1].split("\n")) {
        const command = parseDocumentedAgentBrowserInvocation(
          line,
          optionMetadata
        );
        if (command) add(command);
      }
    }
  }

  return { candidates, declaredCommands };
}

export function createAgentBrowserRawReferenceModel() {
  const source = resolveAgentBrowserReferenceSource();
  const topLevelHelp = readAgentBrowserHelp(source.entryPath, []);
  const markdownSources = source.markdownPaths.map((path) =>
    readFileSync(path, "utf8")
  );
  const discovery = discoverAgentBrowserCommandCandidates({
    topLevelHelp,
    markdownSources
  });
  const commands = [];
  const commandHelp = new Map();
  const globalHelpCommands = new Set();
  const unavailableDocumentedCommands = new Set();

  for (const command of discovery.candidates) {
    const probe = probeAgentBrowserHelp(source.entryPath, command);
    if (probe.exitCode !== 0) {
      if (discovery.declaredCommands.has(command)) {
        throw new Error(
          `agent-browser declares "${command}" in top-level help, but "${command} --help" exited with ${probe.exitCode}.`
        );
      }
      unavailableDocumentedCommands.add(command);
      continue;
    }
    const { output } = probe;
    const hasDedicatedHelp = output.includes(`Usage: agent-browser ${command}`)
      || output.startsWith(`agent-browser ${command} -`);
    if (!hasDedicatedHelp && !discovery.declaredCommands.has(command)) {
      unavailableDocumentedCommands.add(command);
      continue;
    }
    if (!hasDedicatedHelp) globalHelpCommands.add(command);
    commands.push(command);
    commandHelp.set(command, output);
  }

  return {
    source,
    topLevelHelp,
    commands,
    commandHelp,
    globalHelpCommands,
    unavailableDocumentedCommands
  };
}

export function createGeneratedRawReference(
  model = createAgentBrowserRawReferenceModel()
) {
  const links = model.commands.map(
    (command) => `- [\`${command}\`](browser-raw/${command}.md)`
  );

  return [
    `Installed source: \`@divebell/agent-browser@${model.source.version}\`.`,
    "",
    "The command files are generated from the exact agent-browser dependency",
    "used by `@divebell/cli`. Do not edit them by hand.",
    "",
    "- [Top-level catalog and extended upstream reference](browser-raw/catalog.md)",
    ...links
  ].join("\n");
}

export function createGeneratedRawCommandReferences(
  model = createAgentBrowserRawReferenceModel()
) {
  const commandReference = readFileSync(model.source.commandsPath, "utf8")
    .trim()
    .replace(/^# Command Reference$/m, "## Detailed command reference")
    .replace(
      /^agent-browser addinitscript <js>.*$/m,
      model.unavailableDocumentedCommands.has("addinitscript")
        ? "# `addinitscript` is not accepted by this pinned parser; do not use it through `raw`."
        : "$&"
    )
    .replace(/\[([^\]]+)\]\((?!https?:|#)[^)]+\.md\)/g, "$1");
  const references = new Map();

  references.set("catalog.md", [
    "# agent-browser raw command catalog",
    "",
    `Generated from \`@divebell/agent-browser@${model.source.version}\`. Do not edit by hand.`,
    "",
    "Use the command-specific files next to this catalog for the exact installed",
    "help of one command. Pass command tokens to `browser.raw` without the",
    "`agent-browser` executable name.",
    "",
    "## Top-level installed help",
    "",
    "```text",
    model.topLevelHelp,
    "```",
    "",
    commandReference,
    ""
  ].join("\n"));

  for (const command of model.commands) {
    const output = model.commandHelp.get(command);
    if (output === undefined) {
      throw new Error(`Missing generated help for agent-browser "${command}".`);
    }
    references.set(`${command}.md`, [
      `# \`browser.raw\`: \`${command}\``,
      "",
      `Generated from \`@divebell/agent-browser@${model.source.version}\`. Do not edit by hand.`,
      "",
      `Call this command with \`browser.raw(["${command}", ...args])\`. The return`,
      "type is `DivebellBrowserRawResult`; see `../browser-raw.md` for JSON",
      "unwrapping, failure handling, and command-specific payload validation.",
      "",
      "```text",
      output,
      "```",
      ""
    ].join("\n"));
  }

  return references;
}

function collectMarkdownPaths(directory) {
  if (!existsSync(directory)) return [];
  const paths = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...collectMarkdownPaths(path));
    if (entry.isFile() && entry.name.endsWith(".md")) paths.push(path);
  }
  return paths.toSorted();
}

function readAgentBrowserHelp(entryPath, args) {
  return execFileSync(process.execPath, [entryPath, ...args, "--help"], {
    cwd: repoRoot,
    encoding: "utf8"
  }).trim();
}

function probeAgentBrowserHelp(entryPath, command) {
  const result = spawnSync(
    process.execPath,
    [entryPath, command, "--help"],
    {
      cwd: repoRoot,
      encoding: "utf8"
    }
  );
  if (result.error) throw result.error;
  return {
    exitCode: result.status ?? 1,
    output: `${result.stdout ?? ""}${result.stderr ?? ""}`.trim()
  };
}

function parseGlobalOptionMetadata(help) {
  const options = new Map();
  for (const line of help.split("\n")) {
    const match = line.match(
      /^\s+(?:(-[a-zA-Z]),\s+)?(--[a-z][a-z0-9-]*)(?:\s+(<[^>]+>|\[[^\]]+\]))?/
    );
    if (!match) continue;
    const consumesValue = match[3] !== undefined;
    options.set(match[2], consumesValue);
    if (match[1]) options.set(match[1], consumesValue);
  }
  return options;
}

function parseDocumentedAgentBrowserInvocation(line, optionMetadata) {
  const invocation = line.match(/(?:^|\s)agent-browser\s+(.+)$/);
  if (!invocation) return undefined;
  const tokens = invocation[1].match(/"[^"]*"|'[^']*'|\S+/g) ?? [];
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index].replace(/^["']|["']$/g, "");
    if (token.startsWith("-")) {
      const option = token.split("=", 1)[0];
      if (!token.includes("=") && optionMetadata.get(option)) index += 1;
      continue;
    }
    return /^[a-z][a-z0-9-]*$/.test(token) ? token : undefined;
  }
  return undefined;
}

export function replaceGeneratedRawReference(current, generated) {
  const startIndex = current.indexOf(GENERATED_RAW_REFERENCE_START);
  const endIndex = current.indexOf(GENERATED_RAW_REFERENCE_END);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    throw new Error(
      `${relative(repoRoot, referencePath)} is missing its generated reference markers.`
    );
  }

  const before = current.slice(
    0,
    startIndex + GENERATED_RAW_REFERENCE_START.length
  );
  const after = current.slice(endIndex);
  return `${before}\n\n${generated}\n\n${after}`;
}

export function syncExtensionBrowserRawReference({ check = false } = {}) {
  const current = readFileSync(referencePath, "utf8");
  const model = createAgentBrowserRawReferenceModel();
  const expected = replaceGeneratedRawReference(
    current,
    createGeneratedRawReference(model)
  );

  const commandReferences = createGeneratedRawCommandReferences(model);
  const currentCommandNames = new Set(
    (existsSync(commandReferenceDirectory)
      ? readdirSync(commandReferenceDirectory, { withFileTypes: true })
      : [])
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => entry.name)
  );
  const staleCommandNames = [...currentCommandNames].filter(
    (name) => !commandReferences.has(name)
  );
  const changedCommandNames = [...commandReferences].flatMap(([name, content]) => {
    try {
      return readFileSync(join(commandReferenceDirectory, name), "utf8") === content
        ? []
        : [name];
    } catch {
      return [name];
    }
  });
  const synchronized = current === expected
    && staleCommandNames.length === 0
    && changedCommandNames.length === 0;

  if (synchronized) return true;
  if (check) {
    throw new Error(
      `${relative(repoRoot, referencePath)} is out of date. Run "pnpm run docs:raw".`
    );
  }
  writeFileSync(referencePath, expected);
  mkdirSync(commandReferenceDirectory, { recursive: true });
  for (const [name, content] of commandReferences) {
    writeFileSync(join(commandReferenceDirectory, name), content);
  }
  for (const name of staleCommandNames) {
    unlinkSync(join(commandReferenceDirectory, name));
  }
  return false;
}

const isEntryPoint = process.argv[1] !== undefined
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) {
  try {
    syncExtensionBrowserRawReference({
      check: process.argv.slice(2).includes("--check")
    });
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
