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
    runtimes: [],
    probes: [],
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
