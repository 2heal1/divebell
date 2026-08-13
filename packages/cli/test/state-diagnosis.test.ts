import assert from "node:assert/strict";
import { existsSync, statSync, writeFileSync } from "node:fs";
import { test } from "@rstest/core";

import {
  createDivebellCli,
  diagnoseMissingStateSources,
  sanitizeStateDiagnosisUrl,
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

interface DiagnosisRunnerResult {
  runner: BrowserRunner;
  calls: Array<{ args: string[]; options?: BrowserRunOptions }>;
  profileValues: string[];
  temporaryPaths: string[];
  replayStateModes: number[];
}

const TARGET_URL = "https://app.example.com/account";
const FAILED_STATE = "/tmp/failed-state.json";

test("the state diagnose CLI routes to isolated diagnosis and emits structured JSON", async () => {
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([createEntry(TARGET_URL, 404, "document")]),
      page: createPage(TARGET_URL)
    }
  });
  let stdout = "";
  let stderr = "";
  const exitCode = await createDivebellCli().run([
    "state",
    "diagnose",
    TARGET_URL,
    "--state",
    FAILED_STATE,
    "--json"
  ], {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
    browserRunner: fixture.runner
  });

  assert.equal(exitCode, 0);
  assert.equal(stderr, "");
  assert.equal(JSON.parse(stdout).classification, "not_auth_related");
});

test("successful access returns no candidates and never opens a source Profile", async () => {
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 200, "document")
      ]),
      page: createPage(TARGET_URL)
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE,
    sourceProfile: "Must Not Be Opened"
  });

  assert.equal(result.status, "no_candidates");
  assert.equal(result.classification, "access_ok");
  assert.deepEqual(result.suggestedIncludeUrls, []);
  assert.deepEqual(fixture.profileValues, []);
  assert.deepEqual(
    fixture.calls.slice(0, 3).map((call) => call.args.slice(0, 3)),
    [
      ["--state", FAILED_STATE, "open"],
      ["network", "har", "start"],
      ["goto", TARGET_URL, "--json"]
    ]
  );
});

test("a top-level 302 to a login URL produces a sanitized high-confidence candidate", async () => {
  const loginUrl = "https://user:password@sso.example.net/login?code=oauth-secret#callback";
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 302, "document", { location: loginUrl }),
        createEntry(loginUrl, 200, "document")
      ]),
      page: createPage(loginUrl, { authText: true, passwordField: true })
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.classification, "auth_redirect");
  assert.equal(result.initialFailure.kind, "redirect");
  assert.equal(result.initialFailure.httpStatus, 302);
  assert.deepEqual(result.candidates, [{
    url: "https://sso.example.net/login",
    confidence: "high",
    evidence: ["top-level redirect", "final page matched login signals"]
  }]);
});

test("login form actions, authentication iframes, and meta refreshes produce candidates", async () => {
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([createEntry(TARGET_URL, 200, "document")]),
      page: createPage(TARGET_URL, {
        authText: true,
        forms: [{
          action: "https://identity.example.org/oauth/authorize?ticket=secret",
          hasPassword: true
        }],
        iframes: ["https://sso.example.net/login?token=secret"],
        metaRefreshUrls: ["https://auth.example.com/signin?code=secret"]
      })
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.classification, "login_page");
  assert.deepEqual(result.candidates.map((candidate) => [candidate.url, candidate.confidence]), [
    ["https://auth.example.com/signin", "high"],
    ["https://identity.example.org/oauth/authorize", "high"],
    ["https://sso.example.net/login", "high"]
  ]);
  assert.match(JSON.stringify(result), /login form action/);
  assert.match(JSON.stringify(result), /authentication iframe/);
  assert.match(JSON.stringify(result), /meta refresh/);
});

test("an observable client-side login navigation produces a high-confidence candidate", async () => {
  const loginUrl = "https://identity.example.net/oauth/authorize?code=secret";
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 200, "document"),
        createEntry(loginUrl, 200, "document")
      ]),
      page: createPage(loginUrl, { authText: true })
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.candidates[0]?.confidence, "high");
  assert.equal(result.candidates[0]?.evidence.includes("client-side login navigation"), true);
});

