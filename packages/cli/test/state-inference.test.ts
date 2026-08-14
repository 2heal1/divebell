import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, test } from "@rstest/core";

import {
  createDivebellCli,
  inferBrowserState,
  sanitizeStateInferenceUrl,
  type BrowserRunOptions,
  type BrowserRunResult,
  type BrowserRunner
} from "../dist/index.js";

interface Scenario {
  har: unknown;
  page?: Record<string, unknown>;
  goto?: BrowserRunResult;
  pageUnavailable?: boolean;
}

interface InferenceRunnerResult {
  runner: BrowserRunner;
  calls: Array<{ args: string[]; options?: BrowserRunOptions }>;
  profileValues: string[];
  temporaryPaths: string[];
  replayStateModes: number[];
}

const TARGET_URL = "https://app.example.com/account";
const TEST_DIRECTORY = mkdtempSync(join(tmpdir(), "divebell-state-inference-test-"));
let testPathIndex = 0;

afterAll(() => {
  rmSync(TEST_DIRECTORY, { recursive: true, force: true });
});

test("state infer saves a verified standard state JSON and returns its path in the command envelope", async () => {
  const loginUrl = "https://sso.example.net/login?code=secret";
  const fixture = createInferenceRunner({
    initial: authRedirectScenario(loginUrl),
    sourceState: createSourceState([TARGET_URL, loginUrl]),
    requiredReplayOrigin: "https://sso.example.net"
  });
  const paths = createTestPaths("cli");
  let stdout = "";
  let stderr = "";
  const exitCode = await createDivebellCli().run([
    "state",
    "infer",
    TARGET_URL,
    "--state",
    paths.failed,
    "--source-profile",
    "Work Profile",
    "--output",
    paths.output,
    "--expect-url",
    "https://app.example.com/account*",
    "--expect-text",
    "Account"
  ], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
    browserRunner: fixture.runner
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.deepEqual(JSON.parse(stdout), {
    status: "ok",
    data: { path: paths.output },
    meta: {
      version: 1,
      command: `state infer ${TARGET_URL}`
    }
  });
  assert.deepEqual(Object.keys(JSON.parse(readFileSync(paths.output, "utf8"))).sort(), [
    "cookies",
    "origins"
  ]);
  assert.equal(statSync(paths.output).mode & 0o777, 0o600);
});

test("state infer allocates a sibling output path in the command envelope", async () => {
  const loginUrl = "https://sso.example.net/login";
  const fixture = createInferenceRunner({
    initial: authRedirectScenario(loginUrl),
    sourceState: createSourceState([TARGET_URL, loginUrl]),
    requiredReplayOrigin: "https://sso.example.net"
  });
  const paths = createTestPaths("automatic-output");
  const expectedPath = paths.failed.replace(/\.json$/, ".inferred.json");
  let stdout = "";
  const exitCode = await createDivebellCli().run([
    "state",
    "infer",
    TARGET_URL,
    "--state",
    paths.failed,
    "--source-profile",
    "Work Profile"
  ], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: () => undefined },
    browserRunner: fixture.runner
  });

  assert.equal(exitCode, 0);
  assert.equal(JSON.parse(stdout).data.path, expectedPath);
  assert.equal(existsSync(expectedPath), true);
});

test("an already-valid input state does not create a replacement or open the source Profile", async () => {
  const fixture = createInferenceRunner({ initial: successScenario() });
  const paths = createTestPaths("already-valid");
  const output = await runInferenceCli(fixture.runner, paths);

  assert.equal(output.exitCode, 1);
  assert.equal(JSON.parse(output.stdout).error.code, "STATE_INFER_INPUT_STATE_VALID");
  assert.equal(existsSync(paths.output), false);
  assert.deepEqual(fixture.profileValues, []);
});

test("a top-level login redirect becomes a sanitized, verified include URL", async () => {
  const loginUrl = "https://user:password@sso.example.net/login?code=oauth-secret#callback";
  const fixture = createInferenceRunner({
    initial: authRedirectScenario(loginUrl),
    sourceState: createSourceState([TARGET_URL, loginUrl]),
    requiredReplayOrigin: "https://sso.example.net"
  });
  const paths = createTestPaths("redirect");

  const result = await inferBrowserState(fixture.runner, {
    url: TARGET_URL,
    statePath: paths.failed,
    sourceProfile: "Work Profile",
    outputPath: paths.output
  });

  assert.equal(result.path, paths.output);
  assert.deepEqual(result.includeUrls, ["https://sso.example.net/login"]);
  assert.equal(result.inference.classification, "auth_redirect");
  assert.equal(result.inference.initialFailure.kind, "redirect");
  assert.deepEqual(result.inference.candidates, [{
    url: "https://sso.example.net/login",
    confidence: "high",
    evidence: ["top-level redirect", "final page matched login signals"],
    sourceStateAvailable: true,
    sourceState: { cookies: 1, origins: 1 },
    verified: true
  }]);
});

