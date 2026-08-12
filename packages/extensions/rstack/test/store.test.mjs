import assert from "node:assert/strict";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { ObservationStore } from "../dist/observation-store.js";

test("stores observations privately and resolves the single active id", async () => {
  const home = await mkdtemp(join(tmpdir(), "divebell-rstack-store-"));
  const store = new ObservationStore("/repo/demo", home);
  const observation = {
    schemaVersion: 1,
    observationId: store.createId(),
    status: "ready",
    createdAt: "2026-08-11T00:00:00.000Z",
    updatedAt: "2026-08-11T00:00:00.000Z",
    pageUrl: "http://localhost:3000/",
    connectionGeneration: 1,
    sessionId: "cdp",
    documentGeneration: 1,
    enabledDebugger: true,
    readyAtSequence: 10,
    latestSequence: 10,
    hmrRuntimes: [],
    reactRefreshRuntimes: [],
    installedProbes: [],
    events: [],
    expectations: { refresh: false, noReload: false },
    consoleBaseline: []
  };
  try {
    await store.write(observation);
    assert.equal((await store.read()).observationId, observation.observationId);
    const directoryMode = (await stat(store.directory)).mode & 0o777;
    const fileMode = (await stat(join(
      store.directory,
      `${observation.observationId}.json`
    ))).mode & 0o777;
    assert.equal(directoryMode, 0o700);
    assert.equal(fileMode, 0o600);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});

test("reads legacy armed observations as ready", async () => {
  const home = await mkdtemp(join(tmpdir(), "divebell-rstack-store-legacy-"));
  const store = new ObservationStore("/repo/legacy", home);
  const observationId = store.createId();
  try {
    await store.write({
      schemaVersion: 1,
      observationId,
      status: "armed",
      createdAt: "2026-08-11T00:00:00.000Z",
      updatedAt: "2026-08-11T00:00:00.000Z",
      pageUrl: "http://localhost:3000/",
      connectionGeneration: 1,
      sessionId: "cdp",
      documentGeneration: 1,
      enabledDebugger: true,
      armedAtSequence: 10,
      latestSequence: 10,
      runtimes: [{
        runtimeId: "rspack-hmr-legacy",
        kind: "rspack-hmr",
        profile: "rspack-hmr-v1",
        connectionGeneration: 1,
        sessionId: "cdp",
        documentGeneration: 1,
        scriptId: "script-1",
        scriptInstanceKey: null,
        url: "http://localhost:3000/main.js",
        anchor: { line: 1, column: 1 },
        owner: {
          status: "unknown",
          kind: "unknown",
          confidence: "low",
          evidence: [],
          candidates: []
        }
      }],
      probes: [{
        runtimeId: "rspack-hmr-legacy",
        event: "hmr.status",
        profile: "rspack-hmr-v1",
        sessionId: "cdp",
        scriptId: "script-1",
        url: "http://localhost:3000/main.js",
        location: { line: 1, column: 1 },
        expressions: ["newStatus"],
        required: true,
        probeId: "probe-legacy"
      }],
      events: [],
      expectations: { refresh: false, noReload: false },
      consoleBaseline: []
    });
    const migrated = await store.read(observationId);
    assert.equal(migrated.status, "ready");
    assert.equal(migrated.readyAtSequence, 10);
    assert.equal(migrated.hmrRuntimes[0].runtimeId, "rspack-hmr-legacy");
    assert.deepEqual(migrated.reactRefreshRuntimes, []);
    assert.equal(migrated.installedProbes[0].runtimeKind, "rspack-hmr");
    assert.equal("armedAtSequence" in migrated, false);
    assert.equal("runtimes" in migrated, false);
    assert.equal("probes" in migrated, false);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
