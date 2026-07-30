import assert from "node:assert/strict";
import { test } from "@rstest/core";

import {
  createExtensionLoadingFunction,
  EXTENSION_LOADING_DELAY_MS
} from "../dist/features/extension/loading.js";

const TEST_DELAY_MS = 20;
const TEST_FRAME_INTERVAL_MS = 5;

test("waits 400ms before showing Extension loading animation", async () => {
  assert.equal(EXTENSION_LOADING_DELAY_MS, 400);
  const output = createLoadingOutput(true);
  const withLoading = createExtensionLoadingFunction(output.writer, {
    delayMs: TEST_DELAY_MS,
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });

  assert.equal(await withLoading(async () => "done"), "done");
  await wait(TEST_DELAY_MS + 10);

  assert.equal(output.text(), "");
});

test("animates slow Extension work and clears the line after success", async () => {
  const output = createLoadingOutput(true);
  const withLoading = createExtensionLoadingFunction(output.writer, {
    delayMs: TEST_DELAY_MS,
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });
  const deferred = createDeferred<string>();
  const result = withLoading(async () => await deferred.promise);

  await wait(TEST_DELAY_MS + TEST_FRAME_INTERVAL_MS + 10);
  assert.match(output.text(), /\r[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

  deferred.resolve("done");
  assert.equal(await result, "done");
  assert.match(output.text(), /\r\u001B\[2K$/);
});

test("clears Extension loading animation when work fails", async () => {
  const output = createLoadingOutput(true);
  const withLoading = createExtensionLoadingFunction(output.writer, {
    delayMs: TEST_DELAY_MS,
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });
  const deferred = createDeferred<never>();
  const result = withLoading(async () => await deferred.promise);

  await wait(TEST_DELAY_MS + 10);
  deferred.reject(new Error("failed"));

  await assert.rejects(result, /failed/);
  assert.match(output.text(), /\r\u001B\[2K$/);
});

test("keeps non-interactive Extension output free of loading animation", async () => {
  const output = createLoadingOutput(false);
  const withLoading = createExtensionLoadingFunction(output.writer, {
    delayMs: TEST_DELAY_MS,
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });

  await withLoading(async () => {
    await wait(TEST_DELAY_MS + 10);
  });

  assert.equal(output.text(), "");
});

test("shares one animation across nested Extension loading wrappers", async () => {
  const output = createLoadingOutput(true);
  const withLoading = createExtensionLoadingFunction(output.writer, {
    delayMs: TEST_DELAY_MS,
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });
  const inner = createDeferred<void>();
  const outer = withLoading(async () =>
    await withLoading(async () => await inner.promise)
  );

  await wait(TEST_DELAY_MS + 10);
  inner.resolve();
  await outer;

  assert.equal(output.text().match(/\u001B\[2K/g)?.length, 1);
});

function createLoadingOutput(isTTY: boolean): {
  writer: {
    isTTY: boolean;
    write(chunk: string): void;
  };
  text(): string;
} {
  let output = "";
  return {
    writer: {
      isTTY,
      write(chunk) {
        output += chunk;
      }
    },
    text: () => output
  };
}

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve(value: T): void;
  reject(error: Error): void;
} {
  let resolvePromise: ((value: T) => void) | undefined;
  let rejectPromise: ((error: Error) => void) | undefined;
  const promise = new Promise<T>((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });
  return {
    promise,
    resolve(value) {
      resolvePromise?.(value);
    },
    reject(error) {
      rejectPromise?.(error);
    }
  };
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}
