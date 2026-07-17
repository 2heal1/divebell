import type { BrowserRunOptions, BrowserRunner } from "./runner.js";
export async function runBrowserAndPipe(
  browserRunner: BrowserRunner,
  browserArgs: string[],
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  options?: BrowserRunOptions
): Promise<number> {
  const result = await browserRunner.run(browserArgs, options);
  if (result.stdout.length > 0) {
    stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
  }
  if (result.stderr.length > 0) {
    stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
}

