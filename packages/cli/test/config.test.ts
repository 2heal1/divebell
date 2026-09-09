import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import { commandData, createOutput } from "./helpers.js";

test("sets, reads, and clears the global default browser state", async () => {
  const directory = mkdtempSync(join(tmpdir(), "divebell-default-state-"));
  const home = join(directory, "home");
  const source = join(directory, "source-state.json");
  writeFileSync(source, JSON.stringify({
    cookies: [{ name: "session", value: "secret" }],
    origins: [{ origin: "https://app.test", localStorage: [] }]
  }));

  try {
    const set = createOutput();
    assert.equal(await runCli(["config", "state", source], {
      stdout: set.stdout,
      stderr: set.stderr,
      env: { DIVEBELL_HOME: home }
    }), 0);
    const configured = commandData<{ state: { path: string } }>(set.text());
    assert.equal(configured.state.path, join(home, "states", "default-state.json"));
    assert.equal(statSync(configured.state.path).mode & 0o777, 0o600);
    assert.deepEqual(JSON.parse(readFileSync(configured.state.path, "utf8")), {
      cookies: [{ name: "session", value: "secret" }],
      origins: [{ origin: "https://app.test", localStorage: [] }]
    });

    const show = createOutput();
    assert.equal(await runCli(["config", "state"], {
      stdout: show.stdout,
      stderr: show.stderr,
      env: { DIVEBELL_HOME: home }
    }), 0);
    assert.deepEqual(commandData(show.text()), configured);

    const clear = createOutput();
    assert.equal(await runCli(["config", "state", "clear"], {
      stdout: clear.stdout,
      stderr: clear.stderr,
      env: { DIVEBELL_HOME: home }
    }), 0);
    assert.equal(commandData(clear.text()), null);

    const empty = createOutput();
    assert.equal(await runCli(["config", "state"], {
      stdout: empty.stdout,
      stderr: empty.stderr,
      env: { DIVEBELL_HOME: home }
    }), 0);
    assert.deepEqual(commandData(empty.text()), { state: null });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
