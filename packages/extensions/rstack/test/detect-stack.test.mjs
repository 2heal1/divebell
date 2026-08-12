import assert from "node:assert/strict";
import test from "node:test";
import vm from "node:vm";

import {
  classifyRstackEntryFilename,
  createRstackFetchDetectionScript,
  detectRstackStack,
  extractRspackRuntimeDetails,
  getRstackStatus,
  runtimeDetailsToRspackConfig
} from "../dist/index.js";

test("classifies only index, main, and runtime entry filenames", () => {
  assert.equal(classifyRstackEntryFilename("index.123.js"), "index");
  assert.equal(classifyRstackEntryFilename("app-main.123.js"), "main");
  assert.equal(classifyRstackEntryFilename("runtime~app.js"), "runtime");
  assert.equal(classifyRstackEntryFilename("vmok-remote-entry.js"), undefined);
  assert.equal(classifyRstackEntryFilename("vendor.js"), undefined);
});

test("detectStack recommends rstack only when fetched source has data-rspack", async () => {
  const browser = new DetectBrowser({
    schemaVersion: 1,
    status: "found",
    checked: ["index.js", "main.123.js"],
    failureCount: 0,
    matched: "main.123.js",
    runtime: {
      mode: "webpack-compatible",
      requireExpression: "__webpack_require__",
      globals: {
        publicPath: {
          expression: "__webpack_require__.p",
          kind: "value",
          value: "/assets/"
        }
      }
    }
  });
  const result = await detectRstackStack({ browser }, "rstack");
  assert.equal(result?.id, "rspack");
  assert.equal(result?.command, "rstack");
  assert.match(result?.evidence[0] ?? "", /data-rspack.*main\.123\.js/u);
  assert.equal("details" in result, false);
  assert.match(browser.script, /performance\.getEntriesByType/u);
  assert.doesNotMatch(browser.script, /MutationObserver|Debugger/u);
});

test("rstack status returns only official recoverable Rspack config fields", async () => {
  const result = await getRstackStatus({
    browser: new DetectBrowser({
      schemaVersion: 1,
      status: "found",
      checked: ["runtime.js"],
      failureCount: 0,
      matched: "runtime.js",
      runtime: {
        mode: "webpack-compatible",
        requireExpression: "__webpack_require__",
        globals: {
          publicPath: {
            expression: "__webpack_require__.p",
            kind: "value",
            value: "/assets/"
          },
          runtimeId: {
            expression: "__webpack_require__.j",
            kind: "value",
            value: "campaign"
          },
          rspackVersion: {
            expression: "__webpack_require__.rv",
            kind: "function",
            value: "1.5.0"
          },
          rspackUniqueId: {
            expression: "__webpack_require__.ruid",
            kind: "value",
            value: "bundler=rspack@1.5.0"
          },
          getChunkScriptFilename: {
            expression: "__webpack_require__.u",
            kind: "function"
          },
          getChunkCssFilename: {
            expression: "__webpack_require__.k",
            kind: "function"
          },
          getChunkUpdateScriptFilename: {
            expression: "__webpack_require__.hu",
            kind: "function"
          },
          getUpdateManifestFilename: {
            expression: "__webpack_require__.hmrF",
            kind: "function"
          },
          baseURI: {
            expression: "__webpack_require__.b",
            kind: "dynamic"
          }
        }
      }
    })
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    status: "found",
    script: "runtime.js",
    rspackConfig: {
      experiments: {
        rspackFuture: {
          bundlerInfo: {
            bundler: "rspack",
            version: "1.5.0"
          }
        }
      },
      output: {
        publicPath: "/assets/"
      }
    }
  });
  assert.equal("bundlerRuntime" in result, false);
});

test("rstack status keeps fetch diagnostics on unsuccessful detection", async () => {
  const result = await getRstackStatus({
    browser: new DetectBrowser({
      schemaVersion: 1,
      status: "unavailable",
      checked: ["runtime.js"],
      failureCount: 1
    })
  });

  assert.deepEqual(result, {
    schemaVersion: 1,
    status: "unavailable",
    diagnostics: {
      checkedScripts: ["runtime.js"],
      failureCount: 1
    }
  });
});

test("maps Rspack 2 bundler information to output.bundlerInfo", () => {
  assert.deepEqual(runtimeDetailsToRspackConfig({
    mode: "webpack-compatible",
    requireExpression: "__webpack_require__",
    globals: {
      rspackVersion: {
        expression: "__webpack_require__.rv",
        kind: "function",
        value: "2.1.7"
      },
      rspackUniqueId: {
        expression: "__webpack_require__.ruid",
        kind: "value",
        value: "bundler=rspack@2.1.7"
      }
    }
  }), {
    output: {
      bundlerInfo: {
        bundler: "rspack",
        version: "2.1.7"
      }
    }
  });
});

