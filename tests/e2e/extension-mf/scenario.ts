import assert from "node:assert/strict";
import {
  createServer,
  type Server
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

interface MfManifest {
  metaData: {
    remoteEntry: {
      name: string;
    };
  };
}

const hostDistUrl = new URL("./fixtures/host/dist/", import.meta.url);
const providerDistUrl = new URL("./fixtures/provider/dist/mf/", import.meta.url);

export function registerMfExtensionE2e({
  getEnvironment
}: DivebellE2eContext): void {
  test("runs installed MF Extension commands against an Rsbuild host and Rslib provider", async () => {
    const environment = getEnvironment();
    const fixture = await createMfHostProviderFixture();
    let opened = false;
    try {
      const openResult = await environment.runCli(
        divebellTestCommands.open(fixture.hostUrl, {
          mf: true,
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
      const host = status.json.data.instances.find(
        (instance) => instance.name === "divebell_e2e_host"
      );
      const provider = status.json.data.instances.find(
        (instance) => instance.name === "divebell_e2e_provider"
      );
      assert.deepEqual(host === undefined ? undefined : instanceSummary(host), {
        instanceRef: host?.instanceRef,
        name: "divebell_e2e_host",
        role: "mixed",
        active: true,
        consumers: []
      });
      assert.deepEqual(provider === undefined ? undefined : instanceSummary(provider), {
        instanceRef: provider?.instanceRef,
        name: "divebell_e2e_provider",
        role: "producer",
        active: true,
        consumers: [{
          instanceRef: host?.instanceRef,
          name: "divebell_e2e_host"
        }]
      });
      assert.ok(host !== undefined);
      assert.ok(provider !== undefined);

      const moduleInfo = await environment.runCli(
        mfTestCommands.moduleInfo({
          remote: "provider",
          instance: host.instanceRef
        })
      );
      assert.equal(moduleInfo.json.status, "ok");
      assert.equal(moduleInfo.json.data.remote.status, "loaded");
      assert.equal(moduleInfo.json.data.remote.producerInstanceRef, provider.instanceRef);
      assert.equal(moduleInfo.json.data.remote.manifestUrl, fixture.providerManifestUrl);
      assert.equal(moduleInfo.json.data.remote.remoteEntryUrl, fixture.providerRemoteEntryUrl);
      assert.deepEqual(moduleInfo.json.data.remote.exposes, ["./Widget"]);

      const remoteStatus = await environment.runCli(
        mfTestCommands.remoteStatus({
          remote: "provider",
          instance: host.instanceRef
        })
      );
      assert.equal(remoteStatus.json.status, "ok");
      assert.equal(remoteStatus.json.data.consumer.instanceRef, host.instanceRef);
      assert.equal(remoteStatus.json.data.remote.name, "divebell_e2e_provider");
      assert.equal(remoteStatus.json.data.remote.declared, true);
      assert.equal(remoteStatus.json.data.remote.loaded, true);
      assert.equal(remoteStatus.json.data.remote.relationship, "resolved");
      assert.equal(typeof remoteStatus.json.data.remote.latestTraceId, "string");
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
  const manifest = JSON.parse(
    await readFile(new URL("mf-manifest.json", providerDistUrl), "utf8")
  ) as MfManifest;
  assert.equal(typeof manifest.metaData.remoteEntry.name, "string");

  const host = await listen(createServer((request, response) => {
    void serveMfFixture(request.url, response).catch((error: unknown) => {
      response.writeHead(500, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(error instanceof Error ? error.message : String(error));
    });
  }));

  return {
    hostUrl: `${host.origin}/`,
    providerManifestUrl: `${host.origin}/provider/mf-manifest.json`,
    providerRemoteEntryUrl: `/provider/${manifest.metaData.remoteEntry.name}`,
    close: host.close
  };
}

async function serveMfFixture(
  requestUrl: string | undefined,
  response: import("node:http").ServerResponse
): Promise<void> {
  const pathname = new URL(requestUrl ?? "/", "http://127.0.0.1").pathname;
  const isProvider = pathname.startsWith("/provider/");
  const relativePath = isProvider
    ? pathname.slice("/provider/".length)
    : pathname === "/" ? "index.html" : pathname.slice(1);
  const root = isProvider ? providerDistUrl : hostDistUrl;
  const assetUrl = new URL(relativePath, root);
  if (!assetUrl.href.startsWith(root.href)) {
    response.writeHead(404);
    response.end("Not found");
    return;
  }
  try {
    const body = await readFile(assetUrl);
    response.writeHead(200, {
      "content-type": contentType(relativePath),
      "cache-control": "no-store"
    });
    response.end(body);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      response.writeHead(404, {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end("Not found");
      return;
    }
    throw error;
  }
}

function contentType(pathname: string): string {
  if (pathname.endsWith(".html")) return "text/html; charset=utf-8";
  if (pathname.endsWith(".json")) return "application/json; charset=utf-8";
  if (pathname.endsWith(".js")) return "text/javascript; charset=utf-8";
  return "application/octet-stream";
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

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
