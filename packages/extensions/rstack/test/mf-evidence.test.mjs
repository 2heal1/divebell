import assert from "node:assert/strict";
import test from "node:test";

import {
  applyMfRuntimeOwners,
  collectMfEvidence
} from "../dist/mf-evidence.js";

test("collects shared React providers independently for every MF consumer", async () => {
  const sharedCalls = [];
  const evidence = await collectMfEvidence(async (_extension, request) => {
    if (request.args[0] === "status") {
      return {
        instances: [
          {
            instanceRef: "host-ref",
            name: "host",
            role: "consumer",
            remotes: [{ name: "catalog" }]
          },
          {
            instanceRef: "catalog-ref",
            name: "catalog",
            role: "mixed",
            remotes: []
          }
        ]
      };
    }
    if (request.args[0] === "module-info") {
      return {
        consumer: { instanceRef: "host-ref" },
        remote: {
          name: "catalog",
          producerInstanceRef: "catalog-ref",
          remoteEntryUrl: "http://localhost:3001/remoteEntry.js",
          publicPath: "http://localhost:3001/"
        }
      };
    }
    if (request.args[0] === "shared") {
      const packageName = request.args[2];
      const instanceRef = request.options.instance;
      sharedCalls.push(`${packageName}:${instanceRef}`);
      return {
        selection: { kind: "detail" },
        operations: [{
          instanceRef,
          mfName: instanceRef === "host-ref" ? "host" : "catalog",
          scopes: ["default"],
          selectedVersion: "19.2.0",
          provider: "host-ref",
          operationId: `${packageName}:${instanceRef}`
        }]
      };
    }
    throw new Error(`Unexpected MF request: ${JSON.stringify(request)}`);
  });

  assert.deepEqual(new Set(sharedCalls), new Set([
    "react:host-ref",
    "react:catalog-ref",
    "react-dom:host-ref",
    "react-dom:catalog-ref"
  ]));
  assert.equal(evidence.react.operations.length, 2);
  assert.equal(evidence.reactDom.operations.length, 2);

  const [owned] = applyMfRuntimeOwners([runtime()], evidence.runtime);
  assert.equal(owned.owner.ownerId, "catalog-ref");
  assert.equal(owned.owner.confidence, "medium");
  assert.equal(evidence.react.operations[1].provider, "host-ref");
});

function runtime() {
  return {
    runtimeId: "rspack-hmr-1",
    kind: "rspack-hmr",
    profile: "rspack-hmr-v1",
    connectionGeneration: 1,
    sessionId: "cdp-page",
    documentGeneration: 1,
    scriptId: "script-1",
    scriptInstanceKey: null,
    url: "http://localhost:3001/static/js/main.js",
    anchor: { line: 1, column: 1 },
    owner: {
      status: "unknown",
      kind: "unknown",
      confidence: "low",
      evidence: [],
      candidates: []
    }
  };
}