test("login forms, authentication iframes, and meta refreshes all produce scoped candidates", async () => {
  const urls = [
    "https://identity.example.org/oauth/authorize?ticket=secret",
    "https://sso.example.net/login?token=secret",
    "https://auth.example.com/signin?code=secret"
  ];
  const fixture = createInferenceRunner({
    initial: {
      har: createHar([createEntry(TARGET_URL, 200, "document")]),
      page: createPage(TARGET_URL, {
        authText: true,
        forms: [{ action: urls[0] ?? "", hasPassword: true }],
        iframes: [urls[1] ?? ""],
        metaRefreshUrls: [urls[2] ?? ""]
      })
    },
    sourceState: createSourceState([TARGET_URL, ...urls]),
    requiredReplayOrigin: "https://auth.example.com"
  });
  const paths = createTestPaths("page-signals");

  const result = await inferBrowserState(fixture.runner, {
    url: TARGET_URL,
    statePath: paths.failed,
    sourceProfile: "Work Profile",
    outputPath: paths.output
  });

  assert.deepEqual(
    result.inference.candidates.map((candidate) => [candidate.url, candidate.confidence]),
    [
      ["https://auth.example.com/signin", "high"],
      ["https://identity.example.org/oauth/authorize", "high"],
      ["https://sso.example.net/login", "high"]
    ]
  );
  assert.match(JSON.stringify(result.inference), /login form action/);
  assert.match(JSON.stringify(result.inference), /authentication iframe/);
  assert.match(JSON.stringify(result.inference), /meta refresh/);
});

for (const status of [401, 403]) {
  test(`a cross-origin authentication fetch returning ${status} can infer state`, async () => {
    const sessionUrl = "https://api.example.net/session?token=secret";
    const fixture = createInferenceRunner({
      initial: {
        har: createHar([
          createEntry(TARGET_URL, 200, "document"),
          createEntry(sessionUrl, status, "fetch")
        ]),
        page: createPage(TARGET_URL)
      },
      sourceState: createSourceState([TARGET_URL, sessionUrl]),
      requiredReplayOrigin: "https://api.example.net"
    });
    const paths = createTestPaths(`fetch-${status}`);

    const result = await inferBrowserState(fixture.runner, {
      url: TARGET_URL,
      statePath: paths.failed,
      sourceProfile: "Work Profile",
      outputPath: paths.output
    });

    assert.equal(result.inference.classification, "auth_response");
    assert.deepEqual(result.includeUrls, ["https://api.example.net/session"]);
    assert.equal(result.inference.candidates[0]?.confidence, "medium");
  });
}

test("a plain 404 cannot infer authentication state", async () => {
  const fixture = createInferenceRunner({
    initial: {
      har: createHar([createEntry(TARGET_URL, 404, "document")]),
      page: createPage(TARGET_URL)
    }
  });
  const paths = createTestPaths("plain-404");
  const output = await runInferenceCli(fixture.runner, paths);

  assert.equal(output.exitCode, 1);
  assert.equal(JSON.parse(output.stdout).error.code, "STATE_INFER_NO_AUTH_SOURCES");
  assert.equal(existsSync(paths.output), false);
});

test("a failed initial navigation still uses captured redirect evidence", async () => {
  const loginUrl = "https://sso.example.net/login?code=secret";
  const fixture = createInferenceRunner({
    initial: {
      har: createHar([createEntry(TARGET_URL, 302, "document", { location: loginUrl })]),
      goto: { exitCode: 1, stdout: "", stderr: "navigation timed out" },
      pageUnavailable: true
    },
    sourceState: createSourceState([TARGET_URL, loginUrl]),
    requiredReplayOrigin: "https://sso.example.net"
  });
  const paths = createTestPaths("navigation-failure");

  const result = await inferBrowserState(fixture.runner, {
    url: TARGET_URL,
    statePath: paths.failed,
    sourceProfile: "Work Profile",
    outputPath: paths.output
  });

  assert.equal(result.inference.navigation.succeeded, false);
  assert.equal(result.inference.classification, "auth_redirect");
  assert.equal(result.inference.candidates[0]?.url, "https://sso.example.net/login");
});

