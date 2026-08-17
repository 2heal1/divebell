import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

import {
  createAgentBrowserRawReferenceModel,
  createGeneratedRawCommandReferences,
  createGeneratedRawReference,
  discoverAgentBrowserCommandCandidates,
  GENERATED_RAW_REFERENCE_END,
  GENERATED_RAW_REFERENCE_START,
  replaceGeneratedRawReference
} from "./sync-extension-browser-raw-reference.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rawReferencePath = join(
  repoRoot,
  "skills/divebell-extension/references/browser-raw.md"
);
const extensionSkillPath = join(repoRoot, "skills/divebell-extension/SKILL.md");
const cliPackagePath = join(repoRoot, "packages/cli/package.json");
const rawCommandReferenceDirectory = join(
  repoRoot,
  "skills/divebell-extension/references/browser-raw"
);

test("keeps the Extension raw reference synchronized with agent-browser", () => {
  const current = readFileSync(rawReferencePath, "utf8");
  const model = createAgentBrowserRawReferenceModel();
  const cliPackage = JSON.parse(readFileSync(cliPackagePath, "utf8"));
  const expected = replaceGeneratedRawReference(
    current,
    createGeneratedRawReference(model)
  );

  assert.equal(current, expected);
  assert.equal(
    cliPackage.dependencies["@divebell/agent-browser"],
    model.source.version
  );
  assert.match(
    current,
    new RegExp(`@divebell/agent-browser@${escapeRegExp(model.source.version)}`)
  );
  const commandReferences = createGeneratedRawCommandReferences(model);
  assert.deepEqual(
    readdirSync(rawCommandReferenceDirectory).toSorted(),
    [...commandReferences.keys()].toSorted()
  );
  for (const [name, content] of commandReferences) {
    assert.equal(
      readFileSync(join(rawCommandReferenceDirectory, name), "utf8"),
      content
    );
  }
  const catalog = commandReferences.get("catalog.md") ?? "";
  assert.match(catalog, /agent-browser network request <requestId>/);
  assert.match(catalog, /agent-browser debug status/);
  assert.match(catalog, /agent-browser memory metrics/);
  assert.match(
    commandReferences.get("coverage.md") ?? "",
    /Usage: agent-browser coverage <operation>/
  );
  if (model.commands.includes("addinitscript")) {
    assert.equal(commandReferences.has("addinitscript.md"), true);
    assert.doesNotMatch(
      catalog,
      /`addinitscript` is not accepted by this pinned parser/
    );
  } else {
    assert.equal(commandReferences.has("addinitscript.md"), false);
    if (model.unavailableDocumentedCommands.has("addinitscript")) {
      assert.match(
        catalog,
        /`addinitscript` is not accepted by this pinned parser/
      );
    }
  }
  for (const command of model.commands) {
    assert.match(current, new RegExp(`browser-raw/${escapeRegExp(command)}\\.md`));
    const content = commandReferences.get(`${command}.md`) ?? "";
    if (!model.globalHelpCommands.has(command)) {
      assert.match(
        content,
        new RegExp(
          `(Usage: agent-browser ${escapeRegExp(command)}|agent-browser ${escapeRegExp(command)} -)`
        )
      );
    }
  }
});

test("discovers new top-level and documented commands without a hardcoded list", () => {
  const discovery = discoverAgentBrowserCommandCandidates({
    topLevelHelp: [
      "Usage: agent-browser <command>",
      "",
      "Core Commands:",
      "  open <url>  Navigate",
      "  sparkle now Add sparkle",
      "",
      "Network: agent-browser network <action>",
      "  requests   List requests",
      "",
      "Snapshot Options:",
      "  --compact  Compact output",
      "",
      "Options:",
      "  -p, --provider <name>  Browser provider"
    ].join("\n"),
    markdownSources: [
      [
        "```bash",
        "agent-browser hidden --json",
        "agent-browser --provider ios tap @e1",
        "```"
      ].join("\n")
    ]
  });

  assert.deepEqual(discovery.candidates, [
    "open",
    "sparkle",
    "network",
    "hidden",
    "tap"
  ]);
  assert.deepEqual(
    [...discovery.declaredCommands],
    ["open", "sparkle", "network"]
  );
});

test("documents the raw transport and routes Extension agents to it", () => {
  const reference = readFileSync(rawReferencePath, "utf8");
  const skill = readFileSync(extensionSkillPath, "utf8");
  const generatedStart = reference.indexOf(GENERATED_RAW_REFERENCE_START);
  const generatedEnd = reference.indexOf(GENERATED_RAW_REFERENCE_END);

  assert.ok(generatedStart >= 0);
  assert.ok(generatedEnd > generatedStart);
  assert.match(skill, /references\/browser-raw\.md/);
  assert.match(reference, /interface DivebellBrowserRawOptions/);
  assert.match(reference, /interface DivebellBrowserRawResult/);
  assert.match(reference, /exitCode: number/);
  assert.match(reference, /stdout: string/);
  assert.match(reference, /stderr: string/);
  assert.match(reference, /removes agent-browser's outer `\{ success, data, error \}`/);
  assert.match(reference, /raw<T>\(\)/);
  assert.match(reference, /Extension Commands must not invoke agent-browser `open`, `close`/);
});

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
