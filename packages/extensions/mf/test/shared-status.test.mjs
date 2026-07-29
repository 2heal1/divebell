import assert from "node:assert/strict";
import test from "node:test";

import {
  createSharedStatusResult,
  parseBrowserReadResult
} from "../dist/public.js";
import { formatSharedStatus } from "../dist/shared/format.js";
import { browserRead, runtimeState } from "./fixtures.mjs";

function snapshot(globalShared) {
  return parseBrowserReadResult(
    browserRead(runtimeState(), [], { globalShared })
  ).snapshot;
}

function sharedFixture() {
  return {
    default: {
      react: {
        "17.0.2": {
          from: "legacy",
          useIn: [],
          loaded: false,
          loading: true,
          get: { source: "() => legacyReact" }
        },
        "18.3.1": {
          from: "host",
          useIn: ["host", "remote"],
          loaded: true,
          loading: true,
          strategy: "loaded-first",
          lib: {
            source: "() => react",
            location: {
              url: "https://cdn.test/assets/main.js",
              line: 120,
              column: 18,
              original: {
                source: "src/shared/react.ts",
                line: 14,
                column: 2
              }
            }
          }
        }
      },
      vue: {
        "3.5.0": {
          from: "host",
          useIn: ["host"],
          loaded: true
        }
      }
    },
    legacy: {
      react: {
        "16.14.0": {
          from: "legacy-remote",
          useIn: ["legacy-host"],
          loaded: true
        }
      }
    }
  };
}

test("shared status keeps the global scope-package-version shape and loaded entries only", () => {
  const result = createSharedStatusResult(
    snapshot(sharedFixture()),
    { package: "react" }
  );

  assert.deepEqual(result, {
    shared: {
      default: {
        react: {
          "18.3.1": {
            from: "host",
            useIn: ["host", "remote"],
            loaded: true,
            strategy: "loaded-first"
          }
        }
      },
      legacy: {
        react: {
          "16.14.0": {
            from: "legacy-remote",
            useIn: ["legacy-host"],
            loaded: true
          }
        }
      }
    }
  });
  assert.equal(JSON.stringify(result).includes("instances"), false);
  assert.equal(JSON.stringify(result).includes("vue"), false);
  assert.equal(JSON.stringify(result).includes("17.0.2"), false);
  assert.equal(JSON.stringify(result).includes("lib"), false);
});

test("shared status supports exact scope and version filters", () => {
  const result = createSharedStatusResult(
    snapshot(sharedFixture()),
    {
      package: "react",
      scope: "default",
      version: "18.3.1"
    }
  );

  assert.deepEqual(Object.keys(result.shared), ["default"]);
  assert.deepEqual(
    Object.keys(result.shared.default.react),
    ["18.3.1"]
  );

  const missing = createSharedStatusResult(
    snapshot(sharedFixture()),
    {
      package: "react",
      scope: "default",
      version: "17.0.2"
    }
  );
  assert.deepEqual(missing, { shared: {} });
});

test("shared status verbose includes unloaded entries and function details", () => {
  const result = createSharedStatusResult(
    snapshot(sharedFixture()),
    {
      package: "react",
      scope: "default",
      version: "17.0.2"
    },
    { verbose: true }
  );

  assert.deepEqual(result, {
    shared: {
      default: {
        react: {
          "17.0.2": {
            from: "legacy",
            useIn: [],
            loaded: false,
            loading: true,
            get: { source: "() => legacyReact" }
          }
        }
      }
    }
  });

  const loaded = createSharedStatusResult(
    snapshot(sharedFixture()),
    {
      package: "react",
      scope: "default",
      version: "18.3.1"
    },
    { verbose: true }
  );
  assert.equal(loaded.shared.default.react["18.3.1"].lib.source, "() => react");
  assert.equal(loaded.shared.default.react["18.3.1"].loading, undefined);
  assert.equal(
    loaded.shared.default.react["18.3.1"].lib.location.original.source,
    "src/shared/react.ts"
  );
});

test("shared status formatter returns the shared map only", () => {
  const result = createSharedStatusResult(
    snapshot(sharedFixture()),
    { package: "react", scope: "legacy" }
  );
  assert.deepEqual(JSON.parse(formatSharedStatus(result)), result.shared);
});
