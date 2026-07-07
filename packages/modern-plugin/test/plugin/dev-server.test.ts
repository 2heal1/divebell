import assert from "node:assert/strict";
import { test } from "@rstest/core";
import { createOpenRuntime } from "@openruntime/core";

import { openRuntimeModernPlugin } from "../../dist/index.js";
import { createModernCliApiHarness } from "../helpers/modern-api.js";

test("tracks Modern.js dev server startup and successful compile", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernCliApiHarness(openRuntimeModernPlugin({ runtime }));

  handlers.onBeforeDev?.();
  assert.equal(runtime.getSnapshot().targets["modern:dev-server"]?.status, "starting");

  handlers.onAfterCreateCompiler?.({
    environments: {
      web: {},
      server: {}
    }
  });
  assert.equal(runtime.getSnapshot().targets["modern:dev-server"]?.status, "compiling");

  handlers.onAfterDev?.({ port: 19081 });
  assert.equal(runtime.getSnapshot().targets["modern:dev-server"]?.status, "running");

  handlers.onDevCompileDone?.({
    isFirstCompile: true,
    stats: createStats({
      name: "web",
      errorsCount: 0,
      warningsCount: 1
    }),
    environments: {
      web: {}
    }
  });

  const target = runtime.getSnapshot().targets["modern:dev-server"];
  assert.equal(target?.status, "compiled");
  assert.equal(target?.error, undefined);
  assert.deepEqual(target?.data, {
    server: {
      started: true,
      port: 19081
    },
    compile: {
      done: true,
      count: 1,
      success: true,
      isFirstCompile: true,
      name: "web",
      errorsCount: 0,
      warningsCount: 1,
      environments: ["web"]
    }
  });
});

test("marks Modern.js dev compile errors without being overwritten by server startup", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernCliApiHarness(openRuntimeModernPlugin({ runtime }));

  handlers.onBeforeDev?.();
  handlers.onDevCompileDone?.({
    isFirstCompile: true,
    stats: createStats({
      name: "web",
      errorsCount: 1,
      warningsCount: 0,
      errors: [
        {
          message: "Cannot find module ./missing"
        }
      ]
    })
  });

  assert.equal(runtime.getSnapshot().targets["modern:dev-server"]?.status, "error");
  assert.equal(runtime.getSnapshot().targets["modern:dev-server"]?.error?.message, "Cannot find module ./missing");

  handlers.onAfterDev?.({ port: 19081 });

  const target = runtime.getSnapshot().targets["modern:dev-server"];
  assert.equal(target?.status, "error");
  assert.equal(target?.error?.message, "Cannot find module ./missing");
  assert.deepEqual(target?.data, {
    server: {
      started: true,
      port: 19081
    },
    compile: {
      done: true,
      count: 1,
      success: false,
      isFirstCompile: true,
      name: "web",
      errorsCount: 1,
      warningsCount: 0
    }
  });
});

test("returns Modern.js dev server to compiling after watched file changes", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernCliApiHarness(openRuntimeModernPlugin({ runtime }));

  handlers.onAfterDev?.({ port: 19081 });
  handlers.onDevCompileDone?.({
    stats: createStats({
      errorsCount: 0,
      warningsCount: 0
    })
  });
  handlers.onFileChanged?.({
    filename: "/app/src/routes/page.tsx",
    eventType: "change",
    isPrivate: false
  });

  const target = runtime.getSnapshot().targets["modern:dev-server"];
  assert.equal(target?.status, "compiling");
  assert.deepEqual(target?.data, {
    server: {
      started: true,
      port: 19081
    },
    compile: {
      done: false,
      count: 1
    },
    change: {
      filename: "/app/src/routes/page.tsx",
      eventType: "change",
      isPrivate: false
    }
  });
});

test("can disable Modern.js dev server target registration", () => {
  const runtime = createOpenRuntime();
  const { handlers } = createModernCliApiHarness(openRuntimeModernPlugin({
    runtime,
    devServer: false
  }));

  handlers.onBeforeDev?.();

  assert.equal(runtime.getTargets({ id: "modern:dev-server" }).length, 0);
  assert.equal(runtime.getSnapshot().targets["modern:dev-server"], undefined);
});

function createStats(json: Record<string, unknown>): {
  hasErrors(): boolean;
  toJson(): Record<string, unknown>;
} {
  return {
    hasErrors() {
      return typeof json.errorsCount === "number" && json.errorsCount > 0;
    },
    toJson() {
      return json;
    }
  };
}
