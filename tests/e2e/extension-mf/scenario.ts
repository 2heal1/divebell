import assert from "node:assert/strict";
import {
  createServer,
  type Server,
  type ServerResponse
} from "node:http";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import type { StatusInstance } from "@divebell/extension-mf/core";
import { mfTestCommands } from "@divebell/extension-mf/test";
import { divebellTestCommands } from "@divebell/test";

import type { DivebellE2eContext } from "../support/types.js";

interface ListeningServer {
  origin: string;
  close(): Promise<void>;
}

interface MfHostProviderFixture {
  hostUrl: string;
  providerManifestUrl: string;
  providerRemoteEntryUrl: string;
  close(): Promise<void>;
}

const hostIndexUrl = new URL("./fixtures/host/index.html", import.meta.url);
const providerRemoteEntryUrl = new URL("./fixtures/provider/remoteEntry.js", import.meta.url);

export function registerMfExtensionE2e({
  getEnvironment
}: DivebellE2eContext): void {
  test("runs installed MF Extension commands against a real host/provider fixture", async () => {
    const environment = getEnvironment();
    const fixture = await createMfHostProviderFixture();
    let opened = false;
    try {
      const openResult = await environment.runCli(
        divebellTestCommands.open(fixture.hostUrl, {
          noBridge: true,
          session: "mf-e2e"
        })
      );
      opened = true;

      assert.equal(openResult.json.status, "ok");
      assert.equal(openResult.json.data.url, fixture.hostUrl);
      assert.equal(openResult.json.data.bridgeUrl, null);

      const status = await environment.runCli(mfTestCommands.status());
      assert.equal(status.json.status, "ok");
      assert.deepEqual(status.json.data.instances.map(instanceSummary), [
        {
          instanceRef: "mf-host-1",
          name: "divebell_e2e_host",
          role: "consumer",
          active: true,
          consumers: []
        },
        {
          instanceRef: "mf-provider-1",
          name: "divebell_e2e_provider",
          role: "producer",
          active: true,
          consumers: [{
            instanceRef: "mf-host-1",
            name: "divebell_e2e_host"
          }]
        }
      ]);
      assert.equal(
        status.json.data.shared.default?.react?.["18.3.1"]?.from,
        "divebell_e2e_host"
      );

      const moduleInfo = await environment.runCli(
        mfTestCommands.moduleInfo({
          remote: "provider",
          instance: "mf-host-1"
        })
      );
      assert.equal(moduleInfo.json.status, "ok");
      assert.equal(moduleInfo.json.data.remote.status, "loaded");
      assert.equal(moduleInfo.json.data.remote.producerInstanceRef, "mf-provider-1");
      assert.equal(moduleInfo.json.data.remote.manifestUrl, fixture.providerManifestUrl);
      assert.equal(moduleInfo.json.data.remote.remoteEntryUrl, fixture.providerRemoteEntryUrl);
      assert.deepEqual(moduleInfo.json.data.remote.exposes, ["./Widget"]);

      const remoteStatus = await environment.runCli(
        mfTestCommands.remoteStatus({
          remote: "provider",
          instance: "mf-host-1"
        })
      );
      assert.equal(remoteStatus.json.status, "ok");
      assert.equal(remoteStatus.json.data.consumer.instanceRef, "mf-host-1");
      assert.equal(remoteStatus.json.data.remote.name, "divebell_e2e_provider");
      assert.equal(remoteStatus.json.data.remote.declared, true);
      assert.equal(remoteStatus.json.data.remote.loaded, true);
      assert.equal(remoteStatus.json.data.remote.relationship, "resolved");
      assert.equal(remoteStatus.json.data.remote.latestTraceId, "mf-e2e-remote-load");
      assert.deepEqual(remoteStatus.json.data.remote.loadedExposes, ["./Widget"]);
    } finally {
      if (opened) {
        await environment.runCli(divebellTestCommands.stop());
      }
      await fixture.close();
    }
  });
}

function instanceSummary(instance: StatusInstance): {
  instanceRef: string;
  name: string;
  role: StatusInstance["role"];
  active: boolean;
  consumers: StatusInstance["consumers"];
} {
  return {
    instanceRef: instance.instanceRef,
    name: instance.name,
    role: instance.role,
    active: instance.active,
    consumers: instance.consumers
  };
}

async function createMfHostProviderFixture(): Promise<MfHostProviderFixture> {
  const providerRemoteEntrySource = await readFile(providerRemoteEntryUrl, "utf8");
  let providerOrigin = "";
  const provider = await listen(createServer((request, response) => {
    if (request.url === "/remoteEntry.js") {
      send(response, 200, providerRemoteEntrySource, "text/javascript; charset=utf-8");
      return;
    }
    if (request.url === "/mf-manifest.json") {
      sendJson(response, {
        id: "divebell_e2e_provider",
        name: "divebell_e2e_provider",
        metaData: {
          name: "divebell_e2e_provider",
          type: "app",
          remoteEntry: {
            name: "remoteEntry.js",
            path: `${providerOrigin}/remoteEntry.js`,
            type: "global"
          }
        },
        exposes: [{
          id: "divebell_e2e_provider:./Widget",
          name: "./Widget",
          path: "./Widget"
        }],
        shared: [{
          name: "react",
          version: "18.3.1"
        }]
      });
      return;
    }
    send(response, 404, "Not found", "text/plain; charset=utf-8");
  }));
  providerOrigin = provider.origin;

  const hostIndex = await readFile(hostIndexUrl, "utf8");
  const host = await listen(createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://127.0.0.1").pathname;
    if (path === "/" || path === "/index.html") {
      send(response, 200, hostIndex, "text/html; charset=utf-8");
      return;
    }
    send(response, 404, "Not found", "text/plain; charset=utf-8");
  }));

  return {
    hostUrl: `${host.origin}/?provider=${encodeURIComponent(provider.origin)}`,
    providerManifestUrl: `${provider.origin}/mf-manifest.json`,
    providerRemoteEntryUrl: `${provider.origin}/remoteEntry.js`,
    async close() {
      await Promise.all([
        host.close(),
        provider.close()
      ]);
    }
  };
}

function listen(server: Server): Promise<ListeningServer> {
  return new Promise<ListeningServer>((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (address === null || typeof address === "string") {
        reject(new Error("Could not resolve test server address."));
        return;
      }
      resolvePromise({
        origin: `http://127.0.0.1:${address.port}`,
        close: () => new Promise<void>((closeResolve, closeReject) => {
          server.close((error) => {
            if (error) closeReject(error);
            else closeResolve();
          });
        })
      });
    });
  });
}

function sendJson(response: ServerResponse, value: unknown): void {
  send(response, 200, `${JSON.stringify(value)}\n`, "application/json; charset=utf-8");
}

function send(
  response: ServerResponse,
  statusCode: number,
  body: string,
  contentType: string
): void {
  response.writeHead(statusCode, {
    "content-type": contentType,
    "cache-control": "no-store"
  });
  response.end(body);
}
