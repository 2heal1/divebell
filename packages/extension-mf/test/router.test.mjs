import assert from "node:assert/strict";
import test from "node:test";

import { matchMfCommand } from "../dist/cli/router.js";
import { mfCommandRegistry } from "../dist/commands/registry.js";

test("real status, module-info, and bridge trace routes match their own command modules", () => {
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["status", "host"]), {
    registration: mfCommandRegistry[0],
    positionals: ["host"]
  });
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["module-info", "catalog"]), {
    registration: mfCommandRegistry[1],
    positionals: ["catalog"]
  });
  assert.deepEqual(matchMfCommand(mfCommandRegistry, ["bridge", "trace", "catalog"]), {
    registration: mfCommandRegistry[2],
    positionals: ["catalog"]
  });
});

test("a fake multi-segment remote check route matches completely", () => {
  const remoteCheck = registration(["remote", "check"]);
  const match = matchMfCommand([remoteCheck], ["remote", "check", "catalog"]);
  assert.equal(match.registration, remoteCheck);
  assert.deepEqual(match.positionals, ["catalog"]);
});

test("longest matching route wins and a short input never matches a longer route", () => {
  const remote = registration(["remote"]);
  const remoteCheck = registration(["remote", "check"]);
  assert.equal(
    matchMfCommand([remote, remoteCheck], ["remote", "check"]).registration,
    remoteCheck
  );
  assert.equal(matchMfCommand([remoteCheck], ["remote"]), undefined);
});

test("the real registry exposes no unimplemented future commands", () => {
  assert.deepEqual(
    mfCommandRegistry.map((entry) => entry.path.join(" ")),
    ["status", "module-info", "bridge trace"]
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
