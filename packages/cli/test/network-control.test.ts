import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import {
  createPacScript,
  matchBrowserNetworkRule,
  rewriteBrowserRequestUrl,
  validateBrowserNetworkRules,
  validateBrowserProxyDescriptor
} from "../dist/features/browser/network-control.js";
import { fetchNetworkFulfillResponse } from "../dist/features/browser/network-control-server.js";
import { stopNetworkControl } from "../dist/features/browser/network-control-process.js";
import { validateExtension } from "../dist/commands/definition.js";

test("generates escaped PAC rules with a DIRECT fallback", () => {
  const descriptor = validateBrowserProxyDescriptor({
    schemaVersion: 1,
    endpoints: [{ id: "local", url: "socks5://127.0.0.1:1080" }],
    rules: [
      { endpoint: "local", match: { hostSuffixes: ["example.test"], urlGlobs: ["https://example.test/a'\\n*"] } }
    ],
    fallback: "DIRECT"
  });
  const pac = createPacScript(descriptor);
  assert.match(pac, /SOCKS5 127\.0\.0\.1:1080/);
  assert.match(pac, /return 'DIRECT';/);
  assert.doesNotMatch(pac, /a'\n/);
  assert.ok(pac.includes(JSON.stringify("https://example.test/a'\\n*")));
});

test("validates HTTP and SOCKS proxy endpoints without accepting credentials or paths", () => {
  assert.doesNotThrow(() => validateBrowserProxyDescriptor({
    schemaVersion: 1,
    endpoints: [
      { id: "http", url: "http://127.0.0.1:8080" },
      { id: "socks", url: "socks5://127.0.0.1:1080" }
    ],
    rules: [{ endpoint: "http" }, { endpoint: "socks", match: { hosts: ["api.example.test"] } }]
  }));
  assert.throws(() => validateBrowserProxyDescriptor({
    schemaVersion: 1,
    endpoints: [{ id: "bad", url: "http://user:secret@127.0.0.1:8080/path" }],
    rules: [{ endpoint: "bad" }]
  }), /credentials, a path/);
});

test("matches and rewrites HTTP(S) resource URLs while retaining the unmatched suffix", () => {
  const rules = validateBrowserNetworkRules({
    schemaVersion: 1,
    rules: [{
      id: "local-assets",
      match: { urlPrefix: "https://a.com/assets/", resourceTypes: ["Script", "XHR"] },
      action: { type: "rewrite", targetPrefix: "http://localhost:3100/static/" }
    }]
  });
  const rule = matchBrowserNetworkRule(rules, {
    url: "https://a.com/assets/app.js?build=1",
    resourceType: "Script"
  });
  assert.equal(rule?.id, "local-assets");
  assert.equal(rewriteBrowserRequestUrl(rule as NonNullable<typeof rule>, "https://a.com/assets/app.js?build=1"), "http://localhost:3100/static/app.js?build=1");
  assert.equal(matchBrowserNetworkRule(rules, { url: "ws://a.com/assets/socket", resourceType: "WebSocket" }), undefined);
});

test("fetches and normalizes a fulfilled response without forwarding browser credentials", async () => {
  let requestHeaders: Headers | undefined;
  const result = await fetchNetworkFulfillResponse(
    "https://replacement.test/resource",
    {
      method: "POST",
      headers: { Cookie: "session=secret", Authorization: "Bearer secret", "X-Keep": "yes" },
      postData: "payload"
    },
    1000,
    async (_url, init) => {
      requestHeaders = new Headers(init?.headers);
      return new Response("replacement", {
        status: 201,
        headers: { "content-encoding": "gzip", "x-source": "controller" }
      });
    }
  );
  assert.equal(requestHeaders?.get("cookie"), null);
  assert.equal(requestHeaders?.get("authorization"), null);
  assert.equal(requestHeaders?.get("x-keep"), "yes");
  assert.equal(result.status, 201);
  assert.equal(Buffer.from(result.body, "base64").toString("utf8"), "replacement");
  assert.equal(result.headers.some((header) => header.name === "content-encoding"), false);
});

test("times out a control-plane fulfill fetch", async () => {
  await assert.rejects(
    fetchNetworkFulfillResponse(
      "https://replacement.test/slow",
      undefined,
      5,
      async (_url, init) => await new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
      })
    ),
    /aborted/
  );
});

test("validates an Extension browserProxyProvider and cleans up a managed control", async () => {
  const extension = validateExtension({
    schemaVersion: 1,
    name: "proxy-tools",
    browserProxyProvider: {
      resolve: async () => ({
        schemaVersion: 1,
        endpoints: [{ id: "tool", url: "http://127.0.0.1:8080" }],
        rules: [{ endpoint: "tool" }]
      })
    }
  });
  assert.equal(typeof extension.browserProxyProvider?.resolve, "function");

  let stopped = false;
  const server = createServer((request, response) => {
    if (request.method === "POST" && request.url?.startsWith("/stop?token=test-token")) stopped = true;
    response.writeHead(204).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.notEqual(address, null);
  assert.notEqual(typeof address, "string");
  const directory = mkdtempSync(join(tmpdir(), "divebell-network-control-"));
  const configPath = join(directory, "control.json");
  writeFileSync(configPath, "{}\n");
  await stopNetworkControl({
    fingerprint: "fingerprint",
    pid: 123456,
    controlUrl: `http://127.0.0.1:${(address as { port: number }).port}`,
    token: "test-token",
    configPath
  }, {
    isRunning: () => false,
    stop: () => assert.fail("dead control must not be signaled")
  });
  assert.equal(stopped, true);
  assert.equal(existsSync(configPath), false);
  await new Promise<void>((resolve) => server.close(() => resolve()));
});