test("detectStack treats fetch failures and missing markers as no detection", async () => {
  for (const status of ["not-found", "unavailable"]) {
    const browser = new DetectBrowser({
      schemaVersion: 1,
      status,
      checked: ["runtime.js"],
      failureCount: status === "unavailable" ? 1 : 0
    });
    assert.equal(await detectRstackStack({ browser }, "rstack"), undefined);
  }
});

test("fetch detection checks every matching entry until data-rspack is found", async () => {
  const fetched = [];
  const context = vm.createContext({
    AbortController,
    URL,
    clearTimeout,
    decodeURIComponent,
    document: {
      scripts: [
        { src: "https://example.com/vendor.js" },
        { src: "https://example.com/index~0.123.js" },
        { src: "https://example.com/index~2.123.js" },
        { src: "https://example.com/app-main.123.js" },
        { src: "https://example.com/another-main.js" }
      ]
    },
    fetch: async (url, options) => {
      fetched.push({ url, options });
      return {
        ok: true,
        async text() {
          return url.includes("index~2")
            ? `
                script.setAttribute("data-rspack", key);
                __webpack_require__.p = "/assets/";
                __webpack_require__.j = "campaign";
                __webpack_require__.rv = () => ("1.5.0");
                __webpack_require__.u = (chunkId) => chunkId + ".js";
              `
            : "ordinary source";
        }
      };
    },
    location: { href: "https://example.com/" },
    performance: {
      getEntriesByType() {
        return [
          {
            initiatorType: "script",
            name: "https://example.com/runtime~app.js"
          },
          {
            initiatorType: "script",
            name: "https://example.com/runtime-second.js"
          }
        ];
      }
    },
    setTimeout
  });
  const result = await vm.runInContext(
    createRstackFetchDetectionScript(true),
    context
  );

  assert.equal(result.status, "found");
  assert.equal(result.matched, "index~2.123.js");
  assert.equal(result.runtime.mode, "webpack-compatible");
  assert.equal(result.runtime.globals.publicPath.value, "/assets/");
  assert.equal(result.runtime.globals.runtimeId.value, "campaign");
  assert.equal(result.runtime.globals.rspackVersion.value, "1.5.0");
  assert.equal(result.runtime.globals.rspackVersion.kind, "function");
  assert.equal(result.runtime.globals.getChunkScriptFilename.kind, "function");
  assert.deepEqual(Array.from(result.checked), [
    "index~0.123.js",
    "index~2.123.js"
  ]);
  assert.equal(fetched.length, 2);
  assert.equal(fetched.every(({ options }) =>
    options.cache === "force-cache"
    && options.credentials === "same-origin"
  ), true);
});

test("extracts rspack runtime-mode globals without evaluating source", () => {
  const result = extractRspackRuntimeDetails(`
    __rspack_context.p = scriptUrl;
    __rspack_context.j = null;
    __rspack_context.ruid = "bundler=rspack@1.5.0";
    __rspack_context.hu = (chunkId) => chunkId + ".hot-update.js";
    throw new Error("must not execute");
  `);

  assert.equal(result.mode, "rspack");
  assert.equal(result.requireExpression, "__rspack_context");
  assert.equal(result.globals.publicPath.kind, "dynamic");
  assert.deepEqual(result.globals.runtimeId, {
    expression: "__rspack_context.j",
    kind: "value",
    value: null
  });
  assert.equal(result.globals.rspackUniqueId.value, "bundler=rspack@1.5.0");
  assert.equal(result.globals.getChunkUpdateScriptFilename.kind, "function");
});

test("fetch detection absorbs request errors", async () => {
  const context = vm.createContext({
    AbortController,
    URL,
    clearTimeout,
    decodeURIComponent,
    document: { scripts: [{ src: "https://example.com/main.js" }] },
    fetch: async () => {
      throw new Error("CORS blocked");
    },
    location: { href: "https://example.com/" },
    performance: { getEntriesByType: () => [] },
    setTimeout
  });
  const result = await vm.runInContext(
    createRstackFetchDetectionScript(),
    context
  );
  assert.equal(result.status, "unavailable");
  assert.equal(result.failureCount, 1);
});

class DetectBrowser {
  constructor(result) {
    this.result = result;
  }

  async eval(script) {
    this.script = script;
    return this.result;
  }
}
