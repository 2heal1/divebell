import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import {
  AGENT_BROWSER_HOME_ENV,
  createAgentBrowserEnvironment,
  createAgentBrowserRunner,
  createDefaultBrowserProfileDirectory,
  createDefaultBrowserRunner,
  resolveBundledAgentBrowserEntryPath
} from "../dist/features/browser/runner.js";
import { createBrowserRunner, createOutput, errorOutput } from "./helpers.js";

test("uses agent-browser automatic restore while preserving native profile and state settings", () => {
  const env = createAgentBrowserEnvironment({
    AGENT_BROWSER_PROFILE: "Work",
    AGENT_BROWSER_STATE: "/tmp/browser-state.json"
  });

  assert.equal(env.AGENT_BROWSER_PROFILE, "Work");
  assert.equal(env.AGENT_BROWSER_STATE, "/tmp/browser-state.json");
  assert.match(env.AGENT_BROWSER_SESSION ?? "", /^divebell-[a-f0-9]{12}$/);
  assert.equal(env.AGENT_BROWSER_RESTORE, env.AGENT_BROWSER_SESSION);
  assert.equal(createDefaultBrowserProfileDirectory().endsWith(".divebell/browser-profile"), true);

  const exportEnv = createAgentBrowserEnvironment({
    AGENT_BROWSER_ENCRYPTION_KEY: "test-key"
  }, undefined, undefined, { unencryptedStateOutput: true });
  assert.equal(exportEnv.AGENT_BROWSER_ENCRYPTION_KEY, undefined);

  const explicitSourceEnv = createAgentBrowserEnvironment({}, undefined, undefined, {
    disableRestore: true
  });
  assert.equal(explicitSourceEnv.AGENT_BROWSER_RESTORE, undefined);
});

test("isolates the bundled agent-browser daemon from other installed clients", () => {
  const env = createAgentBrowserEnvironment({
    DIVEBELL_HOME: "/tmp/divebell-home"
  });
  assert.equal(env[AGENT_BROWSER_HOME_ENV], "/tmp/divebell-home/agent-browser");

  const custom = createAgentBrowserEnvironment({
    DIVEBELL_HOME: "/tmp/divebell-home",
    AGENT_BROWSER_HOME: "/tmp/shared-agent-browser-home"
  });
  assert.equal(custom[AGENT_BROWSER_HOME_ENV], "/tmp/shared-agent-browser-home");
});

test("configures an isolated restore name and headed mode", () => {
  const env = createAgentBrowserEnvironment({
    DIVEBELL_BROWSER_PROFILE_DIR: "/tmp/custom-divebell-profile",
    DIVEBELL_AGENT_BROWSER_SESSION: "browser-check"
  }, undefined, undefined, { ui: true });

  assert.equal(env.AGENT_BROWSER_SESSION, "browser-check");
  assert.equal(env.AGENT_BROWSER_RESTORE, "browser-check");
  assert.equal(env.AGENT_BROWSER_HEADED, "1");
});

test("can force an isolated command to ignore headed browser config", () => {
  const env = createAgentBrowserEnvironment({
    AGENT_BROWSER_HEADED: "1"
  }, undefined, "browser-check", {
    headless: true
  });

  assert.equal(env.AGENT_BROWSER_HEADED, "false");
});

test("configures automatic connection without inheriting an explicit CDP port", () => {
  const env = createAgentBrowserEnvironment({
    AGENT_BROWSER_CDP: "9222"
  }, undefined, "browser-check", {
    autoConnect: true,
    idleTimeoutMs: 5000
  });

  assert.equal(env.AGENT_BROWSER_AUTO_CONNECT, "1");
  assert.equal(env.AGENT_BROWSER_CDP, undefined);
  assert.equal(env.AGENT_BROWSER_IDLE_TIMEOUT_MS, "5000");
  assert.equal(env.AGENT_BROWSER_SESSION, "browser-check");
});

