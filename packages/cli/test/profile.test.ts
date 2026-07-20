import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import { convertAuthConnectorPayloadToStorageState, exportAuthProfileWithConnector, writeAuthConnectorExtension } from "../dist/features/auth/connector/index.js";
import {
  createAgentBrowserEnvironment,
  createAgentBrowserRunner,
  createDefaultBrowserProfileDirectory,
  createDefaultBrowserRunner,
  resolveAgentBrowserSession,
  resolveBundledAgentBrowserEntryPath
} from "../dist/features/browser/runner.js";
import { AUTH_STATE_FILE_NAME, clearProfile, exportAuthStateProfile } from "../dist/features/auth/profile.js";
import { AUTH_STATE_APPLIED_FILE_NAME, ensureSavedAuthStateApplied } from "../dist/features/auth/browser-state.js";

import { createBrowserRunner, createOutput, errorOutput } from "./helpers.js";

test("uses agent-browser automatic restore without a persistent browser profile", () => {
  const env = createAgentBrowserEnvironment({});

  assert.equal(env.AGENT_BROWSER_PROFILE, undefined);
  assert.equal(env.AGENT_BROWSER_STATE, undefined);
  assert.equal(env.AGENT_BROWSER_SESSION, "openruntime");
  assert.equal(env.AGENT_BROWSER_RESTORE, "openruntime");
  assert.equal(createDefaultBrowserProfileDirectory().endsWith(".openruntime/browser-profile"), true);
});

test("configures agent-browser with isolated automatic restore and a stable session", () => {
  const env = createAgentBrowserEnvironment({
    OPENRUNTIME_BROWSER_PROFILE_DIR: "/tmp/custom-openruntime-profile",
    OPENRUNTIME_AGENT_BROWSER_SESSION: "memory-check"
  });

  assert.equal(env.AGENT_BROWSER_PROFILE, undefined);
  assert.equal(env.AGENT_BROWSER_SESSION, "memory-check");
  assert.equal(env.AGENT_BROWSER_RESTORE, "memory-check");
  assert.equal(env.AGENT_BROWSER_HEADED, undefined);

  const visibleEnv = createAgentBrowserEnvironment({}, "/tmp/visible-profile", "visible", { ui: true });
  assert.equal(visibleEnv.AGENT_BROWSER_PROFILE, undefined);
  assert.equal(visibleEnv.AGENT_BROWSER_SESSION, "visible");
  assert.equal(visibleEnv.AGENT_BROWSER_RESTORE, "visible");
  assert.equal(visibleEnv.AGENT_BROWSER_HEADED, "1");
});

