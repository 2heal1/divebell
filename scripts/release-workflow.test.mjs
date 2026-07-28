import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const publishWorkflow = readFileSync(resolve(
  repositoryRoot,
  ".github/workflows/release.yml"
), "utf8");
const prepareWorkflow = readFileSync(resolve(
  repositoryRoot,
  ".github/workflows/prepare-release.yml"
), "utf8");

test("marks each completed GitHub Release as latest", () => {
  assert.match(publishWorkflow, /gh release edit "\$TAG" --draft=false --latest(?:\r?\n|$)/);
  assert.doesNotMatch(publishWorkflow, /--latest=false/);
});

test("restores the latest marker when rerunning a complete release", () => {
  const completeReleaseMessage = 'echo "Release $TAG is already published with both assets."';
  const completeReleaseIndex = publishWorkflow.indexOf(completeReleaseMessage);
  const releaseEditIndex = publishWorkflow.indexOf('gh release edit "$TAG" --draft=false --latest');

  assert.notEqual(completeReleaseIndex, -1);
  assert.ok(releaseEditIndex > completeReleaseIndex);
  assert.doesNotMatch(
    publishWorkflow.slice(completeReleaseIndex, releaseEditIndex),
    /\bexit 0\b/
  );
});

test("removes published changesets when creating a release pull request", () => {
  assert.match(prepareWorkflow, /--changeset-output "\$CHANGESET_FILES"/);
  assert.match(prepareWorkflow, /mapfile -t changeset_files < "\$CHANGESET_FILES"/);
  assert.match(prepareWorkflow, /git rm -- "\$\{changeset_files\[@\]\}"/);
});

test("validates release pull request file statuses", () => {
  assert.match(publishWorkflow, /pulls\/\$\{\{ github\.event\.pull_request\.number \}\}\/files/);
  assert.match(publishWorkflow, /\[\.status, \.filename\] \| @tsv/);
  assert.doesNotMatch(publishWorkflow, /gh pr diff .* --name-only/);
});
