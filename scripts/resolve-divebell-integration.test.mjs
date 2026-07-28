import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const resolver = resolve(
  repositoryRoot,
  "skills/divebell/scripts/resolve-integration.mjs"
);

function resolveDependencies(t, dependencies) {
  const fixtureDirectory = mkdtempSync(
    join(tmpdir(), "divebell-integration-resolver-")
  );
  t.after(() => rmSync(fixtureDirectory, { recursive: true, force: true }));

  const packageJsonPath = join(fixtureDirectory, "package.json");
  writeFileSync(
    packageJsonPath,
    `${JSON.stringify({ private: true, dependencies }, null, 2)}\n`
  );

  return JSON.parse(
    execFileSync(process.execPath, [resolver, packageJsonPath], {
      encoding: "utf8"
    })
  );
}

test("keeps the Modern.js runtime integration WIP for newer and preview versions", (t) => {
  const result = resolveDependencies(t, {
    "@modern-js/runtime": "3.4.0-preview.7",
    "@divebell/modern-plugin": "0.0.2"
  });

  assert.deepEqual(result.install, ["@divebell/core"]);
  assert.deepEqual(result.use, ["@divebell/core"]);
  assert.deepEqual(result.notices, [
    {
      integration: "@divebell/modern-plugin",
      status: "wip",
      reason: "Waiting for a Modern.js release with the required lifecycle hooks.",
      fallback: "@divebell/core"
    }
  ]);
});

test("does not reinstall the Runtime SDK fallback when it is already present", (t) => {
  const result = resolveDependencies(t, {
    "@modern-js/app-tools": "^4.0.0",
    "@divebell/core": "0.0.2"
  });

  assert.deepEqual(result.install, []);
  assert.deepEqual(result.use, ["@divebell/core"]);
  assert.equal(result.notices[0].status, "wip");
});

test("preserves Module Federation recommendations beside the Modern.js fallback", (t) => {
  const result = resolveDependencies(t, {
    "@modern-js/runtime": "^4.0.0",
    "@module-federation/enhanced": "^0.21.0"
  });

  assert.deepEqual(result.install, [
    "@divebell/core",
    "@module-federation/observability-plugin"
  ]);
  assert.deepEqual(result.use, [
    "@divebell/core",
    "@module-federation/observability-plugin"
  ]);
});
