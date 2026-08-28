import assert from "node:assert/strict";
import test from "node:test";

import {
  createUpdateAgentBrowserSteps,
  parseUpdateAgentBrowserArguments,
  updateRecordingRuntimeAgentBrowser
} from "./update-agent-browser.mjs";

test("requires an exact agent-browser version", () => {
  assert.deepEqual(
    parseUpdateAgentBrowserArguments(["--", "0.35.0-divebell.1"]),
    {
      help: false,
      version: "0.35.0-divebell.1",
      verify: true
    }
  );
  assert.throws(
    () => parseUpdateAgentBrowserArguments(["latest"]),
    /exact semantic version/
  );
  assert.throws(
    () => parseUpdateAgentBrowserArguments(["^0.35.0"]),
    /exact semantic version/
  );
  assert.throws(
    () => parseUpdateAgentBrowserArguments([]),
    /exact semantic version/
  );
});

test("installs, regenerates, and verifies in order", () => {
  const steps = createUpdateAgentBrowserSteps("0.35.0-divebell.1");

  assert.deepEqual(steps[0], {
    label: "install @divebell/agent-browser@0.35.0-divebell.1",
    command: "pnpm",
    args: [
      "--filter",
      "@divebell/cli",
      "add",
      "--save-exact",
      "@divebell/agent-browser@0.35.0-divebell.1"
    ]
  });
  assert.deepEqual(
    steps.map((step) => step.args.join(" ")),
    [
      "--filter @divebell/cli add --save-exact @divebell/agent-browser@0.35.0-divebell.1",
      "run docs:raw",
      "run docs:raw:check",
      "run test:release-script",
      "--filter @divebell/cli test",
      "run lint"
    ]
  );
});

test("can skip slow verification without skipping Skill synchronization", () => {
  assert.deepEqual(
    parseUpdateAgentBrowserArguments(["1.2.3", "--no-verify"]),
    { help: false, version: "1.2.3", verify: false }
  );
  assert.deepEqual(
    createUpdateAgentBrowserSteps("1.2.3", { verify: false }).map(
      (step) => step.args.join(" ")
    ),
    [
      "--filter @divebell/cli add --save-exact @divebell/agent-browser@1.2.3",
      "run docs:raw"
    ]
  );
});

test("synchronizes the recording runtime agent-browser archive", () => {
  const manifest = {
    schemaVersion: 1,
    packages: [
      {
        name: "@divebell/agent-browser",
        source: "registry",
        specifier: "@divebell/agent-browser@0.34.0-divebell.2",
        file: "divebell-agent-browser-0.34.0-divebell.2.tgz"
      },
      {
        name: "@divebell/cli",
        source: "workspace",
        directory: "packages/cli",
        file: "divebell-cli-0.0.25.tgz"
      }
    ]
  };

  assert.deepEqual(
    updateRecordingRuntimeAgentBrowser(manifest, "0.34.0-divebell.4"),
    {
      ...manifest,
      packages: [
        {
          name: "@divebell/agent-browser",
          source: "registry",
          specifier: "@divebell/agent-browser@0.34.0-divebell.4",
          file: "divebell-agent-browser-0.34.0-divebell.4.tgz"
        },
        manifest.packages[1]
      ]
    }
  );
  assert.throws(
    () => updateRecordingRuntimeAgentBrowser({ packages: [] }, "0.34.0-divebell.4"),
    /must contain one registry/
  );
});
