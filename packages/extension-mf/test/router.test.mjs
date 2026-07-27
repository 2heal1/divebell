import assert from "node:assert/strict";
import test from "node:test";

import { matchMfCommand } from "../dist/cli/router.js";
import { mfCommandRegistry } from "../dist/commands/registry.js";

test("real MF routes match their own command modules", () => {
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["status", "host"]), {
    registration: mfCommandRegistry[0],
    positionals: ["host"]
  });
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["module-info", "catalog"]), {
    registration: mfCommandRegistry[1],
    positionals: ["catalog"]
  });
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["remote", "status", "catalog"]), {
    registration: mfCommandRegistry[2],
    positionals: ["catalog"]
  });
  const match = matchMfCommand(mfCommandRegistry, ["remote", "trace", "catalog/Button"]);
  assert.equal(match.registration, mfCommandRegistry[3]);
  assert.deepEqual(match.positionals, ["catalog/Button"]);
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["shared", "status", "react"]), {
    registration: mfCommandRegistry[4],
    positionals: ["react"]
  });
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["shared", "trace", "react"]), {
    registration: mfCommandRegistry[5],
    positionals: ["react"]
  });
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["bridge", "trace", "catalog"]), {
    registration: mfCommandRegistry[6],
    positionals: ["catalog"]
  });
  assert.equal(matchMfCommand(mfCommandRegistry, ["trace", "catalog"]), undefined);
  assert.equal(matchMfCommand(mfCommandRegistry, ["remote", "check", "catalog"]), undefined);
  assert.equal(matchMfCommand(mfCommandRegistry, ["preload", "trace", "catalog"]), undefined);
});

test("a fake multi-segment remote status route matches completely", () => {
  const remoteStatus = registration(["remote", "status"]);
  const match = matchMfCommand([remoteStatus], ["remote", "status", "catalog"]);
  assert.equal(match.registration, remoteStatus);
  assert.deepEqual(match.positionals, ["catalog"]);
});

test("longest matching route wins and a short input never matches a longer route", () => {
  const remote = registration(["remote"]);
  const remoteStatus = registration(["remote", "status"]);
  assert.equal(
    matchMfCommand([remote, remoteStatus], ["remote", "status"]).registration,
    remoteStatus
  );
  assert.equal(matchMfCommand([remoteStatus], ["remote"]), undefined);
});

test("the real registry exposes exactly the implemented commands", () => {
  assert.deepEqual(
    mfCommandRegistry.map((entry) => entry.path.join(" ")),
    [
      "status",
      "module-info",
      "remote status",
      "remote trace",
      "shared status",
      "shared trace",
      "bridge trace"
    ]
  );
});

function registration(path) {
  return {
    path,
    usage: `openruntime mf ${path.join(" ")}`,
    summaryUsage: `openruntime mf ${path.join(" ")}`,
    description: "test command",
    async load() {
      return { metadata: this, async run() { return 0; } };
    }
  };
}
