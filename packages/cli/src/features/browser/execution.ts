import { createWaitEvalScript, parseBrowserJsonOutput, type BrowserRunner } from "./runner.js";
import { sleep } from "../../utils/command.js";
export async function runBrowserOrThrow(browserRunner: BrowserRunner, browserArgs: string[]): Promise<void> {
  const result = await browserRunner.run(browserArgs);
  if (result.exitCode !== 0) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `Browser command ${browserArgs[0]} failed.`);
  }
}

export async function waitForBrowserEval(
  browserRunner: BrowserRunner,
  script: string,
  timeout: number | undefined
): Promise<{
  success: boolean;
  condition: { script: string };
  value?: unknown;
  reason?: string;
}> {
  const deadline = Date.now() + (timeout ?? 5000);
  let lastValue: unknown;
  let lastError: string | undefined;

  while (Date.now() <= deadline) {
    const result = await browserRunner.run(["eval", createWaitEvalScript(script)]);
    if (result.exitCode === 0) {
      try {
        lastValue = parseBrowserJsonOutput(result.stdout);
        if (lastValue === true) {
          return {
            success: true,
            condition: { script },
            value: lastValue
          };
        }
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
      }
    } else {
      lastError = result.stderr.trim() || result.stdout.trim();
    }
    await sleep(100);
  }

  const failure: {
    success: boolean;
    condition: { script: string };
    value?: unknown;
    reason?: string;
  } = {
    success: false,
    condition: { script }
  };
  if (lastValue !== undefined) {
    failure.value = lastValue;
  }
  failure.reason = lastError === undefined
    ? "Condition did not become true before timeout."
    : `Condition did not become true before timeout. Last error: ${lastError}`;
  return failure;
}
