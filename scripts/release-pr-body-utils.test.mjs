import assert from "node:assert/strict";
import test from "node:test";

import {
  parseChangeset,
  renderReleasePullRequestBody
} from "./release-pr-body-utils.mjs";

test("parses package names and normalizes a multiline changeset summary", () => {
  assert.deepEqual(
    parseChangeset(`---
"@divebell/core": minor
'@divebell/cli': patch
---

Add a new runtime capability
and document how to use it.
`, "example.md"),
    {
      packages: ["@divebell/core", "@divebell/cli"],
      summary: "Add a new runtime capability and document how to use it."
    }
  );
});

test("renders release changes and affected packages without attribution trailers", () => {
  const body = renderReleasePullRequestBody({
    version: "1.2.0",
    tag: "recording-skill-runtime-v1.2.0",
    changesets: [
      {
        packages: ["@divebell/core", "@divebell/cli"],
        summary: "Add a new runtime capability."
      },
      {
        packages: ["@divebell/cli"],
        summary: "Improve CLI output."
      }
    ]
  });

  assert.match(body, /## Changes in 1\.2\.0/);
  assert.match(body, /- Add a new runtime capability\./);
  assert.match(body, /- Improve CLI output\./);
  assert.equal(body.match(/`@divebell\/cli`/g)?.length, 1);
  assert.match(body, /`recording-skill-runtime-v1\.2\.0`/);
  assert.doesNotMatch(body, /riff|co-authored-by/i);
});

test("rejects changesets without a usable summary", () => {
  assert.throws(
    () => parseChangeset(`---
"@divebell/core": patch
---
`, "empty.md"),
    /frontmatter and a summary/
  );
});
