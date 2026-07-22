import assert from "node:assert/strict";
import test from "node:test";

import {
  createSharedStatusResult,
  parseBrowserReadResult
} from "../dist/public.js";
import { formatSharedStatus } from "../dist/shared/format.js";
import { browserRead, capability, instance, runtimeState } from "./fixtures.mjs";
import {
  shareScope,
  sharedPackage,
  sharedReport,
  sharedVersion
} from "./shared-fixtures.mjs";

function snapshot(state, reports = [], overrides = {}) {
  return parseBrowserReadResult(browserRead(state, reports, overrides)).snapshot;
}

test("shared status returns all instances and keeps duplicate MF names separate", () => {
  const first = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    shareScopes: [shareScope("default", [
      sharedPackage("react", [sharedVersion("18.3.1", { loaded: true, singleton: true })])
    ])]
  });
  const second = instance({
    instanceRef: "mf-2",
    name: "host",
    role: "consumer",
    shareScopes: [shareScope("default", [
      sharedPackage("react", [sharedVersion("18.2.0", { provider: "remote", loaded: true })])
    ])]
  });
  const state = runtimeState({ instances: [first, second] });

  const all = createSharedStatusResult(snapshot(state), {});
  assert.deepEqual(all.instances.map((item) => item.instanceRef), ["mf-1", "mf-2"]);
  const byName = createSharedStatusResult(snapshot(state), { mf: "host" });
  assert.equal(byName.instances.length, 2);
  assert.equal(byName.instances[0].scopes[0].packages[0].availableVersions[0], "18.3.1");
  assert.equal(byName.instances[1].scopes[0].packages[0].availableVersions[0], "18.2.0");
});

test("shared status filters exact instance, package, and multiple share scopes", () => {
  const host = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    shareScopes: [
      shareScope("default", [
        sharedPackage("react", [sharedVersion("18.3.1", { loaded: true })]),
        sharedPackage("vue", [sharedVersion("3.5.0")])
      ]),
      shareScope("legacy", [
        sharedPackage("react", [sharedVersion("17.0.2", { provider: "legacy" })])
      ])
    ]
  });
  const result = createSharedStatusResult(snapshot(runtimeState({ instances: [host] })), {
    instanceRef: "mf-1",
    package: "react",
    scope: "legacy"
  });
  assert.deepEqual(result.instances[0].scopes.map((scope) => scope.scope), ["legacy"]);
  assert.deepEqual(result.instances[0].scopes[0].packages.map((item) => item.package), ["react"]);
  assert.deepEqual(result.instances[0].scopes[0].packages[0].availableVersions, ["17.0.2"]);
});

test("singleton conflict is shown only when current state still confirms every version", () => {
  const conflict = {
    reason: "singleton-multiple-versions",
    scope: "default",
    currentVersion: "18.3.1",
    currentFrom: "host",
    versions: ["17.0.2", "18.3.1"],
    existingVersions: [
      { version: "17.0.2", from: "legacy", singleton: true, loaded: false },
      { version: "18.3.1", from: "host", singleton: true, loaded: true }
    ]
  };
  const current = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    shareScopes: [shareScope("default", [sharedPackage("react", [
      sharedVersion("17.0.2", { provider: "legacy", singleton: true }),
      sharedVersion("18.3.1", { loaded: true, singleton: true })
    ])])]
  });
  const result = createSharedStatusResult(
    snapshot(runtimeState({ instances: [current] }), [sharedReport({ conflict })]),
    { package: "react" }
  );
  assert.deepEqual(result.instances[0].scopes[0].packages[0].conflicts, [conflict]);

  current.shareScopes[0].shared[0].versions = [sharedVersion("18.3.1", {
    loaded: true,
    singleton: true
  })];
  const historicalOnly = createSharedStatusResult(
    snapshot(runtimeState({ instances: [current] }), [sharedReport({ conflict })]),
    { package: "react" }
  );
  assert.deepEqual(historicalOnly.instances[0].scopes[0].packages[0].conflicts, []);
});

test("sharedState unavailable and partial are structured capability results", () => {
  const host = instance({ instanceRef: "mf-1", name: "host", role: "consumer" });
  const unavailableState = runtimeState({ instances: [host] });
  unavailableState.capabilities.sharedState = capability(
    false,
    "unavailable",
    "Current shared state is not exposed."
  );
  const unavailable = createSharedStatusResult(snapshot(unavailableState), {});
  assert.equal(unavailable.supported, false);
  assert.equal(unavailable.instances.length, 0);
  assert.match(unavailable.warnings.join(" "), /not exposed/);

  const partialState = runtimeState({ instances: [host] });
  partialState.capabilities.sharedState = capability(true, "partial", "Some scopes are missing.");
  const partial = createSharedStatusResult(snapshot(partialState), {});
  assert.equal(partial.supported, true);
  assert.match(partial.warnings.join(" "), /Some scopes are missing/);

  const emptyState = runtimeState();
  emptyState.capabilities.sharedState = capability(false, "unavailable", "No state signal.");
  const empty = createSharedStatusResult(snapshot(emptyState), {});
  assert.equal(empty.supported, false);
  assert.match(empty.warnings.join(" "), /runtime version is unknown/);
});

test("shared status human output includes versions, provider, flags, and strategy", () => {
  const host = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    shareScopes: [shareScope("default", [sharedPackage("react", [
      sharedVersion("18.3.1", {
        provider: "host",
        loaded: true,
        singleton: true,
        eager: false,
        strategy: "loaded-first"
      })
    ])])]
  });
  const text = formatSharedStatus(
    createSharedStatusResult(snapshot(runtimeState({ instances: [host] })), {})
  );
  assert.match(text, /Module Federation shared status/);
  assert.match(text, /react/);
  assert.match(text, /provider=host loaded=true singleton=true eager=false strategy=loaded-first/);
});