test("adds a reusable blank startup page without dropping custom browser arguments", () => {
  const env = createAgentBrowserEnvironment({
    AGENT_BROWSER_ARGS: "--disable-features=Translate,--start-maximized"
  }, undefined, undefined, { reuseInitialBlankPage: true });

  assert.equal(
    env.AGENT_BROWSER_ARGS,
    "--disable-features=Translate,--start-maximized\nabout:blank"
  );

  const existing = createAgentBrowserEnvironment({
    AGENT_BROWSER_ARGS: "--start-maximized\nabout:blank"
  }, undefined, undefined, { reuseInitialBlankPage: true });
  assert.equal(existing.AGENT_BROWSER_ARGS, "--start-maximized\nabout:blank");

  const customStartupPage = createAgentBrowserEnvironment({
    AGENT_BROWSER_ARGS: "--start-maximized\nhttps://start.example.com"
  }, undefined, undefined, { reuseInitialBlankPage: true });
  assert.equal(customStartupPage.AGENT_BROWSER_ARGS, "--start-maximized\nhttps://start.example.com");
});

test("does not add a local startup page to restricted or external browsers", () => {
  for (const source of [
    { AGENT_BROWSER_ALLOWED_DOMAINS: "example.com" },
    { AGENT_BROWSER_CDP: "9222" },
    { AGENT_BROWSER_AUTO_CONNECT: "1" },
    { AGENT_BROWSER_PROVIDER: "browserbase" },
    { AGENT_BROWSER_ENGINE: "lightpanda" }
  ]) {
    const env = createAgentBrowserEnvironment(source, undefined, undefined, {
      reuseInitialBlankPage: true
    });
    assert.equal(env.AGENT_BROWSER_ARGS, undefined);
  }
});

test("uses a different browser session for each working directory", () => {
  const first = createAgentBrowserEnvironment(
    {},
    undefined,
    undefined,
    {},
    "/tmp/divebell-project-a"
  );
  const second = createAgentBrowserEnvironment(
    {},
    undefined,
    undefined,
    {},
    "/tmp/divebell-project-b"
  );

  assert.notEqual(first.AGENT_BROWSER_SESSION, second.AGENT_BROWSER_SESSION);
  assert.equal(first.AGENT_BROWSER_RESTORE, first.AGENT_BROWSER_SESSION);
  assert.equal(second.AGENT_BROWSER_RESTORE, second.AGENT_BROWSER_SESSION);
});

test("runs agent-browser through a replaceable executable and forwards stdin", async () => {
  const runner = createAgentBrowserRunner({
    executablePath: process.execPath,
    prefixArgs: [
      "-e",
      "let input=''; process.stdin.on('data', chunk => input += chunk); process.stdin.on('end', () => process.stdout.write(JSON.stringify({ success: true, data: { args: process.argv.slice(1), input } })))"
    ],
    session: "divebell-test"
  });

  const result = await runner.run(["auth", "save", "app", "--json"], { input: "secret\n" });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ["auth", "save", "app", "--json"],
    input: "secret\n"
  });
});

test("uses agent-browser as the default browser runner", async () => {
  const runner = createDefaultBrowserRunner({
    env: {},
    agentBrowser: {
      executablePath: process.execPath,
      prefixArgs: [
        "-e",
        "process.stdout.write(JSON.stringify({ args: process.argv.slice(1), session: process.env.AGENT_BROWSER_SESSION }))"
      ],
      session: "default-agent-browser"
    }
  });

  const result = await runner.run(["snapshot"]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ["snapshot"],
    session: "default-agent-browser"
  });
});

test("allows an isolated command to override the default browser session", async () => {
  const runner = createDefaultBrowserRunner({
    env: {},
    agentBrowser: {
      executablePath: process.execPath,
      prefixArgs: [
        "-e",
        "process.stdout.write(JSON.stringify({ session: process.env.AGENT_BROWSER_SESSION, restore: process.env.AGENT_BROWSER_RESTORE ?? null }))"
      ],
      session: "default-agent-browser"
    }
  });

  const result = await runner.run(["snapshot"], {
    session: "isolated-browser-check",
    disableRestore: true
  });
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    session: "isolated-browser-check",
    restore: null
  });
});

