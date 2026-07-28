import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const workflow = readFileSync(resolve(
  repositoryRoot,
  ".github/workflows/release.yml"
), "utf8");

test("marks each completed GitHub Release as latest", () => {
  assert.match(workflow, /gh release edit "\$TAG" --draft=false --latest(?:\r?\n|$)/);
  assert.doesNotMatch(workflow, /--latest=false/);
});

test("restores the latest marker when rerunning a complete release", () => {
  const completeReleaseMessage = 'echo "Release $TAG is already published with both assets."';
  const completeReleaseIndex = workflow.indexOf(completeReleaseMessage);
  const releaseEditIndex = workflow.indexOf('gh release edit "$TAG" --draft=false --latest');

  assert.notEqual(completeReleaseIndex, -1);
  assert.ok(releaseEditIndex > completeReleaseIndex);
  assert.doesNotMatch(
    workflow.slice(completeReleaseIndex, releaseEditIndex),
    /\bexit 0\b/
  );
});