test("static, analytics, advertising, and monitoring failures are not inferred", async () => {
  const fixture = createInferenceRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 404, "document"),
        createEntry("https://analytics.example.net/session", 401, "fetch"),
        createEntry("https://cdn.example.net/login.js", 403, "script"),
        createEntry("https://monitoring.example.net/collect", 401, "xhr"),
        createEntry("https://ads.example.net/pixel", 403, "fetch")
      ]),
      page: createPage(TARGET_URL)
    }
  });
  const paths = createTestPaths("irrelevant");
  const output = await runInferenceCli(fixture.runner, paths);

  assert.equal(output.exitCode, 1);
  assert.equal(JSON.parse(output.stdout).error.code, "STATE_INFER_NO_AUTH_SOURCES");
});

test("inference output never leaks URL, header, cookie, post-body, or response-body secrets", async () => {
  const loginUrl = "https://sso.example.net/login?code=oauth-secret&ticket=ticket-secret#fragment";
  const fixture = createInferenceRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 302, "document", {
          location: loginUrl,
          requestHeaders: [
            { name: "Authorization", value: "Bearer authorization-secret" },
            { name: "Cookie", value: "cookie-name=cookie-value" }
          ],
          headers: [{ name: "Set-Cookie", value: "server-cookie=server-secret" }],
          postData: "password=post-secret",
          body: "response-body-secret"
        }),
        createEntry(loginUrl, 200, "document")
      ]),
      page: createPage(loginUrl, { authText: true })
    },
    sourceState: createSourceState([TARGET_URL, loginUrl]),
    requiredReplayOrigin: "https://sso.example.net"
  });
  const paths = createTestPaths("secrets");

  const result = await inferBrowserState(fixture.runner, {
    url: TARGET_URL,
    statePath: paths.failed,
    sourceProfile: "Work Profile",
    outputPath: paths.output
  });
  const output = JSON.stringify(result.inference);

  for (const secret of [
    "oauth-secret",
    "ticket-secret",
    "authorization-secret",
    "cookie-name",
    "cookie-value",
    "server-cookie",
    "server-secret",
    "post-secret",
    "response-body-secret"
  ]) {
    assert.doesNotMatch(output, new RegExp(secret));
  }
});

test("inference verifies the source Profile, chooses the smallest scope, and cleans temporary files", async () => {
  const loginUrl = "https://sso.example.net/login?code=secret";
  const fixture = createInferenceRunner({
    initial: authRedirectScenario(loginUrl),
    sourceState: createSourceState([TARGET_URL, loginUrl]),
    requiredReplayOrigin: "https://sso.example.net"
  });
  const paths = createTestPaths("minimal");

  const result = await inferBrowserState(fixture.runner, {
    url: TARGET_URL,
    statePath: paths.failed,
    sourceProfile: "Work Profile",
    outputPath: paths.output,
    expectUrl: "https://app.example.com/account*",
    expectText: "Account"
  });

  assert.deepEqual(fixture.profileValues, ["Work Profile"]);
  assert.deepEqual(result.inference.candidates[0]?.sourceState, { cookies: 1, origins: 1 });
  assert.equal(result.inference.candidates[0]?.verified, true);
  assert.deepEqual(result.inference.verification, {
    attempted: 2,
    minimalIncludeUrls: ["https://sso.example.net/login"]
  });
  assert.deepEqual(fixture.replayStateModes, [0o600, 0o600]);
  assert.equal(fixture.temporaryPaths.length > 0, true);
  assert.equal(fixture.temporaryPaths.every((path) => !existsSync(path)), true);
  assert.equal(existsSync(paths.output), true);
});

test("state infer requires an explicit source Profile", async () => {
  const fixture = createInferenceRunner({ initial: authRedirectScenario("https://sso.example.net/login") });
  const paths = createTestPaths("missing-profile");
  let stdout = "";
  const exitCode = await createDivebellCli().run([
    "state",
    "infer",
    TARGET_URL,
    "--state",
    paths.failed
  ], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: () => undefined },
    browserRunner: fixture.runner
  });

  assert.equal(exitCode, 1);
  assert.equal(JSON.parse(stdout).error.code, "STATE_INFER_SOURCE_PROFILE_REQUIRED");
  assert.equal(fixture.calls.length, 0);
});

