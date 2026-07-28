import assert from "node:assert/strict";
import test from "node:test";

import { validateReleaseChangedFiles } from "./release-change-files.mjs";

const requiredFiles = [
  "packages/core/package.json",
  "skills/record-divebell-workflow/references/divebell-cli-runtime.json"
];

test("accepts version updates and removed published changesets", () => {
  const result = validateReleaseChangedFiles([
    "modified\tpackages/core/package.json",
    "modified\tskills/record-divebell-workflow/references/divebell-cli-runtime.json",
    "removed\t.changeset/first.md",
    "removed\t.changeset/second.md"
  ].join("\n"), requiredFiles);

  assert.deepEqual(result.changesets, [
    ".changeset/first.md",
    ".changeset/second.md"
  ]);
});

test("rejects added or modified changesets", () => {
  for (const status of ["added", "modified"]) {
    assert.throws(
      () => validateReleaseChangedFiles([
        "modified\tpackages/core/package.json",
        "modified\tskills/record-divebell-workflow/references/divebell-cli-runtime.json",
        `${status}\t.changeset/unpublished.md`
      ].join("\n"), requiredFiles),
      /may only remove changeset files/
    );
  }
});

test("rejects unrelated files and missing changeset removals", () => {
  assert.throws(
    () => validateReleaseChangedFiles([
      "modified\tpackages/core/package.json",
      "modified\tskills/record-divebell-workflow/references/divebell-cli-runtime.json",
      "removed\tREADME.md"
    ].join("\n"), requiredFiles),
    /may not change README\.md/
  );

  assert.throws(
    () => validateReleaseChangedFiles([
      "modified\tpackages/core/package.json",
      "modified\tskills/record-divebell-workflow/references/divebell-cli-runtime.json"
    ].join("\n"), requiredFiles),
    /must remove at least one published changeset/
  );
});

test("requires each version file to be modified exactly once", () => {
  assert.throws(
    () => validateReleaseChangedFiles([
      "modified\tpackages/core/package.json",
      "removed\t.changeset/first.md"
    ].join("\n"), requiredFiles),
    /did not change required file/
  );

  assert.throws(
    () => validateReleaseChangedFiles([
      "modified\tpackages/core/package.json",
      "modified\tpackages/core/package.json",
      "modified\tskills/record-divebell-workflow/references/divebell-cli-runtime.json",
      "removed\t.changeset/first.md"
    ].join("\n"), requiredFiles),
    /more than once/
  );
});
