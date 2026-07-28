import assert from "node:assert/strict";
import test from "node:test";

import {
  sourceMapOriginalLocation
} from "../dist/function-location.js";

test("source maps resolve a generated function position to original source", () => {
  const sourceMap = JSON.stringify({
    version: 3,
    file: "main.js",
    sourceRoot: "webpack://host/",
    sources: ["src/shared/react.ts"],
    sourcesContent: ["export const getReact = () => React;"],
    names: [],
    mappings: "AAAA"
  });
  assert.deepEqual(
    sourceMapOriginalLocation(sourceMap, 0, 48),
    {
      source: "webpack://host/src/shared/react.ts",
      line: 1,
      column: 1
    }
  );
});

test("source map locations remove credentials, queries, and fragments", () => {
  const sourceMap = JSON.stringify({
    version: 3,
    file: "main.js",
    sources: ["https://user:secret@source.test/react.ts?token=hidden#hash"],
    names: [],
    mappings: "AAAA"
  });
  assert.deepEqual(
    sourceMapOriginalLocation(sourceMap, 0, 0),
    {
      source: "https://source.test/react.ts",
      line: 1,
      column: 1
    }
  );
});

test("invalid and oversized source maps are ignored", () => {
  assert.equal(sourceMapOriginalLocation("not-json", 0, 0), undefined);
  assert.equal(
    sourceMapOriginalLocation(
      JSON.stringify({
        version: 3,
        sources: ["a.ts"],
        names: [],
        mappings: ""
      }),
      0,
      0
    ),
    undefined
  );
  assert.equal(
    sourceMapOriginalLocation(" ".repeat(5 * 1024 * 1024 + 1), 0, 0),
    undefined
  );
});
