import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import vm from "node:vm";
import test from "node:test";

import {
  createMfProxyInitScript,
  readMfProxyOverrides
} from "../dist/proxy.js";

const packageRoot = new URL("..", import.meta.url);

test("--mf-proxy combines inline rules with nested and flat JSON files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-mf-proxy-"));
  try {
    const nested = join(directory, "nested.json");
    const flat = join(directory, "flat.json");
    writeFileSync(nested, JSON.stringify({
      overrides: {
        catalog: "2.0.0",
        account: "https://cdn.test/account/mf-manifest.json"
      }
    }));
    writeFileSync(flat, JSON.stringify({
      checkout: "3.1.0"
    }));
    const result = await readMfProxyOverrides({
      command: ["open", "https://app.test"],
      options: new Map([["mf-proxy", [
        "shop=1.2.3",
        nested,
        flat
      ]]])
    });
    assert.deepEqual({ ...result }, {
      shop: "1.2.3",
      catalog: "2.0.0",
      account: "https://cdn.test/account/mf-manifest.json",
      checkout: "3.1.0"
    });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("--mf-proxy rejects duplicate remotes and invalid JSON files", async () => {
  const directory = mkdtempSync(join(tmpdir(), "openruntime-mf-proxy-invalid-"));
  try {
    const duplicate = join(directory, "duplicate.json");
    const invalid = join(directory, "invalid.json");
    writeFileSync(duplicate, JSON.stringify({ shop: "2.0.0" }));
    writeFileSync(invalid, "{");
    await assert.rejects(
      readMfProxyOverrides({
        command: ["open", "https://app.test"],
        options: new Map([["mf-proxy", ["shop=1.0.0", duplicate]]])
      }),
      /configured more than once/
    );
    await assert.rejects(
      readMfProxyOverrides({
        command: ["open", "https://app.test"],
        options: new Map([["mf-proxy", [invalid]]])
      }),
      /Invalid --mf-proxy JSON file/
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("proxy injection applies overrides and the next ordinary open restores prior storage", () => {
  const proxySdk = readFileSync(
    new URL("assets/vmok-proxy-sdk.iife.js", packageRoot),
    "utf8"
  );
  const storage = createStorage({
    __MF_DEVTOOLS__: JSON.stringify({ overrides: { original: "1.0.0" } }),
    MF_ENV: "previous"
  });
  const proxied = createContext(storage);
  vm.runInContext(
    createMfProxyInitScript(proxySdk, {
      shop: "2.0.0",
      account: "https://cdn.test/account/mf-manifest.json"
    }),
    proxied,
    { timeout: 5_000 }
  );

  assert.equal(proxied.__OPENRUNTIME_MF_PROXY_INJECTION__.status, "installed");
  assert.deepEqual(
    JSON.parse(storage.getItem("__MF_DEVTOOLS__")).overrides,
    {
      shop: "2.0.0",
      account: "https://cdn.test/account/mf-manifest.json"
    }
  );
  assert.equal(storage.getItem("MF_ENV"), "true");
  assert.deepEqual(
    [...proxied.__FEDERATION__.__GLOBAL_PLUGIN__].map((plugin) => plugin.name),
    [
      "mf-chrome-devtools-override-remotes-plugin",
      "mf-chrome-devtools-inject-snapshot-plugin",
      "openruntime-mf-proxy-snapshot-override"
    ]
  );

  const versionRemote = {
    name: "catalog",
    alias: "shop",
    entry: "https://cdn.test/catalog/mf-manifest.json"
  };
  const urlRemote = {
    name: "account",
    version: "1.0.0"
  };
  proxied.__FEDERATION__.__GLOBAL_PLUGIN__[0].beforeRegisterRemote({
    remote: versionRemote
  });
  proxied.__FEDERATION__.__GLOBAL_PLUGIN__[0].beforeRegisterRemote({
    remote: urlRemote
  });
  assert.equal(versionRemote.version, "2.0.0");
  assert.equal(versionRemote.entry, undefined);
  assert.equal(
    urlRemote.entry,
    "https://cdn.test/account/mf-manifest.json"
  );
  assert.equal(urlRemote.version, undefined);

  proxied.__FEDERATION__.moduleInfo = {
    host: {
      remotesInfo: {
        "un_publish:catalog": {
          matchedVersion: "https://cdn.test/catalog/mf-manifest.json",
          moduleSource: "static-module"
        }
      }
    }
  };
  proxied.__FEDERATION__.__GLOBAL_PLUGIN__[2].beforeLoadRemoteSnapshot({
    moduleInfo: versionRemote,
    origin: { options: { name: "host" } }
  });
  assert.equal(
    proxied.__FEDERATION__.moduleInfo.host.remotesInfo["un_publish:catalog"]
      .matchedVersion,
    "2.0.0"
  );
  assert.equal(
    proxied.__FEDERATION__.moduleInfo.host.remotesInfo["un_publish:catalog"]
      .moduleSource,
    "static-module"
  );

  const ordinary = createContext(storage);
  vm.runInContext(createMfProxyInitScript(undefined, {}), ordinary, {
    timeout: 5_000
  });
  assert.deepEqual(JSON.parse(storage.getItem("__MF_DEVTOOLS__")), {
    overrides: { original: "1.0.0" }
  });
  assert.equal(storage.getItem("MF_ENV"), "previous");
  assert.equal(storage.getItem("__OPENRUNTIME_MF_PROXY_OWNER__"), null);
  assert.equal(ordinary.__OPENRUNTIME_MF_PROXY_INJECTION__, undefined);
});

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    }
  };
}

function createContext(localStorage) {
  const context = vm.createContext({
    console: { log() {}, info() {}, warn() {}, error() {} },
    localStorage,
    URL
  });
  context.globalThis = context;
  context.window = context;
  context.top = context;
  return context;
}
