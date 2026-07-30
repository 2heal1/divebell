import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import vm from "node:vm";

import { createDivebellCli } from "@divebell/cli";
import extension, {
  createMfExtension
} from "../dist/extension.js";

test("detects a running Module Federation instance and returns the MF command", async () => {
  const result = await runDetection(extension, {
    __FEDERATION__: {
      __INSTANCES__: [{ name: "host" }]
    }
  });

  assert.deepEqual(result, {
    id: "module-federation",
    name: "Module Federation",
    evidence: ["globalThis.__FEDERATION__.__INSTANCES__"],
    command: "mf"
  });
});

test("does not report MF when debug support exists without a runtime instance", async () => {
  const result = await runDetection(extension, {
    __FEDERATION__: {
      __DEBUG_CONSTRUCTOR__: function ModuleFederation() {},
      __INSTANCES__: []
    }
  });

  assert.equal(result, undefined);
});

test("detects the legacy MF global and keeps a branded command name", async () => {
  const branded = createMfExtension({
    name: "federation-tools",
    commandName: "federation"
  });
  const result = await runDetection(branded, {
    __VMOK__: {
      __INSTANCES__: [{ name: "legacy-host" }]
    }
  });

  assert.equal(result?.evidence[0], "globalThis.__VMOK__.__INSTANCES__");
  assert.equal(result?.command, "federation");
});

test("Divebell stack returns the MF Extension and command and caches the result", async () => {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-mf-stack-"));
  const cli = createDivebellCli({ extensions: [extension] });
  let detectorCalls = 0;
  const browserRunner = {
    async run(args) {
      if (args[0] === "open") {
        return { exitCode: 0, stdout: "", stderr: "" };
      }
      if (args[0] === "eval" && args[1] === "globalThis.location.href") {
        return {
          exitCode: 0,
          stdout: JSON.stringify("https://app.test/"),
          stderr: ""
        };
      }
      if (args[0] === "eval" && args[1]?.includes("__INSTANCES__")) {
        detectorCalls += 1;
        return {
          exitCode: 0,
          stdout: JSON.stringify("globalThis.__FEDERATION__.__INSTANCES__"),
          stderr: ""
        };
      }
      throw new Error(`Unexpected browser command: ${args.join(" ")}`);
    }
  };

  try {
    const openOutput = createOutput();
    assert.equal(await cli.run([
      "open",
      "https://app.test",
      "--no-bridge"
    ], {
      ...openOutput,
      operationLogDirectory,
      browserRunner
    }), 0);

    const stackOutput = createOutput();
    assert.equal(await cli.run(["stack"], {
      ...stackOutput,
      operationLogDirectory,
      browserRunner
    }), 0);
    const result = JSON.parse(stackOutput.text());
    assert.equal(result.data.cached, false);
    assert.deepEqual(result.data.detections[0], {
      id: "module-federation",
      name: "Module Federation",
      evidence: ["globalThis.__FEDERATION__.__INSTANCES__"],
      command: "mf",
      extension: "mf"
    });

    const cachedOutput = createOutput();
    assert.equal(await cli.run(["stack"], {
      ...cachedOutput,
      operationLogDirectory,
      browserRunner
    }), 0);
    assert.equal(JSON.parse(cachedOutput.text()).data.cached, true);
    assert.equal(detectorCalls, 1);
  } finally {
    rmSync(operationLogDirectory, { recursive: true, force: true });
  }
});

async function runDetection(extensionDefinition, globals) {
  const detectStack = extensionDefinition.hooks?.detectStack;
  assert.equal(typeof detectStack, "function");
  const context = vm.createContext({ ...globals });
  context.globalThis = context;
  return await detectStack({
    divebell: {
      browser: {
        async eval(script) {
          return vm.runInContext(script, context);
        }
      }
    }
  });
}

function createOutput() {
  let stdout = "";
  let stderr = "";
  return {
    stdout: { write(chunk) { stdout += chunk; } },
    stderr: { write(chunk) { stderr += chunk; } },
    text: () => stdout,
    errorText: () => stderr
  };
}
