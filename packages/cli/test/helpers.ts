import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { BrowserRunOptions, BrowserRunner } from "../dist/features/browser/runner.js";
import { createOperationLogKey } from "../dist/utils/operation-log.js";

process.env.DIVEBELL_DISABLE_EXTENSIONS = "1";

export function createOutput(): {
  stdout: { write(chunk: string): void };
  stderr: { write(chunk: string): void };
  text(): string;
  errorText(): string;
} {
  let stdout = "";
  let stderr = "";
  return {
    stdout: {
      write: (chunk) => {
        stdout += chunk;
      }
    },
    stderr: {
      write: (chunk) => {
        stderr += chunk;
      }
    },
    text: () => stdout,
    errorText: () => stderr
  };
}

export function commandOutput(command: string, data: unknown, message: string | undefined = undefined): unknown {
  return {
    status: "ok",
    ...(message === undefined ? {} : { message }),
    data,
    meta: {
      version: 1,
      command
    }
  };
}

export function assertOpenOutput(
  text: string,
  expected: {
    command: string;
    url: string;
    openedUrl: string;
    normalizedUrl: string;
    bridgeUrl: string | null;
    bridgePort: number | null;
    sessionId: string;
  }
): void {
  const parsed = JSON.parse(text);
  assert.equal(parsed.status, "ok");
  assert.equal(parsed.message, "Page opened.");
  assert.deepEqual(parsed.meta, {
    version: 1,
    command: expected.command
  });
  assert.equal(parsed.data.url, expected.url);
  assert.equal(parsed.data.openedUrl, expected.openedUrl);
  assert.equal(parsed.data.normalizedUrl, expected.normalizedUrl);
  assert.equal(parsed.data.bridgeUrl, expected.bridgeUrl);
  assert.equal(parsed.data.bridgePort, expected.bridgePort);
  assert.equal(parsed.data.sessionId, expected.sessionId);
  assert.equal(typeof parsed.data.openedAt, "number");
}

export function errorOutput(
  command: string,
  error: {
    code: string;
    kind: string;
    message: string;
    retryable: boolean;
    hint?: string;
    details?: Record<string, unknown>;
  }
): unknown {
  return {
    status: "error",
    message: error.message,
    error: {
      code: error.code,
      kind: error.kind,
      retryable: error.retryable,
      ...(error.hint === undefined ? {} : { hint: error.hint }),
      ...(error.details === undefined ? {} : { details: error.details })
    },
    meta: {
      version: 1,
      command
    }
  };
}

export function createOpenContextFixture(overrides: Partial<{
  url: string;
  normalizedUrl: string;
  bridgeUrl: string | null;
  bridgePort: number | null;
  sessionId: string | null;
  activeExtensions: string[];
  browserRestoreDisabled: boolean;
  browserDefaultProfileDisabled: boolean;
  browserDefaultProfile: string;
  browserRestoreOptions: Record<string, string[]>;
}> = {}): { operationLogDirectory: string; cleanup(): void } {
  const operationLogDirectory = mkdtempSync(join(tmpdir(), "divebell-cli-operations-"));
  const key = createOperationLogKey(process.cwd());
  const entry = {
    schemaVersion: 4,
    command: "open",
    key,
    cwd: process.cwd(),
    url: overrides.url ?? "http://app.test/",
    normalizedUrl: overrides.normalizedUrl ?? "http://app.test/",
    bridgeUrl: overrides.bridgeUrl ?? "http://bridge.test",
    bridgePort: overrides.bridgePort ?? null,
    sessionId: overrides.sessionId ?? "session-open",
    openedAt: 1,
    exitCode: 0,
    activeExtensions: overrides.activeExtensions ?? [],
    browserRestoreDisabled: overrides.browserRestoreDisabled ?? false,
    browserDefaultProfileDisabled: overrides.browserDefaultProfileDisabled ?? false,
    ...(overrides.browserDefaultProfile === undefined
      ? {}
      : { browserDefaultProfile: overrides.browserDefaultProfile }),
    browserRestoreOptions: overrides.browserRestoreOptions ?? {}
  };
  writeFileSync(join(operationLogDirectory, `${key}.json`), `${JSON.stringify(entry, null, 2)}\n`, "utf8");
  return {
    operationLogDirectory,
    cleanup: () => {
      rmSync(operationLogDirectory, {
        recursive: true,
        force: true
      });
    }
  };
}

export function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      "content-type": "application/json"
    }
  });
}

export function createBrowserRunner(
  run: (args: string[], options?: BrowserRunOptions) => Promise<{
    exitCode: number;
    stdout: string;
    stderr: string;
  }>
): BrowserRunner {
  return {
    run
  };
}
