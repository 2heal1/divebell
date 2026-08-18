import type { BrowserRunResult, BrowserRunner } from "../features/browser/types.js";
import { createError } from "../utils/output.js";

const AGENT_BROWSER_COMMAND_ALIASES: Readonly<Record<string, string>> = {
  "check-element": "check",
  "page-snapshot": "snapshot",
  video: "record"
};

const DIVEBELL_ONLY_BROWSER_COMMANDS = new Set([
  "get-window",
  "goto",
  "navigate",
  "open",
  "wait-eval"
]);

export async function createInstalledBrowserHelpText(
  command: string,
  browserRunner: BrowserRunner
): Promise<string | undefined> {
  if (DIVEBELL_ONLY_BROWSER_COMMANDS.has(command)) return undefined;

  const agentBrowserCommand = AGENT_BROWSER_COMMAND_ALIASES[command] ?? command;
  const result = await readInstalledBrowserHelp(agentBrowserCommand, browserRunner);
  const output = joinBrowserOutput(result);
  if (
    result.exitCode !== 0
    || !hasDedicatedBrowserHelp(agentBrowserCommand, output)
  ) {
    return undefined;
  }

  return [
    `Installed agent-browser help for \`${agentBrowserCommand}\` (use these arguments with \`browser.raw\`):`,
    "",
    output
  ].join("\n");
}

export async function runBrowserHelpCommand(
  commandPath: readonly string[],
  optionCount: number,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const command = commandPath[0];
  if (
    commandPath.length > 1
    || optionCount > 0
    || (command !== undefined && !/^[a-z][a-z0-9-]*$/.test(command))
  ) {
    throw createError({
      code: "CLI_BROWSER_HELP_USAGE_INVALID",
      kind: "validation",
      message: "browser-help accepts at most one agent-browser command name.",
      hint: "Run `divebell browser-help [agent-browser-command]`."
    });
  }
  const result = await readInstalledBrowserHelp(command, browserRunner);
  stdout.write(result.stdout);
  stderr.write(result.stderr);
  return result.exitCode;
}

async function readInstalledBrowserHelp(
  command: string | undefined,
  browserRunner: BrowserRunner
): Promise<BrowserRunResult> {
  return await browserRunner.run(
    [...(command === undefined ? [] : [command]), "--help"],
    {
      disableDefaultProfile: true,
      disableRestore: true,
      ignoreConfiguredProfile: true,
      ignoreConfiguredState: true
    }
  );
}

function hasDedicatedBrowserHelp(command: string, output: string): boolean {
  const title = output.split("\n").find((line) => line.trim().length > 0) ?? "";
  const titleMatch = title.match(/^agent-browser\s+(.+?)\s+-\s+/);
  const commandNames = titleMatch?.[1];
  return commandNames?.split("/").includes(command) === true;
}

function joinBrowserOutput(result: BrowserRunResult): string {
  return `${result.stdout}${result.stderr}`.trim();
}
