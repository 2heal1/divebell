import assert from "node:assert/strict";
import { test } from "@rstest/core";

import {
  createOpenRuntime,
  getOpenRuntimeFromWindow,
  installOpenRuntimeOnWindow,
  type OpenRuntimeWindowHost
} from "../../dist/index.js";
import { createClock } from "../helpers/runtime.ts";

test("installs and reads the window API host", () => {
  const host: OpenRuntimeWindowHost = {};
  const runtime = createOpenRuntime({ clock: createClock() });

  installOpenRuntimeOnWindow(runtime, host);

  assert.equal(getOpenRuntimeFromWindow(host), runtime);
  assert.equal(host.__OPEN_RUNTIME__, runtime);
});
