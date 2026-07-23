import assert from "node:assert/strict";
import { test } from "node:test";

import extension from "../dist/extension.js";
import { createOpenRuntimeCli } from "../../cli/dist/index.js";

const cli = createOpenRuntimeCli({ extensions: [extension] });
const runCli = cli.run;

function createOutput() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write: (chunk) => { stdout += chunk; } },
    stderr: { write: (chunk) => { stderr += chunk; } },
    text: () => stdout,
    errorText: () => stderr
  };
}

function jsonResponse(body) {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function createBrowserRunner(run) {
  return { run };
}

function commandData(output) {
  return JSON.parse(output.text()).data;
}

test("verify passes only when a business target reaches the expected status", async () => {
  const output = createOutput();
  const browserCalls = [];
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "business:orders:risk-panel",
    "ready",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "business:orders:risk-panel",
            status: "ready"
          },
          target: {
            id: "business:orders:risk-panel",
            type: "business.component",
            status: "ready",
            source: "orders",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "business:orders:risk-panel": {
                id: "business:orders:risk-panel",
                type: "business.component",
                status: "ready",
                source: "orders",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([
        {
          id: "business:orders:risk-panel",
          type: "business.component",
          source: "orders",
          statuses: ["pending", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      throw new Error("verify should not run a page visibility check when business evidence exists");
    })
  });

  const parsed = commandData(output);
  assert.equal(exitCode, 0);
  assert.equal(parsed.result.success, true);
  assert.equal(parsed.result.evidence.level, "business");
  assert.equal(parsed.result.evidence.businessVerified, true);
  assert.equal(parsed.result.visibility.checked, false);
  assert.deepEqual(browserCalls, []);
});

test("verify matches localhost and IPv4 loopback runtime URLs", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://localhost:3000/orders",
    "business:orders:risk-panel",
    "ready",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-loopback",
              url: "http://127.0.0.1:3000/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-loopback/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "business:orders:risk-panel",
            status: "ready"
          },
          target: {
            id: "business:orders:risk-panel",
            type: "business.component",
            status: "ready",
            source: "orders",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "business:orders:risk-panel": {
                id: "business:orders:risk-panel",
                type: "business.component",
                status: "ready",
                source: "orders",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-loopback/targets");
      return jsonResponse([
        {
          id: "business:orders:risk-panel",
          type: "business.component",
          source: "orders",
          statuses: ["pending", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    }
  });

  const parsed = commandData(output);
  assert.equal(exitCode, 0);
  assert.equal(parsed.runtime.runtimeId, "runtime-loopback");
  assert.equal(parsed.result.evidence.businessVerified, true);
});

test("verify does not treat a ready Modern route as business success when the page is blank", async () => {
  const output = createOutput();
  const browserCalls = [];
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "modern:route",
            status: "ready"
          },
          target: {
            id: "modern:route",
            type: "modern.route",
            status: "ready",
            source: "modern",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "modern:route": {
                id: "modern:route",
                type: "modern.route",
                status: "ready",
                source: "modern",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([
        {
          id: "modern:route",
          type: "modern.route",
          source: "modern",
          statuses: ["loading", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      assert.equal(args[0], "eval");
      return {
        exitCode: 0,
        stdout: JSON.stringify({
          blank: true,
          url: "http://app.test/orders",
          title: "",
          textLength: 0,
          visibleElementCount: 0,
          bodyChildElementCount: 0,
          rootChildElementCount: 0
        }),
        stderr: ""
      };
    })
  });

  const parsed = commandData(output);
  assert.equal(exitCode, 1);
  assert.equal(parsed.result.success, false);
  assert.equal(parsed.result.evidence.level, "runtime");
  assert.equal(parsed.result.evidence.targetClass, "modern");
  assert.equal(parsed.result.evidence.businessVerified, false);
  assert.equal(parsed.result.visibility.status, "blank");
  assert.match(parsed.result.evidence.nextStep, /blank page/);
  assert.equal(browserCalls.length, 1);
});

test("verify reports MF readiness as runtime-layer evidence when no business target exists", async () => {
  const output = createOutput();
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "mf:remote:orders:expose:RiskPanel",
    "ready",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "mf:remote:orders:expose:RiskPanel",
            status: "ready"
          },
          target: {
            id: "mf:remote:orders:expose:RiskPanel",
            type: "mf.remote.expose",
            status: "ready",
            source: "module-federation",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "mf:remote:orders:expose:RiskPanel": {
                id: "mf:remote:orders:expose:RiskPanel",
                type: "mf.remote.expose",
                status: "ready",
                source: "module-federation",
                updatedAt: 10
              }
            },
            latestEventId: 1,
            capturedAt: 10
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([
        {
          id: "mf:remote:orders:expose:RiskPanel",
          type: "mf.remote.expose",
          source: "module-federation",
          statuses: ["pending", "ready", "error"],
          registeredAt: 1,
          updatedAt: 10
        }
      ]);
    },
    browserRunner: createBrowserRunner(async () => ({
      exitCode: 0,
      stdout: JSON.stringify({
        blank: false,
        url: "http://app.test/orders",
        title: "Orders",
        textLength: 24,
        visibleElementCount: 4,
        bodyChildElementCount: 1,
        rootChildElementCount: 1
      }),
      stderr: ""
    }))
  });

  const parsed = commandData(output);
  assert.equal(exitCode, 1);
  assert.equal(parsed.result.success, false);
  assert.equal(parsed.result.evidence.level, "runtime");
  assert.equal(parsed.result.evidence.targetClass, "module-federation");
  assert.equal(parsed.result.evidence.businessVerified, false);
  assert.equal(parsed.result.visibility.status, "visible");
  assert.match(parsed.result.evidence.nextStep, /business target/);
});