test("uses the packaged Divebell agent-browser by default", async () => {
  const entryPath = resolveBundledAgentBrowserEntryPath();
  assert.match(entryPath ?? "", /@divebell[\\/]agent-browser[\\/]bin[\\/]agent-browser\.js$/);

  const runner = createDefaultBrowserRunner({ env: {} });
  const result = await runner.run(["--version"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /agent-browser 0\.33\.2-divebell\.4/);
});

test("forwards profiles, state, and auth commands to agent-browser", async () => {
  const calls: Array<{ args: string[]; input?: string }> = [];
  const browserRunner = createBrowserRunner(async (args, options) => {
    calls.push({
      args,
      ...(options?.input === undefined ? {} : { input: options.input })
    });
    return { exitCode: 0, stdout: "{}\n", stderr: "" };
  });

  const profilesOutput = createOutput();
  assert.equal(await runCli(["profiles"], {
    stdout: profilesOutput.stdout,
    stderr: profilesOutput.stderr,
    browserRunner
  }), 0);

  const stateOutput = createOutput();
  assert.equal(await runCli(["state", "load", "/tmp/app-state.json"], {
    stdout: stateOutput.stdout,
    stderr: stateOutput.stderr,
    browserRunner
  }), 0);

  const authOutput = createOutput();
  assert.equal(await runCli([
    "auth",
    "save",
    "app",
    "--url",
    "https://app.example.com/login",
    "--username",
    "tester",
    "--password-stdin"
  ], {
    stdout: authOutput.stdout,
    stderr: authOutput.stderr,
    stdin: createInput("secret\n"),
    browserRunner
  }), 0);

  assert.deepEqual(calls, [
    { args: ["profiles", "--json"] },
    { args: ["state", "load", "/tmp/app-state.json", "--json"] },
    {
      args: [
        "auth",
        "save",
        "app",
        "--url",
        "https://app.example.com/login",
        "--username",
        "tester",
        "--password-stdin",
        "--json"
      ],
      input: "secret\n"
    }
  ]);
});

test("forwards Chrome profile and state launch options when opening a page", async () => {
  const calls: string[][] = [];
  let launchOptions: unknown;
  const output = createOutput();
  const exitCode = await runCli([
    "open",
    "https://app.example.com",
    "--profile",
    "Work",
    "--state",
    "/tmp/app-state.json",
    "--no-bridge"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async (args, options) => {
      calls.push(args);
      launchOptions = options;
      return { exitCode: 0, stdout: "", stderr: "" };
    })
  });

  assert.equal(exitCode, 0);
  assert.deepEqual(calls[0]?.slice(0, -1), [
    "--profile",
    "Work",
    "--state",
    "/tmp/app-state.json",
    "open"
  ]);
  assert.match(calls[0]?.at(-1) ?? "", /^https:\/\/app\.example\.com\/\?divebellSessionId=/);
  assert.deepEqual(launchOptions, {
    ui: false,
    disableRestore: true,
    reuseInitialBlankPage: true
  });
});

