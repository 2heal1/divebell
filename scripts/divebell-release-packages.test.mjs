import assert from "node:assert/strict";
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
  assert.ok(packages.every((item) => item.packageJson.publishConfig?.access === "public"));
});