for (const status of [401, 403]) {
  test(`a cross-origin authentication fetch returning ${status} produces a medium candidate`, async () => {
    const fixture = createDiagnosisRunner({
      initial: {
        har: createHar([
          createEntry(TARGET_URL, 200, "document"),
          createEntry(`https://api.example.net/session?token=secret`, status, "fetch")
        ]),
        page: createPage(TARGET_URL)
      }
    });

    const result = await diagnoseMissingStateSources(fixture.runner, {
      url: TARGET_URL,
      statePath: FAILED_STATE
    });

    assert.equal(result.classification, "auth_response");
    assert.deepEqual(result.candidates, [{
      url: "https://api.example.net/session",
      confidence: "medium",
      evidence: [`cross-origin XHR/fetch returned ${status}`]
    }]);
  });
}

test("a plain 404 is not classified as missing authentication state", async () => {
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([createEntry(TARGET_URL, 404, "document")]),
      page: createPage(TARGET_URL)
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.status, "no_candidates");
  assert.equal(result.classification, "not_auth_related");
  assert.equal(result.initialFailure.httpStatus, 404);
  assert.deepEqual(result.suggestedIncludeUrls, []);
});

test("a 404 with authentication evidence stays low or medium confidence", async () => {
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 404, "document"),
        createEntry("https://auth.example.net/session?ticket=secret", 404, "document", {
          headers: [{ name: "WWW-Authenticate", value: "Bearer realm=secret" }]
        })
      ]),
      page: createPage(TARGET_URL, { authText: true })
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.classification, "auth_related_not_found");
  assert.equal(["low", "medium"].includes(result.candidates[0]?.confidence ?? ""), true);
  assert.equal(result.candidates.some((candidate) => candidate.confidence === "high"), false);
});

test("a failed initial navigation still returns pre-navigation HAR evidence", async () => {
  const loginUrl = "https://sso.example.net/login?code=secret";
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 302, "document", { location: loginUrl })
      ]),
      goto: { exitCode: 1, stdout: "", stderr: "navigation timed out" },
      pageUnavailable: true
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.navigation.succeeded, false);
  assert.equal(result.classification, "auth_redirect");
  assert.equal(result.candidates[0]?.url, "https://sso.example.net/login");
  assert.equal(fixture.calls.some((call) =>
    call.args[0] === "network" && call.args[2] === "stop"
  ), true);
});

test("static, analytics, advertising, and monitoring failures are excluded", async () => {
  const fixture = createDiagnosisRunner({
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

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.classification, "not_auth_related");
  assert.deepEqual(result.candidates, []);
});

test("diagnosis output never leaks query secrets, headers, cookies, post bodies, or response bodies", async () => {
  const loginUrl = "https://sso.example.net/login?code=oauth-secret&ticket=ticket-secret#fragment";
  const fixture = createDiagnosisRunner({
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
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });
  const output = JSON.stringify(result);

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
  assert.equal(result.candidates[0]?.url, "https://sso.example.net/login");
});

test("an explicit source Profile reports only counts, verifies a minimal set, and cleans temporary files", async () => {
  const loginUrl = "https://sso.example.net/login?code=secret";
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 302, "document", { location: loginUrl }),
        createEntry(loginUrl, 200, "document")
      ]),
      page: createPage(loginUrl, { authText: true })
    },
    replay: {
      har: createHar([createEntry(TARGET_URL, 200, "document")]),
      page: createPage(TARGET_URL, { expectTextMatched: true })
    },
    sourceState: {
      cookies: [{
        name: "private-cookie-name",
        value: "private-cookie-value",
        domain: "sso.example.net",
        path: "/login",
        secure: true
      }],
      origins: [{
        origin: "https://sso.example.net",
        localStorage: [{ name: "private-storage-name", value: "private-storage-value" }]
      }]
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE,
    sourceProfile: "Work Profile",
    expectUrl: "https://app.example.com/account*",
    expectText: "Account"
  });
  const output = JSON.stringify(result);

  assert.deepEqual(fixture.profileValues, ["Work Profile"]);
  assert.deepEqual(result.candidates[0]?.sourceState, { cookies: 1, origins: 1 });
  assert.equal(result.candidates[0]?.sourceStateAvailable, true);
  assert.equal(result.candidates[0]?.verified, true);
  assert.deepEqual(result.verification, {
    attempted: 1,
    succeeded: true,
    minimalIncludeUrls: ["https://sso.example.net/login"]
  });
  assert.deepEqual(fixture.replayStateModes, [0o600]);
  for (const secret of [
    "private-cookie-name",
    "private-cookie-value",
    "private-storage-name",
    "private-storage-value"
  ]) {
    assert.doesNotMatch(output, new RegExp(secret));
  }
  assert.equal(fixture.temporaryPaths.length > 0, true);
  assert.equal(fixture.temporaryPaths.every((path) => !existsSync(path)), true);
});