test("state infer rejects a source Profile that cannot access the target", async () => {
  const loginUrl = "https://sso.example.net/login";
  const fixture = createInferenceRunner({
    initial: authRedirectScenario(loginUrl),
    source: authRedirectScenario(loginUrl),
    sourceState: createSourceState([TARGET_URL, loginUrl]),
    requiredReplayOrigin: "https://sso.example.net"
  });
  const paths = createTestPaths("bad-profile");
  const output = await runInferenceCli(fixture.runner, paths);

  assert.equal(output.exitCode, 1);
  assert.equal(JSON.parse(output.stdout).error.code, "STATE_INFER_SOURCE_PROFILE_ACCESS_FAILED");
  assert.equal(existsSync(paths.output), false);
});

test("state infer never overwrites an existing output", async () => {
  const fixture = createInferenceRunner({ initial: authRedirectScenario("https://sso.example.net/login") });
  const paths = createTestPaths("existing-output");
  writeFileSync(paths.output, "keep");
  const output = await runInferenceCli(fixture.runner, paths);

  assert.equal(output.exitCode, 1);
  assert.equal(JSON.parse(output.stdout).error.code, "STATE_INFER_OUTPUT_EXISTS");
  assert.equal(readFileSync(paths.output, "utf8"), "keep");
  assert.equal(fixture.calls.length, 0);
});

test("candidate URL sanitization preserves origin, port, and useful cookie path", () => {
  assert.equal(
    sanitizeStateInferenceUrl(
      "https://user:pass@sso.example.net:8443/login/deep;jsessionid=secret?code=secret#fragment"
    ),
    "https://sso.example.net:8443/login/deep"
  );
});

function createInferenceRunner(options: {
  initial: Scenario;
  source?: Scenario;
  replay?: Scenario;
  sourceState?: unknown;
  requiredReplayOrigin?: string;
}): InferenceRunnerResult {
  const calls: Array<{ args: string[]; options?: BrowserRunOptions }> = [];
  const scenarios = new Map<string, Scenario>();
  const profileValues: string[] = [];
  const temporaryPaths: string[] = [];
  const replayStateModes: number[] = [];
  const sourceScenario = options.source ?? successScenario();
  const replayScenario = options.replay ?? successScenario();
  const runner: BrowserRunner = {
    run: async (args, runOptions = {}) => {
      calls.push({ args: [...args], options: { ...runOptions } });
      const session = runOptions.session ?? "default";
      if (args[0] === "--state" && args[2] === "open") {
        const statePath = args[1] ?? "";
        if (statePath.includes("failed-")) {
          scenarios.set(session, options.initial);
        } else {
          temporaryPaths.push(statePath);
          replayStateModes.push(statSync(statePath).mode & 0o777);
          scenarios.set(
            session,
            replayHasRequiredOrigin(statePath, options.requiredReplayOrigin)
              ? replayScenario
              : options.initial
          );
        }
        return ok();
      }
      if (args[0] === "--profile" && args[2] === "open") {
        scenarios.set(session, sourceScenario);
        profileValues.push(args[1] ?? "");
        return ok();
      }
      if (args[0] === "state" && args[1] === "save") {
        const path = args[2] ?? "";
        temporaryPaths.push(path);
        writeFileSync(path, JSON.stringify(options.sourceState ?? { cookies: [], origins: [] }));
        return ok();
      }

      const scenario = scenarios.get(session) ?? options.initial;
      if (args[0] === "goto") return scenario.goto ?? ok();
      if (args[0] === "eval") {
        return scenario.pageUnavailable === true
          ? fail("no page context")
          : {
            exitCode: 0,
            stdout: `${JSON.stringify(scenario.page ?? createPage(TARGET_URL))}\n`,
            stderr: ""
          };
      }
      if (args[0] === "get" && args[1] === "url") {
        return scenario.pageUnavailable === true
          ? fail("no page context")
          : {
            exitCode: 0,
            stdout: `${JSON.stringify({ url: scenario.page?.url ?? TARGET_URL })}\n`,
            stderr: ""
          };
      }
      if (args[0] === "network" && args[1] === "har" && args[2] === "stop") {
        const path = args[3] ?? "";
        temporaryPaths.push(path);
        writeFileSync(path, JSON.stringify(scenario.har), { mode: 0o600 });
        return ok();
      }
      return ok();
    }
  };
  return { runner, calls, profileValues, temporaryPaths, replayStateModes };
}

