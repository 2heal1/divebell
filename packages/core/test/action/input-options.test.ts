import assert from "node:assert/strict";
import { test } from "@rstest/core";

import { createDivebell } from "../../dist/index.js";
import { createClock } from "../helpers/runtime.ts";

test("returns async input options from registered actions", async () => {
  const runtime = createDivebell({ clock: createClock() });

  runtime.registerAction({
    name: "region.select",
    inputSchema: {
      type: "object",
      properties: {
        province: { type: "string" }
      }
    },
    getInputOptions: async (inputName) => {
      assert.equal(inputName, "province");
      return [{ value: "zhejiang", description: "Zhejiang" }];
    },
    handler: () => undefined
  });

  assert.deepEqual(await runtime.getInputOptions("region.select", "province"), [
    { value: "zhejiang", description: "Zhejiang" }
  ]);
  assert.deepEqual(await runtime.getInputOptions("region.select", "city"), []);
});

test("fails input option reads when the provider times out", async () => {
  const runtime = createDivebell({ clock: createClock() });

  runtime.registerAction({
    name: "region.slow-select",
    inputSchema: {
      type: "object",
      properties: {
        province: { type: "string" }
      }
    },
    getInputOptions: () => new Promise(() => undefined),
    handler: () => undefined
  });

  await assert.rejects(
    runtime.getInputOptions("region.slow-select", "province", undefined, { timeout: 1 }),
    /Timed out while reading input options/
  );
});

