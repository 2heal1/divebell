import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import type { BrowserRunOptions } from "../dist/features/browser/runner.js";
import { commandData, createBrowserRunner, createOutput } from "./helpers.js";

test("opens a clean temporary Profile and exports it after a clean browser close", async () => {
  const fixture = createFixture();
  const calls: Array<{ args: string[]; options: BrowserRunOptions | undefined }> = [];
  let sourcePath: string | undefined;
  const browserRunner = createBrowserRunner(async (args, options) => {
    calls.push({ args, options });
    const profileIndex = args.indexOf("--profile");
    if (profileIndex >= 0) {
      sourcePath = args[profileIndex + 1];
      assert.notEqual(sourcePath, undefined);
      writeFileSync(join(sourcePath as string, "login-marker"), "signed-in", "utf8");
    }
    return { exitCode: 0, stdout: "ok\n", stderr: "" };
  });

  try {
    const openOutput = createOutput();
    assert.equal(await runCli([
      "open",
      "https://app.test/account",
      "--ui",
      "--temp-profile",
      "--no-bridge"
    ], {
      stdout: openOutput.stdout,
      stderr: openOutput.stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 0);

    assert.notEqual(sourcePath, undefined);
    assert.equal(existsSync(sourcePath as string), true);
    const opened = JSON.parse(openOutput.text());
    assert.deepEqual(opened.data.tempProfile, {
      exportCommand: "divebell profile export"
    });

    const context = readOpenContext(fixture.operationLogDirectory);
    assert.equal(context.browserTempProfile.path, sourcePath);
    assert.match(context.browserTempProfile.session, /^divebell-temp-/);
    assert.equal(context.browserRestoreDisabled, true);
    assert.equal(context.browserDefaultProfileDisabled, true);
    assert.equal(context.browserDefaultProfile, undefined);
    assert.deepEqual(calls[0]?.options, {
      ui: true,
      reuseInitialBlankPage: true,
      disableRestore: true,
      disableDefaultProfile: true,
      browserArguments: [
        "--enable-features=WebMCP",
        "--enable-features=WebMCPTesting",
        "--enable-features=DevToolsWebMCPSupport"
      ].join("\n"),
      session: context.browserTempProfile.session,
      ignoreConfiguredProfile: true,
      ignoreConfiguredState: true
    });

    const exportOutput = createOutput();
    assert.equal(await runCli(["profile", "export"], {
      stdout: exportOutput.stdout,
      stderr: exportOutput.stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 0);

    const exported = commandData<{ path: string }>(exportOutput.text());
    assert.match(exported.path, new RegExp(`^${escapeRegExp(join(fixture.home, "profiles"))}/profile-`));
    assert.equal(existsSync(join(exported.path, "login-marker")), true);
    assert.equal(readFileSync(join(exported.path, "login-marker"), "utf8"), "signed-in");
    assert.equal(statSync(exported.path).mode & 0o777, 0o700);
    assert.equal(existsSync(sourcePath as string), false);
    assert.equal(readdirSync(fixture.operationLogDirectory).length, 0);
    assert.deepEqual(calls[1], {
      args: ["close"],
      options: {
        ui: true,
        reuseInitialBlankPage: true,
        disableRestore: true,
        disableDefaultProfile: true,
        browserArguments: [
          "--enable-features=WebMCP",
          "--enable-features=WebMCPTesting",
          "--enable-features=DevToolsWebMCPSupport"
        ].join("\n"),
        session: context.browserTempProfile.session,
        ignoreConfiguredProfile: true,
        ignoreConfiguredState: true
      }
    });
  } finally {
    fixture.cleanup();
  }
});

test("exports a temporary Profile to an explicit new directory", async () => {
  const fixture = createFixture();
  let sourcePath = "";
  const browserRunner = createBrowserRunner(async (args) => {
    const profileIndex = args.indexOf("--profile");
    if (profileIndex >= 0) {
      sourcePath = args[profileIndex + 1] ?? "";
      writeFileSync(join(sourcePath, "Cookies"), "profile-data", "utf8");
    }
    return { exitCode: 0, stdout: "ok\n", stderr: "" };
  });
  const outputPath = join(fixture.root, "exports", "tiktok-ads-profile");

  try {
    assert.equal(await runCli([
      "open",
      "https://app.test/",
      "--temp-profile",
      "--no-bridge"
    ], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 0);
    const output = createOutput();
    assert.equal(await runCli(["profile", "export", outputPath], {
      stdout: output.stdout,
      stderr: output.stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 0);
    assert.deepEqual(commandData(output.text()), { path: outputPath });
    assert.equal(readFileSync(join(outputPath, "Cookies"), "utf8"), "profile-data");
    assert.equal(existsSync(sourcePath), false);
  } finally {
    fixture.cleanup();
  }
});

test("stop removes an unexported temporary Profile", async () => {
  const fixture = createFixture();
  const browserRunner = createBrowserRunner(async () => ({
    exitCode: 0,
    stdout: "ok\n",
    stderr: ""
  }));

  try {
    assert.equal(await runCli([
      "open",
      "https://app.test/",
      "--temp-profile",
      "--no-bridge"
    ], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 0);
    const sourcePath = readOpenContext(fixture.operationLogDirectory).browserTempProfile.path;
    assert.equal(existsSync(sourcePath), true);

    assert.equal(await runCli(["stop"], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(existsSync(sourcePath), false);
    assert.equal(readdirSync(fixture.operationLogDirectory).length, 0);
  } finally {
    fixture.cleanup();
  }
});

test("rejects browser contexts that would make a temporary Profile non-empty", async () => {
  const fixture = createFixture();
  const output = createOutput();

  try {
    assert.equal(await runCli([
      "open",
      "https://app.test/",
      "--temp-profile",
      "--state",
      "existing-state.json",
      "--no-bridge"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner: createBrowserRunner(async () => {
        throw new Error("browser should not open");
      })
    }), 1);
    const result = JSON.parse(output.text());
    assert.equal(result.error.code, "TEMP_PROFILE_CONTEXT_CONFLICT");
    assert.match(result.message, /--state/);
    assert.equal(existsSync(join(fixture.home, "temp-profiles")), false);
  } finally {
    fixture.cleanup();
  }
});

test("requires an active temporary Profile and preserves it when browser close fails", async () => {
  const fixture = createFixture();
  let closeShouldFail = false;
  const browserRunner = createBrowserRunner(async (args) => ({
    exitCode: args[0] === "close" && closeShouldFail ? 1 : 0,
    stdout: "",
    stderr: args[0] === "close" && closeShouldFail ? "close failed" : ""
  }));

  try {
    const missingOutput = createOutput();
    assert.equal(await runCli(["profile", "export"], {
      stdout: missingOutput.stdout,
      stderr: missingOutput.stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 1);
    assert.equal(JSON.parse(missingOutput.text()).error.code, "PROFILE_EXPORT_TEMP_REQUIRED");

    assert.equal(await runCli([
      "open",
      "https://app.test/",
      "--temp-profile",
      "--no-bridge"
    ], {
      stdout: createOutput().stdout,
      stderr: createOutput().stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 0);
    const sourcePath = readOpenContext(fixture.operationLogDirectory).browserTempProfile.path;
    closeShouldFail = true;
    const failedOutput = createOutput();
    assert.equal(await runCli(["profile", "export"], {
      stdout: failedOutput.stdout,
      stderr: failedOutput.stderr,
      env: fixture.env,
      operationLogDirectory: fixture.operationLogDirectory,
      browserRunner
    }), 1);
    assert.equal(JSON.parse(failedOutput.text()).error.code, "PROFILE_EXPORT_BROWSER_CLOSE_FAILED");
    assert.equal(existsSync(sourcePath), true);
    assert.equal(readdirSync(fixture.operationLogDirectory).length, 1);
  } finally {
    fixture.cleanup();
  }
});

function createFixture(): {
  root: string;
  home: string;
  operationLogDirectory: string;
  env: NodeJS.ProcessEnv;
  cleanup(): void;
} {
  const root = mkdtempSync(join(tmpdir(), "divebell-temp-profile-test-"));
  const home = join(root, "home");
  const operationLogDirectory = join(root, "operations");
  return {
    root,
    home,
    operationLogDirectory,
    env: {
      ...process.env,
      DIVEBELL_HOME: home,
      AGENT_BROWSER_PROFILE: "Configured Profile",
      AGENT_BROWSER_STATE: "configured-state.json"
    },
    cleanup: () => rmSync(root, { recursive: true, force: true })
  };
}

function readOpenContext(operationLogDirectory: string): any {
  const [file] = readdirSync(operationLogDirectory);
  assert.notEqual(file, undefined);
  return JSON.parse(readFileSync(join(operationLogDirectory, file as string), "utf8"));
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
