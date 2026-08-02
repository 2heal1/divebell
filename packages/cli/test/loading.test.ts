import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "@rstest/core";

import { createDivebellCli } from "../dist/index.js";
import {
  createLoadingController
} from "../dist/features/loading.js";

const TEST_FRAME_INTERVAL_MS = 5;

test("shows command loading animation immediately", async () => {
  const output = createLoadingOutput(true);
  const loading = createLoadingController(output.writer, {
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });
  const deferred = createDeferred<string>();
  const result = loading.withLoading(async () => await deferred.promise);

  assert.match(output.text(), /^\r[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

  deferred.resolve("done");
  assert.equal(await result, "done");
});

test("animates command work and clears the line after success", async () => {
  const output = createLoadingOutput(true);
  const loading = createLoadingController(output.writer, {
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });
  const deferred = createDeferred<string>();
  const result = loading.withLoading(async () => await deferred.promise);

  await wait(TEST_FRAME_INTERVAL_MS + 10);
  assert.match(output.text(), /\r[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/);

  deferred.resolve("done");
  assert.equal(await result, "done");
  assert.match(output.text(), /\r\u001B\[2K$/);
});

test("clears command loading animation when work fails", async () => {
  const output = createLoadingOutput(true);
  const loading = createLoadingController(output.writer, {
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });
  const deferred = createDeferred<never>();
  const result = loading.withLoading(async () => await deferred.promise);

  deferred.reject(new Error("failed"));

  await assert.rejects(result, /failed/);
  assert.match(output.text(), /\r\u001B\[2K$/);
});

test("keeps non-interactive command output free of loading animation", async () => {
  const output = createLoadingOutput(false);
  const loading = createLoadingController(output.writer, {
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });

  await loading.withLoading(async () => {
    await wait(TEST_FRAME_INTERVAL_MS + 10);
  });

  assert.equal(output.text(), "");
});

test("shares one animation across nested command loading wrappers", async () => {
  const output = createLoadingOutput(true);
  const loading = createLoadingController(output.writer, {
    frameIntervalMs: TEST_FRAME_INTERVAL_MS
  });
  const inner = createDeferred<void>();
  const outer = loading.withLoading(async () =>
    await loading.withLoading(async () => await inner.promise)
  );

  inner.resolve();
  await outer;

  assert.equal(output.text().match(/\u001B\[2K/g)?.length, 1);
});

test("clears loading before a command writes output", async () => {
  const output = createLoadingOutput(true);
  const loading = createLoadingController(output.writer);

  await loading.withLoading(async () => {
    loading.clear();
    output.writer.write("result\n");
  });

  assert.match(output.text(), /^\r[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\r\u001B\[2Kresult\n$/);
});

test("shows loading by default for built-in CLI commands", async () => {
  const extensionsDirectory = mkdtempSync(join(tmpdir(), "divebell-loading-extensions-"));
  const output = createInteractiveCliOutput();
  try {
    assert.equal(await createDivebellCli().run(["extensions", "list"], {
      stdout: output.stdout,
      stderr: output.stderr,
      extensionsDirectory
    }), 0);

    assertDefaultLoadingBeforeOutput(output.events);
  } finally {
    rmSync(extensionsDirectory, { recursive: true, force: true });
  }
});

test("shows the same default loading for Extension commands", async () => {
  const output = createInteractiveCliOutput();
  const cli = createDivebellCli({
    extensions: [{
      schemaVersion: 1,
      name: "loading-demo",
      commands: [{
        name: "loading-demo",
        run: async () => ({ done: true })
      }]
    }]
  });

  assert.equal(await cli.run(["loading-demo"], {
    stdout: output.stdout,
    stderr: output.stderr
  }), 0);

  assertDefaultLoadingBeforeOutput(output.events);
});

test("clears default loading before command errors", async () => {
  const output = createInteractiveCliOutput();

  assert.equal(await createDivebellCli().run(["missing-command"], {
    stdout: output.stdout,
    stderr: output.stderr
  }), 1);

  assertDefaultLoadingBeforeOutput(output.events);
});

test("does not show loading for help or version output", async () => {
  for (const argv of [["--help"], ["--version"]]) {
    const output = createInteractiveCliOutput();
    assert.equal(await createDivebellCli().run(argv, {
      stdout: output.stdout,
      stderr: output.stderr
    }), 0);
    assert.equal(output.events.some((event) => event.startsWith("stderr:")), false);
  }
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

function assertDefaultLoadingBeforeOutput(events: string[]): void {
  assert.match(events[0] ?? "", /^stderr:\r[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]$/);
  const clearIndex = events.indexOf("stderr:\r\u001B[2K");
  const outputIndex = events.findIndex((event) => event.startsWith("stdout:"));
  assert.ok(clearIndex > 0);
  assert.ok(outputIndex > clearIndex);
  assert.match(events[outputIndex] ?? "", /^stdout:\{/);
}

function createInteractiveCliOutput(): {
  stdout: { write(chunk: string): void };
  stderr: { isTTY: true; write(chunk: string): void };
  events: string[];
} {
  const events: string[] = [];
  return {
    stdout: {
      write(chunk) {
        events.push(`stdout:${chunk}`);
      }
    },
    stderr: {
      isTTY: true,
      write(chunk) {
        events.push(`stderr:${chunk}`);
      }
    },
    events
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
