import assert from "node:assert/strict";
import test from "node:test";

import {
  listRemoteCandidates,
  selectConsumer,
  selectRemote,
  selectStatusInstances
} from "../dist/public.js";
import { instance, runtimeState } from "./fixtures.mjs";

const consumer = instance({
  instanceRef: "mf-1",
  name: "host",
  role: "consumer",
  remotes: [{ name: "catalog", alias: "shop" }],
  loadedProducers: [{ name: "catalog", alias: "shop", version: "2.0.0" }]
});
const producer = instance({ instanceRef: "mf-2", name: "catalog", role: "producer" });
const mixed = instance({ instanceRef: "mf-3", name: "shell", role: "mixed" });
const unknown = instance({ instanceRef: "mf-4", name: "mystery", role: "unknown" });

test("status without selectors returns every instance instead of choosing the first", () => {
  const selected = selectStatusInstances(runtimeState({
    instances: [consumer, producer, mixed, unknown]
  }), {});
  assert.equal(selected.ok, true);
  assert.equal(selected.value.kind, "list");
  assert.deepEqual(selected.value.instances.map((item) => item.instanceRef), ["mf-1", "mf-2", "mf-3", "mf-4"]);
});

test("unique name returns detail", () => {
  const selected = selectStatusInstances(runtimeState({ instances: [consumer, producer] }), {
    name: "host"
  });
  assert.equal(selected.ok, true);
  assert.equal(selected.value.kind, "detail");
  assert.equal(selected.value.instances[0].instanceRef, "mf-1");
});

test("duplicate names return structured candidates without CLI command text", () => {
  const duplicate = instance({ instanceRef: "mf-5", name: "host", role: "consumer" });
  const selected = selectStatusInstances(runtimeState({ instances: [consumer, duplicate] }), {
    name: "host"
  });
  assert.equal(selected.ok, false);
  assert.equal(selected.issue.code, "MF_INSTANCE_NAME_AMBIGUOUS");
  assert.equal(selected.issue.candidates[0].instanceRef, "mf-1");
  assert.equal(selected.issue.kind, "needs_input");
  assert.equal(selected.issue.recommendedActions[0].type, "select-instance");
  assert.doesNotMatch(JSON.stringify(selected.issue), /divebell mf|command/);
});

test("role filters include mixed instances and preserve unknown evidence", () => {
  const state = runtimeState({ instances: [consumer, producer, mixed, unknown] });
  const consumers = selectStatusInstances(state, { role: "consumer" });
  const producers = selectStatusInstances(state, { role: "producer" });
  assert.deepEqual(consumers.value.instances.map((item) => item.instanceRef), ["mf-1", "mf-3"]);
  assert.deepEqual(producers.value.instances.map((item) => item.instanceRef), ["mf-2", "mf-3"]);
  assert.equal(unknown.role, "unknown");
});

test("stale instanceRef returns current candidates", () => {
  const selected = selectStatusInstances(runtimeState({ instances: [consumer] }), {
    instanceRef: "old-session-ref"
  });
  assert.equal(selected.ok, false);
  assert.equal(selected.issue.code, "MF_INSTANCE_REF_NOT_FOUND");
  assert.equal(selected.issue.candidates[0].instanceRef, "mf-1");
});

test("module-info auto-selects the only consumer", () => {
  const selected = selectConsumer(runtimeState({ instances: [producer, consumer] }), {});
  assert.equal(selected.ok, true);
  assert.equal(selected.value.instanceRef, "mf-1");
});

test("module-info never defaults to the first of several consumers", () => {
  const another = instance({ instanceRef: "mf-5", name: "other", role: "consumer" });
  const selected = selectConsumer(runtimeState({ instances: [consumer, another] }), {});
  assert.equal(selected.ok, false);
  assert.equal(selected.issue.code, "MF_CONSUMER_AMBIGUOUS");
  assert.equal(selected.issue.candidates.length, 2);
});

test("non-consumer instance selection returns consumer suggestions", () => {
  const selected = selectConsumer(runtimeState({ instances: [producer, consumer] }), {
    instanceRef: "mf-2"
  });
  assert.equal(selected.ok, false);
  assert.equal(selected.issue.code, "MF_INSTANCE_NOT_CONSUMER");
  assert.equal(selected.issue.candidates[0].instanceRef, "mf-1");
});

test("declared and loaded remotes are merged without losing loaded status", () => {
  const candidates = listRemoteCandidates(consumer);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].status, "loaded");
  assert.equal(candidates[0].remote.version, "2.0.0");
});

test("ambiguous remotes require an explicit remote name", () => {
  const many = instance({
    instanceRef: "mf-1",
    name: "host",
    role: "consumer",
    remotes: [{ name: "catalog" }, { name: "checkout" }]
  });
  const selected = selectRemote(many);
  assert.equal(selected.ok, false);
  assert.equal(selected.issue.code, "MF_REMOTE_AMBIGUOUS");
});
