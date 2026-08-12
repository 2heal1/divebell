import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { readDivebellReleasePackages } from "./divebell-release-packages.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

test("uses the fixed package group as the complete public release package list", async () => {
  const packages = await readDivebellReleasePackages(repositoryRoot);
  const names = packages.map((item) => item.name);

  assert.equal(new Set(names).size, names.length);
  assert.deepEqual(names.slice(0, 6), [
    "@divebell/core",
    "@divebell/bridge",
    "@divebell/chunk-map",
    "@divebell/rspack-plugin",
    "@divebell/modern-plugin",
    "@divebell/cli"
  ]);
  assert.ok(names.includes("@divebell/extension-mf"));
  assert.ok(names.includes("@divebell/extension-rstack"));
  assert.equal(
    packages.find((item) => item.name === "@divebell/extension-mf")?.directory,
    "packages/extensions/mf"
  );
  assert.ok(names.includes("@divebell/test"));
  assert.ok(packages.every((item) => item.packageJson.publishConfig?.access === "public"));
});

test("publishes every runtime package through pkg.pr.new", async () => {
  const packages = await readDivebellReleasePackages(repositoryRoot);
  const workflow = await readFile(
    resolve(repositoryRoot, ".github/workflows/pkg-pr-new.yml"),
    "utf8"
  );
  const workflowEntries = new Set(
    workflow.split(/\r?\n/).map((line) => line.trim())
  );

  for (const item of packages) {
    if (item.name === "@divebell/test") continue;
    assert.ok(
      workflowEntries.has(item.directory),
      `${item.name} (${item.directory}) is missing from pkg.pr.new`
    );
  }
});