test("verify suggests an existing business target instead of running a blank-page fallback", async () => {
  const output = createOutput();
  const browserCalls = [];
  const exitCode = await runCli([
    "verify",
    "--bridge",
    "http://bridge.test",
    "--url",
    "http://app.test/orders",
    "modern:route",
    "ready",
    "--timeout",
    "20"
  ], {
    stdout: output.stdout,
    stderr: output.stderr,
    fetcher: async (url) => {
      if (String(url) === "http://bridge.test/runtimes") {
        return jsonResponse({
          runtimes: [
            {
              runtimeId: "runtime-1",
              url: "http://app.test/orders",
              status: "connected",
              connectedAt: 1,
              lastSeenAt: 2
            }
          ]
        });
      }

      if (String(url) === "http://bridge.test/runtimes/runtime-1/wait-for") {
        return jsonResponse({
          success: true,
          condition: {
            id: "modern:route",
            status: "ready"
          },
          target: {
            id: "modern:route",
            type: "modern.route",
            status: "ready",
            source: "modern",
            updatedAt: 10
          },
          snapshot: {
            targets: {
              "modern:route": {
                id: "modern:route",
                type: "modern.route",
                status: "ready",
                source: "modern",
                updatedAt: 10
              },
              "business:orders:risk-panel": {
                id: "business:orders:risk-panel",
                type: "business.component",
                status: "ready",
                source: "orders",
                updatedAt: 11
              }
            },
            latestEventId: 2,
            capturedAt: 11
          }
        });
      }

      assert.equal(String(url), "http://bridge.test/runtimes/runtime-1/targets");
      return jsonResponse([]);
    },
    browserRunner: createBrowserRunner(async (args) => {
      browserCalls.push(args);
      throw new Error("verify should not run visibility when business target hints exist");
    })
  });

  const parsed = commandData(output);
  assert.equal(exitCode, 1);
  assert.equal(parsed.result.success, false);
  assert.deepEqual(parsed.result.evidence.businessTargetHints, ["business:orders:risk-panel"]);
  assert.match(parsed.result.evidence.nextStep, /business:orders:risk-panel/);
  assert.equal(parsed.result.visibility.checked, false);
  assert.deepEqual(browserCalls, []);
});
