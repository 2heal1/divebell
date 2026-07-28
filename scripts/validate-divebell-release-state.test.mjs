import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(resolve(
  repositoryRoot,
  "skills/record-divebell-workflow/references/divebell-cli-runtime.json"
), "utf8"));
const script = resolve(repositoryRoot, "scripts/validate-divebell-release-state.mjs");

test("accepts the exact aligned release state", () => {
  const result = runValidator(manifest.version);

  assert.equal(result.status, 0, result.stderr);
  const output = JSON.parse(result.stdout);
  assert.equal(output.version, manifest.version);
  assert.ok(output.packages.includes("@divebell/extension-mf"));
});

test("rejects a recovery request for a different version", () => {
  const result = runValidator(`${manifest.version}-wrong`);

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /does not match manifest/);
});

function runValidator(version) {
  return spawnSync(process.execPath, [script, "--version", version], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}