test("runs agent-browser through a replaceable executable entry", async () => {
  const runner = createAgentBrowserRunner({
    executablePath: process.execPath,
    prefixArgs: [
      "-e",
      "process.stdout.write(JSON.stringify({ success: true, data: { args: process.argv.slice(1), profile: process.env.AGENT_BROWSER_PROFILE, restore: process.env.AGENT_BROWSER_RESTORE, session: process.env.AGENT_BROWSER_SESSION } }))"
    ],
    profileDirectory: "/tmp/openruntime-agent-browser-profile",
    session: "openruntime-test"
  });

  const result = await runner.run(["memory", "metrics", "--json"]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ["memory", "metrics", "--json"],
    restore: "openruntime-test",
    session: "openruntime-test"
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

test("uses the packaged OpenRuntime agent-browser by default", async () => {
  const entryPath = resolveBundledAgentBrowserEntryPath();
  assert.match(entryPath ?? "", /@openruntime[\\/]agent-browser[\\/]bin[\\/]agent-browser\.js$/);

  const runner = createDefaultBrowserRunner({ env: {} });
  const result = await runner.run(["--version"]);
  assert.equal(result.exitCode, 0);
  assert.match(result.stdout, /agent-browser 0\.32\.0-openruntime\.1/);
});

test("preserves agent-browser memory error codes while exposing a readable error", async () => {
  const runner = createAgentBrowserRunner({
    executablePath: process.execPath,
    prefixArgs: [
      "-e",
      "process.stdout.write(JSON.stringify({ success: false, errorCode: 'memory_no_capture', error: 'No memory capture is active' })); process.exitCode = 1"
    ]
  });

  const result = await runner.run(["memory", "cancel", "--json"]);
  assert.equal(result.exitCode, 1);
  assert.equal(result.stderr, "No memory capture is active");
  assert.deepEqual(JSON.parse(result.stdout), {
    errorCode: "memory_no_capture",
    error: "No memory capture is active"
  });
});

test("never combines the OpenRuntime auth file with an agent-browser profile", () => {
  const profileDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-profile-"));
  const authStatePath = join(profileDirectory, AUTH_STATE_FILE_NAME);
  try {
    writeFileSync(authStatePath, JSON.stringify({ cookies: [], origins: [] }));
    const env = createAgentBrowserEnvironment({
      AGENT_BROWSER_PROFILE: "/tmp/inherited-profile",
      AGENT_BROWSER_STATE: authStatePath
    }, profileDirectory);
    assert.equal(env.AGENT_BROWSER_STATE, undefined);
    assert.equal(env.AGENT_BROWSER_PROFILE, undefined);
    assert.equal(typeof env.AGENT_BROWSER_RESTORE, "string");
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
  }
});

test("merges current browser auth and seeds automatic restore once on import", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-seed-"));
  const profileDirectory = join(tempDir, "profile");
  const inputPath = join(tempDir, "auth.oprprofile");
  const previousProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  const previousSession = process.env.OPENRUNTIME_AGENT_BROWSER_SESSION;
  try {
    process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = profileDirectory;
    process.env.OPENRUNTIME_AGENT_BROWSER_SESSION = "auth-seed-test";
    await exportAuthStateProfile({
      outputPath: inputPath,
      storageState: {
        cookies: [
          {
            name: "imported",
            value: "new",
            domain: ".example.com",
            path: "/"
          }
        ],
        origins: []
      }
    });

    const currentStorageState = {
      cookies: [
        {
          name: "current",
          value: "kept",
          domain: ".existing.example",
          path: "/"
        }
      ],
      origins: []
    };
    const browserCalls: string[][] = [];
    let loadedStorageState: unknown;
    const output = createOutput();
    const exitCode = await runCli(["auth", "import", inputPath], {
      stdout: output.stdout,
      stderr: output.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        if (args[0] === "state" && args[1] === "save") {
          writeFileSync(args[2] ?? "", JSON.stringify(currentStorageState));
        }
        if (args[0] === "state" && args[1] === "load") {
          loadedStorageState = JSON.parse(readFileSync(args[2] ?? "", "utf8"));
        }
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      })
    });

    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.deepEqual(browserCalls.map((args) => args.slice(0, 2)), [
      ["open"],
      ["state", "save"],
      ["close"],
      ["open"],
      ["state", "load"],
      ["close"]
    ]);
    assert.deepEqual(loadedStorageState, {
      cookies: [
        {
          name: "current",
          value: "kept",
          domain: ".existing.example",
          path: "/"
        },
        {
          name: "imported",
          value: "new",
          domain: ".example.com",
          path: "/"
        }
      ],
      origins: []
    });
    const normalEnv = createAgentBrowserEnvironment(process.env);
    assert.equal(normalEnv.AGENT_BROWSER_STATE, undefined);
    assert.equal(normalEnv.AGENT_BROWSER_PROFILE, undefined);
    assert.equal(normalEnv.AGENT_BROWSER_RESTORE, "auth-seed-test");
    assert.equal(existsSync(join(profileDirectory, AUTH_STATE_APPLIED_FILE_NAME)), true);
  } finally {
    if (previousProfileDirectory === undefined) {
      delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
    } else {
      process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = previousProfileDirectory;
    }
    if (previousSession === undefined) {
      delete process.env.OPENRUNTIME_AGENT_BROWSER_SESSION;
    } else {
      process.env.OPENRUNTIME_AGENT_BROWSER_SESSION = previousSession;
    }
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("requires the auth import path as a positional argument", async () => {
  const output = createOutput();
  let touchedBrowser = false;
  const exitCode = await runCli([
    "auth",
    "import",
    "--input",
    "/tmp/auth.oprprofile"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    browserRunner: createBrowserRunner(async () => {
      touchedBrowser = true;
      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    })
  });

  assert.equal(exitCode, 1);
  assert.equal(touchedBrowser, false);
  assert.deepEqual(JSON.parse(output.text()), errorOutput("auth import", {
    code: "AUTH_IMPORT_PATH_REQUIRED",
    kind: "validation",
    message: "auth import requires <path>.",
    retryable: false,
    hint: "Use `openruntime auth import /path/to/auth.oprprofile`."
  }));
});

test("applies auth saved before the agent-browser migration on the first open only", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-migration-"));
  const profileDirectory = join(tempDir, "profile");
  const statePath = join(profileDirectory, AUTH_STATE_FILE_NAME);
  try {
    mkdirSync(profileDirectory, { recursive: true });
    writeFileSync(statePath, JSON.stringify({
      cookies: [
        {
          name: "legacy",
          value: "kept",
          domain: ".example.com",
          path: "/"
        }
      ],
      origins: []
    }));

    const browserCalls: string[][] = [];
    const browserRunner = createBrowserRunner(async (args) => {
      browserCalls.push(args);
      return {
        exitCode: 0,
        stdout: "",
        stderr: ""
      };
    });
    browserRunner.authState = {
      profileDirectory,
      restoreName: "migration-one"
    };

    await ensureSavedAuthStateApplied(browserRunner, profileDirectory);
    assert.deepEqual(browserCalls, [
      ["open"],
      ["state", "load", statePath],
      ["close"]
    ]);
    assert.equal(existsSync(join(profileDirectory, AUTH_STATE_APPLIED_FILE_NAME)), true);

    await ensureSavedAuthStateApplied(browserRunner, profileDirectory);
    assert.equal(browserCalls.length, 3);

    browserRunner.authState.restoreName = "migration-two";
    await ensureSavedAuthStateApplied(browserRunner, profileDirectory);
    assert.deepEqual(browserCalls.slice(3), [
      ["open"],
      ["state", "load", statePath],
      ["close"]
    ]);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("preserves current browser auth when clearing a site with no matching state", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-clear-preserve-"));
  const profileDirectory = join(tempDir, "profile");
  const statePath = join(profileDirectory, AUTH_STATE_FILE_NAME);
  try {
    mkdirSync(profileDirectory, { recursive: true });
    writeFileSync(statePath, JSON.stringify({
      cookies: [
        {
          name: "session",
          value: "old",
          domain: ".example.com",
          path: "/"
        }
      ],
      origins: []
    }));

    const result = await clearProfile({
      profileDirectory,
      url: "https://not-imported.example.org",
      currentStorageState: {
        cookies: [
          {
            name: "session",
            value: "refreshed",
            domain: ".example.com",
            path: "/"
          }
        ],
        origins: []
      }
    });

    assert.equal(result.removed, false);
    assert.equal(JSON.parse(readFileSync(statePath, "utf8")).cookies[0].value, "refreshed");
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("imports, lists, and clears the current auth profile", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-profile-command-"));
  const profileDirectory = join(tempDir, "profile");
  const inputPath = join(tempDir, "auth.oprprofile");
  const previousProfileDirectory = process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
  try {
    process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = profileDirectory;
    const exported = await exportAuthStateProfile({
      outputPath: inputPath,
      storageState: {
        cookies: [
          {
            name: "sid",
            value: "1",
            domain: ".example.com",
            path: "/",
            expires: -1,
            httpOnly: true,
            secure: true
          },
          {
            name: "other",
            value: "2",
            domain: "other.example",
            path: "/",
            expires: -1,
            httpOnly: false,
            secure: true
          }
        ],
        origins: [
          {
            origin: "https://app.example.com",
            localStorage: []
          },
          {
            origin: "https://other.example",
            localStorage: []
          }
        ]
      }
    });
    assert.equal(exported.path, inputPath);

    let browserCalls: string[][] = [];
    let appliedProfileDirectory: string | undefined;
    let appliedStorageState: unknown;
    const importOutput = createOutput();
    const importExitCode = await runCli(["auth", "import", inputPath], {
      stdout: importOutput.stdout,
      stderr: importOutput.stderr,
      authStateApplier: async (applierProfileDirectory, storageState) => {
        appliedProfileDirectory = applierProfileDirectory;
        appliedStorageState = storageState;
      },
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      })
    });

    assert.equal(importExitCode, 0);
    assert.equal(importOutput.errorText(), "");
    assert.deepEqual(browserCalls, [["close"]]);
    assert.deepEqual(JSON.parse(importOutput.text()), {
      kind: "auth",
      profileDirectory
    });
    const importedStorageState = JSON.parse(readFileSync(join(profileDirectory, AUTH_STATE_FILE_NAME), "utf8"));
    assert.equal(appliedProfileDirectory, profileDirectory);
    assert.deepEqual(appliedStorageState, importedStorageState);
    assert.deepEqual(importedStorageState, {
      cookies: [
        {
          name: "sid",
          value: "1",
          domain: ".example.com",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: true
        },
        {
          name: "other",
          value: "2",
          domain: "other.example",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: true
        }
      ],
      origins: [
        {
          origin: "https://app.example.com",
          localStorage: []
        },
        {
          origin: "https://other.example",
          localStorage: []
        }
      ]
    });

    const listOutput = createOutput();
    const listExitCode = await runCli(["auth", "list"], {
      stdout: listOutput.stdout,
      stderr: listOutput.stderr
    });
    assert.equal(listExitCode, 0);
    assert.equal(listOutput.errorText(), "");
    assert.deepEqual(JSON.parse(listOutput.text()), {
      kind: "auth",
      profileDirectory,
      authStatePath: join(profileDirectory, AUTH_STATE_FILE_NAME),
      imported: true,
      sites: [
        {
          site: "app.example.com",
          cookies: 0,
          origins: ["https://app.example.com"]
        },
        {
          site: "example.com",
          cookies: 1,
          origins: []
        },
        {
          site: "other.example",
          cookies: 1,
          origins: ["https://other.example"]
        }
      ]
    });

    const clearUrlOutput = createOutput();
    browserCalls = [];
    const clearUrlExitCode = await runCli(["auth", "clear", "--url", "https://app.example.com/dashboard"], {
      stdout: clearUrlOutput.stdout,
      stderr: clearUrlOutput.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 1,
          stdout: "",
          stderr: "daemon failed to start (/tmp/agent-browser.sock)"
        };
      })
    });

    assert.equal(clearUrlExitCode, 0);
    assert.equal(clearUrlOutput.errorText(), "");
    assert.deepEqual(browserCalls, [
      ["open"],
      ["close"],
      ["state", "clear", resolveAgentBrowserSession(process.env, profileDirectory), "--json"],
      ["open"]
    ]);
    assert.deepEqual(JSON.parse(clearUrlOutput.text()), {
      kind: "auth",
      profileDirectory,
      removed: true,
      url: "https://app.example.com/dashboard",
      removedCookies: 1,
      removedOrigins: ["https://app.example.com"]
    });
    assert.deepEqual(JSON.parse(readFileSync(join(profileDirectory, AUTH_STATE_FILE_NAME), "utf8")), {
      cookies: [
        {
          name: "other",
          value: "2",
          domain: "other.example",
          path: "/",
          expires: -1,
          httpOnly: false,
          secure: true
        }
      ],
      origins: [
        {
          origin: "https://other.example",
          localStorage: []
        }
      ]
    });

    const clearOutput = createOutput();
    browserCalls = [];
    const clearExitCode = await runCli(["auth", "clear"], {
      stdout: clearOutput.stdout,
      stderr: clearOutput.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        browserCalls.push(args);
        return {
          exitCode: 1,
          stdout: "",
          stderr: "daemon failed to start (/tmp/agent-browser.sock)"
        };
      })
    });

    assert.equal(clearExitCode, 0);
    assert.equal(clearOutput.errorText(), "");
    assert.deepEqual(browserCalls, [
      ["close"],
      ["state", "clear", resolveAgentBrowserSession(process.env, profileDirectory), "--json"]
    ]);
    assert.deepEqual(JSON.parse(clearOutput.text()), {
      kind: "auth",
      profileDirectory,
      removed: true
    });
    assert.equal(existsSync(profileDirectory), false);
  } finally {
    if (previousProfileDirectory === undefined) {
      delete process.env.OPENRUNTIME_BROWSER_PROFILE_DIR;
    } else {
      process.env.OPENRUNTIME_BROWSER_PROFILE_DIR = previousProfileDirectory;
    }
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("exports auth profile through the Chrome auth connector", async () => {
  const output = createOutput();
  let authOptions: unknown;
  const exitCode = await runCli([
    "auth",
    "export",
    "www.douyin.com",
    "--timeout",
    "120000",
    "--extension-dir",
    "/tmp/openruntime-auth-extension",
    "--extension-install-url",
    "https://chromewebstore.google.com/detail/openruntime-auth/test",
    "--extension-icon",
    "/tmp/openruntime-logo.png",
    "--output",
    "/tmp/app-auth.oprprofile"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async (options) => {
      authOptions = options;
      return {
        kind: "auth",
        path: "/tmp/app-auth.oprprofile"
      };
    }
  });

  assert.equal(exitCode, 0);
  assert.equal(output.errorText(), "");
  assert.equal(output.text(), "/tmp/app-auth.oprprofile\n");
  assert.deepEqual(authOptions, {
    requestedUrl: "https://www.douyin.com/",
    outputPath: "/tmp/app-auth.oprprofile",
    timeout: 120000,
    extensionDirectory: "/tmp/openruntime-auth-extension",
    extensionInstallUrl: "https://chromewebstore.google.com/detail/openruntime-auth/test",
    extensionIconPath: "/tmp/openruntime-logo.png"
  });
});

test("requires the auth export URL as a positional argument", async () => {
  const output = createOutput();
  let didOpenChrome = false;
  const exitCode = await runCli([
    "auth",
    "export",
    "--url",
    "example.com"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async () => {
      didOpenChrome = true;
      return {
        kind: "auth",
        path: "/tmp/unexpected.oprprofile"
      };
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(didOpenChrome, false);
  assert.deepEqual(JSON.parse(output.text()), errorOutput("auth export", {
    code: "AUTH_EXPORT_URL_REQUIRED",
    kind: "validation",
    message: "auth export requires <url>.",
    retryable: false,
    hint: "Use `openruntime auth export https://app.example.com`."
  }));
});

test("rejects unsupported auth export URLs before opening Chrome", async () => {
  const output = createOutput();
  let didOpenChrome = false;
  const exitCode = await runCli([
    "auth",
    "export",
    "ftp://example.com"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async () => {
      didOpenChrome = true;
      return {
        kind: "auth",
        path: "/tmp/unexpected.oprprofile"
      };
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.equal(didOpenChrome, false);
  assert.deepEqual(JSON.parse(output.text()), errorOutput("auth export ftp://example.com", {
    code: "AUTH_EXPORT_URL_UNSUPPORTED",
    kind: "validation",
    message: "Auth export URL must use http or https.",
    retryable: false,
    hint: "Pass an http or https URL, or a plain domain."
  }));
});

test("converts Chrome auth connector payload to storage state", () => {
  assert.deepEqual(convertAuthConnectorPayloadToStorageState({
    requestedUrl: "https://app.example.com/dashboard",
    cookies: [
      {
        name: "session",
        value: "secret",
        domain: ".example.com",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "no_restriction",
        expirationDate: 1800000000,
        partitionKey: {
          topLevelSite: "https://app.example.com"
        }
      },
      {
        name: "draft",
        value: "1",
        domain: "app.example.com",
        session: true
      }
    ],
    origins: [
      {
        origin: "https://app.example.com",
        localStorage: [
          {
            name: "theme",
            value: "dark"
          }
        ],
        sessionStorage: [
          {
            name: "wizard",
            value: "1"
          }
        ]
      }
    ]
  }), {
    cookies: [
      {
        name: "session",
        value: "secret",
        domain: ".example.com",
        path: "/",
        expires: 1800000000,
        httpOnly: true,
        secure: true,
        sameSite: "None",
        partitionKey: "https://app.example.com"
      },
      {
        name: "draft",
        value: "1",
        domain: "app.example.com",
        path: "/",
        expires: -1,
        httpOnly: false,
        secure: false
      }
    ],
    origins: [
      {
        origin: "https://app.example.com",
        localStorage: [
          {
            name: "theme",
            value: "dark"
          }
        ]
      }
    ]
  });
});

test("writes an auth connector extension that can be started from the setup page", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-connector-extension-"));
  try {
    await writeAuthConnectorExtension(tempDir);

    const manifest = JSON.parse(readFileSync(join(tempDir, "manifest.json"), "utf8"));
    const setupScript = readFileSync(join(tempDir, "setup-content.js"), "utf8");

    assert.equal(manifest.name, "OpenRuntime Auth Connector");
    assert.deepEqual(manifest.permissions, ["cookies", "scripting", "tabs"]);
    assert.deepEqual(manifest.icons, {
      "16": "icon-16.png",
      "32": "icon-32.png",
      "48": "icon-48.png",
      "128": "icon-128.png"
    });
    assert.deepEqual(manifest.action.default_icon, {
      "16": "icon-16.png",
      "32": "icon-32.png"
    });
    for (const size of [16, 32, 48, 128]) {
      assert.deepEqual(
        readFileSync(join(tempDir, `icon-${size}.png`)),
        readFileSync(join(process.cwd(), "assets", "auth-connector", `icon-${size}.png`))
      );
    }
    assert.match(setupScript, /openruntime\.auth\.connectorReady/);
    assert.match(setupScript, /openruntime\.auth\.exportComplete/);
    assert.match(setupScript, /openruntime\.auth\.startFromPage/);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("writes auth connector extension icons from a custom PNG", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-connector-custom-icon-"));
  const iconPath = join(tempDir, "logo.png");
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAFgwJ/luzQ9wAAAABJRU5ErkJggg==", "base64");
  try {
    writeFileSync(iconPath, png);
    await writeAuthConnectorExtension(join(tempDir, "extension"), {
      iconPath
    });

    for (const size of [16, 32, 48, 128]) {
      assert.deepEqual(readFileSync(join(tempDir, "extension", `icon-${size}.png`)), png);
    }
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("opens the auth connector setup page in automatic export mode", async () => {
  const tempDir = mkdtempSync(join(tmpdir(), "openruntime-auth-connector-auto-"));
  const outputPath = join(tempDir, "auth.oprprofile");
  let openedUrl: string | undefined;

  try {
    const result = await exportAuthProfileWithConnector({
      requestedUrl: "https://app.example.com/",
      outputPath,
      extensionDirectory: tempDir,
      browserOpener: async (url) => {
        openedUrl = url;
        const setupUrl = new URL(url);
        assert.equal(setupUrl.searchParams.get("openruntimeAuthConnector"), "1");
        assert.equal(setupUrl.searchParams.get("auto"), "1");
        const setupHtml = await (await fetch(url)).text();
        assert.match(setupHtml, /复制扩展目录/);
        assert.match(setupHtml, /安装扩展/);
        assert.match(setupHtml, /highlightInstallStep/);
        assert.match(setupHtml, /reloadToDetectInstalledExtension/);
        assert.match(setupHtml, /rel="icon" type="image\/png" sizes="32x32" href="\/icon-32\.png"/);
        assert.match(setupHtml, /class="brand-icon" src="\/icon-128\.png"/);
        const iconResponse = await fetch(`${setupUrl.origin}/icon-32.png`);
        assert.equal(iconResponse.ok, true);
        assert.equal(iconResponse.headers.get("content-type"), "image/png");
        assert.deepEqual(
          Buffer.from(await iconResponse.arrayBuffer()),
          readFileSync(join(process.cwd(), "assets", "auth-connector", "icon-32.png"))
        );
        const faviconResponse = await fetch(`${setupUrl.origin}/favicon.ico`);
        assert.equal(faviconResponse.ok, true);
        assert.equal(faviconResponse.headers.get("content-type"), "image/png");
        assert.deepEqual(
          Buffer.from(await faviconResponse.arrayBuffer()),
          readFileSync(join(process.cwd(), "assets", "auth-connector", "icon-32.png"))
        );
        const token = setupUrl.searchParams.get("token");
        assert.equal(typeof token, "string");
        const response = await fetch(`${setupUrl.origin}/export?token=${encodeURIComponent(token ?? "")}`, {
          method: "POST",
          headers: {
            "content-type": "application/json"
          },
          body: JSON.stringify({
            requestedUrl: "https://app.example.com/",
            cookies: [],
            origins: []
          })
        });
        assert.equal(response.ok, true);
      }
    });

    assert.equal(result.path, outputPath);
    assert.match(openedUrl ?? "", /auto=1/);
    assert.equal(existsSync(outputPath), true);
  } finally {
    rmSync(tempDir, {
      recursive: true,
      force: true
    });
  }
});

test("writes auth export to a temporary file when output is omitted", async () => {
  const output = createOutput();
  let receivedOutputPath: string | undefined;
  const exitCode = await runCli(["auth", "export", "example.com"], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async (options) => {
      receivedOutputPath = options.outputPath;
      writeFileSync(options.outputPath, "profile-file");
      return {
        kind: "auth",
        path: options.outputPath
      };
    }
  });
  const path = output.text().trim();

  try {
    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.match(path, /openruntime-profile-export-.+\/openruntime-profile\.oprprofile$/);
    assert.equal(receivedOutputPath, path);
    assert.equal(readFileSync(path, "utf8"), "profile-file");
  } finally {
    if (path.includes("openruntime-profile-export-") && existsSync(path)) {
      rmSync(dirname(path), {
        recursive: true,
        force: true
      });
    }
  }
});
