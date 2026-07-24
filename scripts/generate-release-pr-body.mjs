#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  parseChangeset,
  renderReleasePullRequestBody
} from "./release-pr-body-utils.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const base = getRequiredOption("--base");
const version = getRequiredOption("--version");
const tag = getRequiredOption("--tag");
const output = resolve(getRequiredOption("--output"));
const changesetPaths = changedChangesetPaths(base);
if (changesetPaths.length === 0) {
  throw new Error(`No changeset descriptions changed since ${base}.`);
}

const changesets = await Promise.all(changesetPaths.map(async (relativePath) => ({
  relativePath,
  ...parseChangeset(
    await readFile(resolve(repositoryRoot, relativePath), "utf8"),
    relativePath
  )
})));
const body = renderReleasePullRequestBody({ version, tag, changesets });
await writeFile(output, body, "utf8");

process.stdout.write(`${JSON.stringify({
  ok: true,
  base,
  version,
  tag,
  output,
  changesets: changesets.map((changeset) => changeset.relativePath)
}, null, 2)}\n`);

function changedChangesetPaths(baseRevision) {
  const result = spawnSync("git", [
    "diff",
    "--name-only",
    "--diff-filter=ACMRT",
    `${baseRevision}...HEAD`,
    "--",
    ".changeset"
  ], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
  if (result.status !== 0) {
    throw new Error(`Could not find changesets since ${baseRevision}: ${result.stderr.trim()}`);
  }
  return result.stdout
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter((value) => /^\.changeset\/[^/]+\.md$/.test(value))
    .sort();
}

function getRequiredOption(name) {
  const index = process.argv.indexOf(name);
  const value = index === -1 ? undefined : process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${name} is required.`);
  }
  return value;
}