function replayHasRequiredOrigin(path: string, requiredOrigin: string | undefined): boolean {
  if (requiredOrigin === undefined) return true;
  const state = JSON.parse(readFileSync(path, "utf8")) as {
    cookies: Array<{ domain?: string }>;
    origins: Array<{ origin?: string }>;
  };
  const hostname = new URL(requiredOrigin).hostname;
  return state.origins.some((origin) => origin.origin === requiredOrigin)
    || state.cookies.some((cookie) => cookie.domain?.replace(/^\./, "") === hostname);
}

function createSourceState(urls: string[]): unknown {
  const uniqueUrls = [...new Map(urls.map((input) => {
    const url = new URL(input);
    return [url.origin, url] as const;
  })).values()];
  return {
    cookies: uniqueUrls.map((url, index) => ({
      name: `private-cookie-${index}`,
      value: `private-value-${index}`,
      domain: url.hostname,
      path: "/",
      secure: url.protocol === "https:"
    })),
    origins: uniqueUrls.map((url, index) => ({
      origin: url.origin,
      localStorage: [{ name: `private-storage-${index}`, value: `private-${index}` }]
    }))
  };
}

function successScenario(): Scenario {
  return {
    har: createHar([createEntry(TARGET_URL, 200, "document")]),
    page: createPage(TARGET_URL, { expectTextMatched: true })
  };
}

function authRedirectScenario(loginUrl: string): Scenario {
  return {
    har: createHar([
      createEntry(TARGET_URL, 302, "document", { location: loginUrl }),
      createEntry(loginUrl, 200, "document")
    ]),
    page: createPage(loginUrl, { authText: true, passwordField: true })
  };
}

function createTestPaths(label: string): { failed: string; output: string } {
  testPathIndex += 1;
  return {
    failed: join(TEST_DIRECTORY, `failed-${testPathIndex}-${label}.json`),
    output: join(TEST_DIRECTORY, `inferred-${testPathIndex}-${label}.json`)
  };
}

async function runInferenceCli(
  browserRunner: BrowserRunner,
  paths: { failed: string; output: string }
): Promise<{ exitCode: number; stdout: string }> {
  let stdout = "";
  const exitCode = await createDivebellCli().run([
    "state",
    "infer",
    TARGET_URL,
    "--state",
    paths.failed,
    "--source-profile",
    "Work Profile",
    "--output",
    paths.output
  ], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: () => undefined },
    browserRunner
  });
  return { exitCode, stdout };
}

function createPage(
  url: string,
  overrides: Partial<{
    authText: boolean;
    passwordField: boolean;
    forms: Array<{ action: string; hasPassword: boolean }>;
    iframes: string[];
    metaRefreshUrls: string[];
    expectTextMatched: boolean;
  }> = {}
): Record<string, unknown> {
  return {
    url,
    authText: overrides.authText ?? false,
    passwordField: overrides.passwordField ?? false,
    forms: overrides.forms ?? [],
    iframes: overrides.iframes ?? [],
    metaRefreshUrls: overrides.metaRefreshUrls ?? [],
    ...(overrides.expectTextMatched === undefined
      ? {}
      : { expectTextMatched: overrides.expectTextMatched })
  };
}

function createHar(entries: unknown[]): unknown {
  return { log: { version: "1.2", entries } };
}

function createEntry(
  url: string,
  status: number,
  resourceType: string,
  options: {
    location?: string;
    headers?: Array<{ name: string; value: string }>;
    requestHeaders?: Array<{ name: string; value: string }>;
    postData?: string;
    body?: string;
  } = {}
): unknown {
  return {
    _resourceType: resourceType,
    request: {
      method: options.postData === undefined ? "GET" : "POST",
      url,
      headers: options.requestHeaders ?? [],
      ...(options.postData === undefined ? {} : { postData: { text: options.postData } })
    },
    response: {
      status,
      headers: [
        ...(options.headers ?? []),
        ...(options.location === undefined
          ? []
          : [{ name: "Location", value: options.location }])
      ],
      redirectURL: options.location ?? "",
      content: {
        mimeType: resourceType === "document" ? "text/html" : "application/json",
        ...(options.body === undefined ? {} : { text: options.body })
      }
    }
  };
}

function ok(): BrowserRunResult {
  return { exitCode: 0, stdout: "", stderr: "" };
}

function fail(message: string): BrowserRunResult {
  return { exitCode: 1, stdout: "", stderr: message };
}
