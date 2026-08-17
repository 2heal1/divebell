import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import ts from "typescript";

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
const browserTypesPath = join(
  repoRoot,
  "packages/cli/src/features/extension/types.ts"
);
const extensionApiDocumentationPath = join(repoRoot, "docs/extension-api.md");
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

test("documents every typed Extension browser API and its type source", () => {
  const browserTypes = readFileSync(browserTypesPath, "utf8");
  const expectedApis = collectBrowserApiPaths(browserTypes);
  const exportedBrowserTypes = collectExportedBrowserTypeNames(browserTypes);

  for (const documentationPath of [
    rawReferencePath.replace(/browser-raw\.md$/, "api.md"),
    extensionApiDocumentationPath
  ]) {
    const documentation = readFileSync(documentationPath, "utf8");
    const documentedApis = [...documentation.matchAll(
      /^\| `(browser\.[^`]+)` \|/gm
    )].map((match) => match[1]).toSorted();

    assert.deepEqual(documentedApis, expectedApis);
    assert.match(
      documentation,
      /node_modules\/@divebell\/cli\/dist\/features\/extension\/types\.d\.ts/
    );
    assert.doesNotMatch(documentation, /^### Browser capabilities$/m);

    for (const match of documentation.matchAll(/`(DivebellBrowser[A-Za-z0-9]+)`/g)) {
      assert.ok(
        exportedBrowserTypes.has(match[1]),
        `${match[1]} is not exported by the Extension browser type source.`
      );
    }
  }
});

function collectBrowserApiPaths(source) {
  const sourceFile = ts.createSourceFile(
    browserTypesPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const interfaces = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isInterfaceDeclaration(statement)) {
      interfaces.set(statement.name.text, statement);
    }
  }

  const root = interfaces.get("DivebellBrowserApi");
  assert.ok(root, "DivebellBrowserApi must exist.");
  const paths = [];

  const visitMembers = (members, prefix) => {
    for (const member of members) {
      const name = readTypeMemberName(member.name);
      if (name === undefined) continue;
      const path = `${prefix}.${name}`;
      if (ts.isMethodSignature(member)) {
        paths.push(path);
        continue;
      }
      if (!ts.isPropertySignature(member) || member.type === undefined) continue;
      if (ts.isTypeLiteralNode(member.type)) {
        visitMembers(member.type.members, path);
        continue;
      }
      if (ts.isTypeReferenceNode(member.type) && ts.isIdentifier(member.type.typeName)) {
        const nested = interfaces.get(member.type.typeName.text);
        if (nested !== undefined && member.type.typeName.text.endsWith("Api")) {
          visitMembers(nested.members, path);
          continue;
        }
      }
      paths.push(path);
    }
  };

  visitMembers(root.members, "browser");
  return paths.toSorted();
}

function collectExportedBrowserTypeNames(source) {
  const sourceFile = ts.createSourceFile(
    browserTypesPath,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  return new Set(
    sourceFile.statements.flatMap((statement) => {
      if (
        (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement))
        && statement.name.text.startsWith("DivebellBrowser")
        && statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword
        )
      ) {
        return [statement.name.text];
      }
      return [];
    })
  );
}

function readTypeMemberName(name) {
  if (name === undefined) return undefined;
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