test("saves state for the primary URL and repeatable included sign-in URLs", async () => {
  const tempDirectory = mkdtempSync(join(tmpdir(), "divebell-state-test-"));
  const outputPath = join(tempDirectory, "nested", "app-state.json");
  try {
    const output = createOutput();
    const exitCode = await runCli([
      "state",
      "save",
      outputPath,
      "--url",
      "https://app.example.com/account/settings",
      "--include-url",
      "https://sso.example.net/login",
      "--include-url",
      "id.example.org"
    ], {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        assert.equal(args[0], "state");
        assert.equal(args[1], "save");
        assert.deepEqual(args.slice(3), [
          "--include-origin",
          "https://sso.example.net",
          "--include-origin",
          "https://id.example.org",
          "--json"
        ]);
        writeFileSync(args[2] ?? "", JSON.stringify({
          cookies: [
            { name: "parent", domain: ".example.com", path: "/", secure: true },
            { name: "account", domain: "app.example.com", path: "/account" },
            { name: "admin", domain: "app.example.com", path: "/admin" },
            { name: "sso", domain: "sso.example.net", path: "/login", httpOnly: true },
            { name: "id", domain: ".example.org", path: "/", secure: true },
            { name: "other", domain: ".other.example", path: "/" }
          ],
          origins: [
            { origin: "https://app.example.com", localStorage: [{ name: "token", value: "1" }] },
            { origin: "https://sso.example.net", localStorage: [{ name: "sso", value: "2" }] },
            { origin: "https://id.example.org", localStorage: [{ name: "id", value: "3" }] },
            { origin: "https://other.example", localStorage: [{ name: "token", value: "2" }] }
          ]
        }));
        return { exitCode: 0, stdout: "{}\n", stderr: "" };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(JSON.parse(output.text()), {
      path: resolve(outputPath),
      url: "https://app.example.com/account/settings",
      includeUrls: ["https://sso.example.net/login", "https://id.example.org/"],
      cookies: 4,
      origins: 3
    });
    assert.deepEqual(JSON.parse(readFileSync(outputPath, "utf8")), {
      cookies: [
        { name: "parent", domain: ".example.com", path: "/", secure: true },
        { name: "account", domain: "app.example.com", path: "/account" },
        { name: "sso", domain: "sso.example.net", path: "/login", httpOnly: true },
        { name: "id", domain: ".example.org", path: "/", secure: true }
      ],
      origins: [
        { origin: "https://app.example.com", localStorage: [{ name: "token", value: "1" }] },
        { origin: "https://sso.example.net", localStorage: [{ name: "sso", value: "2" }] },
        { origin: "https://id.example.org", localStorage: [{ name: "id", value: "3" }] }
      ]
    });
  } finally {
    rmSync(tempDirectory, { recursive: true, force: true });
  }
});

test("requires a path and a valid URL for URL-scoped state saves", async () => {
  let browserTouched = false;
  const browserRunner = createBrowserRunner(async () => {
    browserTouched = true;
    return { exitCode: 0, stdout: "", stderr: "" };
  });

  const missingPathOutput = createOutput();
  assert.equal(await runCli(["state", "save", "--url", "https://app.example.com"], {
    stdout: missingPathOutput.stdout,
    stderr: missingPathOutput.stderr,
    browserRunner
  }), 1);
  assert.deepEqual(JSON.parse(missingPathOutput.text()), errorOutput("state save", {
    code: "STATE_SAVE_PATH_REQUIRED",
    kind: "validation",
    message: "state save requires <path>.",
    retryable: false,
    hint: "Use `divebell state save ./app-state.json --url https://app.example.com`."
  }));

  const invalidUrlOutput = createOutput();
  assert.equal(await runCli(["state", "save", "/tmp/app-state.json", "--url", "ftp://example.com"], {
    stdout: invalidUrlOutput.stdout,
    stderr: invalidUrlOutput.stderr,
    browserRunner
  }), 1);
  assert.equal(JSON.parse(invalidUrlOutput.text()).error.code, "STATE_URL_INVALID");

  const invalidIncludeUrlOutput = createOutput();
  assert.equal(await runCli([
    "state",
    "save",
    "/tmp/app-state.json",
    "--url",
    "https://app.example.com",
    "--include-url",
    "ftp://sso.example.com"
  ], {
    stdout: invalidIncludeUrlOutput.stdout,
    stderr: invalidIncludeUrlOutput.stderr,
    browserRunner
  }), 1);
  assert.equal(JSON.parse(invalidIncludeUrlOutput.text()).error.code, "STATE_URL_INVALID");

  const missingPrimaryUrlOutput = createOutput();
  assert.equal(await runCli([
    "state",
    "save",
    "/tmp/app-state.json",
    "--include-url",
    "https://sso.example.com"
  ], {
    stdout: missingPrimaryUrlOutput.stdout,
    stderr: missingPrimaryUrlOutput.stderr,
    browserRunner
  }), 1);
  assert.equal(JSON.parse(missingPrimaryUrlOutput.text()).error.code, "STATE_URL_REQUIRED");

  const repeatedPrimaryUrlOutput = createOutput();
  assert.equal(await runCli([
    "state",
    "save",
    "/tmp/app-state.json",
    "--url",
    "https://app.example.com",
    "--url",
    "https://sso.example.com"
  ], {
    stdout: repeatedPrimaryUrlOutput.stdout,
    stderr: repeatedPrimaryUrlOutput.stderr,
    browserRunner
  }), 1);
  assert.equal(JSON.parse(repeatedPrimaryUrlOutput.text()).error.code, "STATE_URL_REPEATED");
  assert.equal(browserTouched, false);
});

function createInput(value: string): AsyncIterable<string> {
  return {
    async *[Symbol.asyncIterator]() {
      yield value;
    }
  };
}
