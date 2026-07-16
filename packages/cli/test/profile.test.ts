import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { test } from "@rstest/core";

import { runCli } from "../dist/index.js";
import { convertAuthConnectorPayloadToStorageState, exportAuthProfileWithConnector, writeAuthConnectorExtension } from "../dist/auth-connector.js";
import {
  createAgentBrowserEnvironment,
  createAgentBrowserRunner,
  createDefaultBrowserProfileDirectory,
  createDefaultBrowserRunner
} from "../dist/browser.js";
import { AUTH_STATE_FILE_NAME, exportAuthStateProfile } from "../dist/profile.js";

import { createBrowserRunner, createOutput, errorOutput } from "./helpers.js";

test("uses the default OpenRuntime browser profile directory", () => {
  const env = createAgentBrowserEnvironment({});

  assert.equal(env.AGENT_BROWSER_PROFILE, createDefaultBrowserProfileDirectory());
});

test("configures agent-browser with the shared profile and a stable session", () => {
  const env = createAgentBrowserEnvironment({
    OPENRUNTIME_BROWSER_PROFILE_DIR: "/tmp/custom-openruntime-profile",
    OPENRUNTIME_AGENT_BROWSER_SESSION: "memory-check"
  });

  assert.equal(env.AGENT_BROWSER_PROFILE, "/tmp/custom-openruntime-profile");
  assert.equal(env.AGENT_BROWSER_SESSION, "memory-check");
  assert.equal(env.AGENT_BROWSER_HEADED, undefined);

  const visibleEnv = createAgentBrowserEnvironment({}, "/tmp/visible-profile", "visible", { ui: true });
  assert.equal(visibleEnv.AGENT_BROWSER_PROFILE, "/tmp/visible-profile");
  assert.equal(visibleEnv.AGENT_BROWSER_SESSION, "visible");
  assert.equal(visibleEnv.AGENT_BROWSER_HEADED, "1");
});

test("runs agent-browser through a replaceable executable entry", async () => {
  const runner = createAgentBrowserRunner({
    executablePath: process.execPath,
    prefixArgs: [
      "-e",
      "process.stdout.write(JSON.stringify({ success: true, data: { args: process.argv.slice(1), profile: process.env.AGENT_BROWSER_PROFILE, session: process.env.AGENT_BROWSER_SESSION } }))"
    ],
    profileDirectory: "/tmp/openruntime-agent-browser-profile",
    session: "openruntime-test"
  });

  const result = await runner.run(["memory", "metrics", "--json"]);
  assert.equal(result.exitCode, 0);
  assert.deepEqual(JSON.parse(result.stdout), {
    args: ["memory", "metrics", "--json"],
    profile: "/tmp/openruntime-agent-browser-profile",
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

test("loads an imported OpenRuntime auth state through agent-browser", () => {
  const profileDirectory = mkdtempSync(join(tmpdir(), "openruntime-cli-profile-"));
  const authStatePath = join(profileDirectory, AUTH_STATE_FILE_NAME);
  try {
    writeFileSync(authStatePath, JSON.stringify({ cookies: [], origins: [] }));
    const env = createAgentBrowserEnvironment({}, profileDirectory);
    assert.equal(env.AGENT_BROWSER_STATE, authStatePath);
  } finally {
    rmSync(profileDirectory, { recursive: true, force: true });
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

    let closeArgs: string[] | undefined;
    let appliedProfileDirectory: string | undefined;
    let appliedStorageState: unknown;
    const importOutput = createOutput();
    const importExitCode = await runCli(["auth", "import", "--input", inputPath], {
      stdout: importOutput.stdout,
      stderr: importOutput.stderr,
      authStateApplier: async (applierProfileDirectory, storageState) => {
        appliedProfileDirectory = applierProfileDirectory;
        appliedStorageState = storageState;
      },
      browserRunner: createBrowserRunner(async (args) => {
        closeArgs = args;
        return {
          exitCode: 0,
          stdout: "",
          stderr: ""
        };
      })
    });

    assert.equal(importExitCode, 0);
    assert.equal(importOutput.errorText(), "");
    assert.deepEqual(closeArgs, ["close"]);
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
    const clearUrlExitCode = await runCli(["auth", "clear", "--url", "https://app.example.com/dashboard"], {
      stdout: clearUrlOutput.stdout,
      stderr: clearUrlOutput.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        closeArgs = args;
        return {
          exitCode: 1,
          stdout: "",
          stderr: "daemon failed to start (/tmp/agent-browser.sock)"
        };
      })
    });

    assert.equal(clearUrlExitCode, 0);
    assert.equal(clearUrlOutput.errorText(), "");
    assert.deepEqual(closeArgs, ["close"]);
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
    const clearExitCode = await runCli(["auth", "clear"], {
      stdout: clearOutput.stdout,
      stderr: clearOutput.stderr,
      browserRunner: createBrowserRunner(async (args) => {
        closeArgs = args;
        return {
          exitCode: 1,
          stdout: "",
          stderr: "daemon failed to start (/tmp/agent-browser.sock)"
        };
      })
    });

    assert.equal(clearExitCode, 0);
    assert.equal(clearOutput.errorText(), "");
    assert.deepEqual(closeArgs, ["close"]);
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
    "--url",
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

test("rejects unsupported auth export URLs before opening Chrome", async () => {
  const output = createOutput();
  let didOpenChrome = false;
  const exitCode = await runCli([
    "auth",
    "export",
    "--url",
    "ftp://example.com"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async () => {
      didOpenChrome = true;
      return {
        kind: "auth",
        content: "unexpected"
      };
    }
  });

  assert.equal(exitCode, 1);
  assert.equal(output.errorText(), "");
  assert.equal(didOpenChrome, false);
  assert.deepEqual(JSON.parse(output.text()), errorOutput("auth export", {
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

test("writes oversized profile export content to a temporary file", async () => {
  const output = createOutput();
  const content = `openruntime-profile:v1:auth:${"a".repeat(40_000)}`;
  const exitCode = await runCli(["auth", "export", "--url", "example.com"], {
    stdout: output.stdout,
    stderr: output.stderr,
    authConnectorExporter: async () => ({
      kind: "auth",
      content
    })
  });
  const path = output.text().trim();

  try {
    assert.equal(exitCode, 0);
    assert.equal(output.errorText(), "");
    assert.match(path, /openruntime-profile-export-.+\/openruntime-profile\.oprprofile$/);
    assert.equal(readFileSync(path, "utf8"), `${content}\n`);
  } finally {
    if (path.includes("openruntime-profile-export-") && existsSync(path)) {
      rmSync(dirname(path), {
        recursive: true,
        force: true
      });
    }
  }
});