test("without --source-profile diagnosis never selects or opens a Profile", async () => {
  const loginUrl = "https://sso.example.net/login";
  const fixture = createDiagnosisRunner({
    initial: {
      har: createHar([
        createEntry(TARGET_URL, 302, "document", { location: loginUrl })
      ]),
      page: createPage(loginUrl, { authText: true })
    }
  });

  const result = await diagnoseMissingStateSources(fixture.runner, {
    url: TARGET_URL,
    statePath: FAILED_STATE
  });

  assert.equal(result.candidates[0]?.verified, undefined);
  assert.equal(result.candidates[0]?.sourceStateAvailable, undefined);
  assert.deepEqual(fixture.profileValues, []);
  assert.equal(fixture.calls.some((call) => call.args.includes("profiles")), false);
  assert.equal(fixture.calls[0]?.options?.ignoreConfiguredProfile, true);
});

test("candidate URL sanitization preserves origin, port, and cookie path", () => {
  assert.equal(
    sanitizeStateDiagnosisUrl(
      "https://user:pass@sso.example.net:8443/login/deep;jsessionid=secret?code=secret#fragment"
    ),
    "https://sso.example.net:8443/login/deep"
  );
});

function createDiagnosisRunner(options: {
  initial: Scenario;
  replay?: Scenario;
  sourceState?: unknown;
}): DiagnosisRunnerResult {
  const calls: Array<{ args: string[]; options?: BrowserRunOptions }> = [];
  const modes = new Map<string, "initial" | "replay" | "source">();
  const profileValues: string[] = [];
  const temporaryPaths: string[] = [];
  const replayStateModes: number[] = [];
  const runner: BrowserRunner = {
    run: async (args, runOptions = {}) => {
      calls.push({ args: [...args], options: { ...runOptions } });
      const session = runOptions.session ?? "default";
      if (args[0] === "--state" && args[2] === "open") {
        const statePath = args[1] ?? "";
        const mode = statePath.includes("failed-state") ? "initial" : "replay";
        modes.set(session, mode);
        if (mode === "replay") {
          temporaryPaths.push(statePath);
          replayStateModes.push(statSync(statePath).mode & 0o777);
        }
        return ok();
      }
      if (args[0] === "--profile" && args[2] === "open") {
        modes.set(session, "source");
        profileValues.push(args[1] ?? "");
        return ok();
      }
      if (args[0] === "state" && args[1] === "save") {
        const path = args[2] ?? "";
        temporaryPaths.push(path);
        writeFileSync(path, JSON.stringify(options.sourceState ?? {
          cookies: [],
          origins: []
        }));
        return ok();
      }

      const mode = modes.get(session) ?? "initial";
      const scenario = mode === "replay" ? options.replay ?? options.initial : options.initial;
      if (args[0] === "goto") return scenario.goto ?? ok();
      if (args[0] === "eval") {
        return scenario.pageUnavailable === true
          ? fail("no page context")
          : { exitCode: 0, stdout: `${JSON.stringify(scenario.page ?? createPage(TARGET_URL))}\n`, stderr: "" };
      }
      if (args[0] === "get" && args[1] === "url") {
        return scenario.pageUnavailable === true
          ? fail("no page context")
          : { exitCode: 0, stdout: `${JSON.stringify({ url: scenario.page?.url ?? TARGET_URL })}\n`, stderr: "" };
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
  return {
    runner,
    calls,
    profileValues,
    temporaryPaths,
    replayStateModes
  };
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
