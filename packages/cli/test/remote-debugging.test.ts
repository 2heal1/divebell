import assert from "node:assert/strict";
import { test } from "@rstest/core";

import {
  CHROME_REMOTE_DEBUGGING_URL,
  createRemoteDebuggingPageOpener
} from "../dist/features/browser/remote-debugging.js";

test("opens Chrome remote-debugging settings on macOS", async () => {
  const calls: Array<{
    command: string;
    args: readonly string[];
  }> = [];
  const opener = createRemoteDebuggingPageOpener({
    platform: "darwin",
    launch: async (command, args) => {
      calls.push({ command, args });
      if (calls.length === 1) {
        throw new Error("Google Chrome is unavailable");
      }
    }
  });

  assert.deepEqual(await opener.open(), {
    opened: true
  });
  assert.deepEqual(calls, [
    {
      command: "open",
      args: ["-a", "Google Chrome", CHROME_REMOTE_DEBUGGING_URL]
    },
    {
      command: "open",
      args: ["-a", "Google Chrome Canary", CHROME_REMOTE_DEBUGGING_URL]
    }
  ]);
});

test("opens Chrome remote-debugging settings on Linux", async () => {
  const calls: Array<{
    command: string;
    args: readonly string[];
  }> = [];
  const opener = createRemoteDebuggingPageOpener({
    platform: "linux",
    launch: async (command, args) => {
      calls.push({ command, args });
    }
  });

  assert.deepEqual(await opener.open(), {
    opened: true
  });
  assert.deepEqual(calls, [
    {
      command: "google-chrome",
      args: ["--new-tab", CHROME_REMOTE_DEBUGGING_URL]
    }
  ]);
});

test("finds an installed Chrome executable on Windows", async () => {
  const calls: Array<{
    command: string;
    args: readonly string[];
  }> = [];
  const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
  const opener = createRemoteDebuggingPageOpener({
    platform: "win32",
    env: {
      ProgramFiles: "C:\\Program Files"
    },
    pathExists: async (path) => path === chromePath,
    launch: async (command, args) => {
      calls.push({ command, args });
    }
  });

  assert.deepEqual(await opener.open(), {
    opened: true
  });
  assert.deepEqual(calls, [
    {
      command: chromePath,
      args: ["--new-tab", CHROME_REMOTE_DEBUGGING_URL]
    }
  ]);
});

test("reports unsupported platforms without launching a process", async () => {
  let launched = false;
  const opener = createRemoteDebuggingPageOpener({
    platform: "aix",
    launch: async () => {
      launched = true;
    }
  });

  assert.deepEqual(await opener.open(), {
    opened: false,
    reason: "No supported Chrome installation was found on aix."
  });
  assert.equal(launched, false);
});
