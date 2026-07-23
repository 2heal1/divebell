import type { ParsedCliArgs } from "../utils/args.js";
import type { BrowserRunner } from "../features/browser/runner.js";
import { runBrowserAndPipe } from "../features/browser/io.js";
import { saveUrlScopedBrowserState } from "../features/browser/state.js";
import { getOptionValue } from "../utils/args.js";

const AGENT_BROWSER_BOOLEAN_OPTIONS = new Set([
  "all",
  "password-stdin"
]);

export async function runAgentBrowserProfilesCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  return await runBrowserAndPipe(
    browserRunner,
    createAgentBrowserArgs(args),
    stdout,
    stderr
  );
}

export async function runAgentBrowserStateCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const url = getOptionValue(args, "url");
  if (args.command[1] === "save" && url !== undefined) {
    const outputPath = args.command[2];
    const result = await saveUrlScopedBrowserState(browserRunner, {
      url,
      ...(outputPath === undefined ? {} : { outputPath })
    });
    stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return 0;
  }
  return await runBrowserAndPipe(
    browserRunner,
    createAgentBrowserArgs(args),
    stdout,
    stderr
  );
}

export async function runAgentBrowserAuthCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  stdin: AsyncIterable<string | Uint8Array>,
  browserRunner: BrowserRunner
): Promise<number> {
  const input = args.options.has("password-stdin")
    ? await readInput(stdin)
    : undefined;
  return await runBrowserAndPipe(
    browserRunner,
    createAgentBrowserArgs(args),
    stdout,
    stderr,
    input === undefined ? undefined : { input }
  );
}

function createAgentBrowserArgs(args: ParsedCliArgs): string[] {
  const browserArgs = [...args.command];
  for (const [name, values] of args.options) {
    if (name === "json") continue;
    for (const value of values) {
      browserArgs.push(`--${name}`);
      if (value !== "true" || !AGENT_BROWSER_BOOLEAN_OPTIONS.has(name)) {
        browserArgs.push(value);
      }
    }
  }
  browserArgs.push("--json");
  return browserArgs;
}

async function readInput(stdin: AsyncIterable<string | Uint8Array>): Promise<string> {
  let input = "";
  for await (const chunk of stdin) {
    input += typeof chunk === "string" ? chunk : Buffer.from(chunk).toString("utf8");
  }
  return input;
}
