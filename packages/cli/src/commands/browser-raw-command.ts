import type { BrowserRunOptions, BrowserRunner } from "../features/browser/types.js";

export async function runBrowserRawCommand(
  args: readonly string[],
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const result = await browserRunner.run([...args], createRawRunOptions(args));
  stdout.write(result.stdout);
  stderr.write(result.stderr);
  return result.exitCode;
}

function createRawRunOptions(args: readonly string[]): BrowserRunOptions {
  if (!args.some((arg) => ["--help", "-h", "--version", "-V"].includes(arg))) {
    return {};
  }
  return {
    disableDefaultProfile: true,
    disableRestore: true,
    ignoreConfiguredProfile: true,
    ignoreConfiguredState: true
  };
}
