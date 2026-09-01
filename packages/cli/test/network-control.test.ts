import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import {
  matchBrowserNetworkRule,
  rewriteBrowserRequestUrl,
  validateBrowserNetworkRules,
  validateBrowserProxyPacUrl
} from "../dist/features/browser/network-control.js";
import { fetchNetworkFulfillResponse, NetworkCdpController, type NetworkCdpControllerClient } from "../dist/features/browser/network-control-server.js";
import { stopNetworkControl } from "../dist/features/browser/network-control-process.js";

test("validates PAC HTTP(S) URLs without requiring a .pac suffix", () => {
  assert.equal(
    validateBrowserProxyPacUrl("http://127.0.0.1:8080/config?token=test"),
    "http://127.0.0.1:8080/config?token=test"
  );
  assert.equal(
    validateBrowserProxyPacUrl("https://proxy.example.test/proxy.pac"),
    "https://proxy.example.test/proxy.pac"
  );
  assert.throws(() => validateBrowserProxyPacUrl("file:///tmp/proxy.pac"), /HTTP\(S\)/);
  assert.throws(() => validateBrowserProxyPacUrl("http://user:secret@127.0.0.1:8080/config"), /credentials/);
  assert.throws(() => validateBrowserProxyPacUrl("http://127.0.0.1:8080/config#fragment"), /fragment/);
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
  assert.equal(matchBrowserNetworkRule(rules, { url: "https://a.com/assets/app.js" }), undefined);
  assert.throws(() => validateBrowserNetworkRules({
    schemaVersion: 1,
    rules: [{
      id: "unsupported-redirect",
      match: { url: "https://a.com/old" },
      action: { type: "redirect", url: "https://b.com/new" }
    }]
  }), /rewrite or fulfill/);
});

test("contains asynchronous CDP event errors instead of creating an unhandled rejection", async () => {
  let listener: Parameters<NetworkCdpControllerClient["onEvent"]>[0] | undefined;
  const client: NetworkCdpControllerClient = {
    onEvent(nextListener) { listener = nextListener; },
    async send(method: string) {
      if (method === "Fetch.enable") throw new Error("target closed during Fetch.enable");
      return {};
    },
    close() {}
  };
  const controller = NetworkCdpController.createForTesting(client, undefined);
  const unhandled: unknown[] = [];
  const onUnhandled = (reason: unknown) => unhandled.push(reason);
  process.on("unhandledRejection", onUnhandled);
  try {
    listener?.({
      method: "Target.attachedToTarget",
      params: { sessionId: "session-1", targetInfo: { type: "page" } }
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.equal(controller.status().eventErrors, 1);
    assert.equal(controller.status().enabledTargets, 0);
    assert.deepEqual(unhandled, []);
  } finally {
    process.off("unhandledRejection", onUnhandled);
    controller.close();
  }
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

test("cleans up a managed network-control process", async () => {
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
