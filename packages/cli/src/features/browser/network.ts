import { getOptionValue, type ParsedCliArgs } from "../../utils/args.js";
import type { BrowserRunner } from "./runner.js";
export async function runNetworkCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const result = await browserRunner.run(["network", "requests"]);
  const urlQuery = getOptionValue(args, "url");
  const output = result.exitCode === 0 && urlQuery !== undefined
    ? filterNetworkOutputByUrl(result.stdout, urlQuery)
    : normalizeNetworkOutput(result.stdout);
  if (output.length > 0) {
    stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }
  if (result.stderr.length > 0) {
    stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
  }
  return result.exitCode;
}

function filterNetworkOutputByUrl(output: string, query: string): string {
  const normalized = normalizeNetworkOutput(output);
  if (normalized.trim() === "(no requests)") return normalized;

  const lines = normalized.split(/\r?\n/);
  const filtered = lines.filter((line) => {
    if (line.length === 0 || line.startsWith("#")) return true;
    return getNetworkLineUrl(line)?.includes(query) ?? false;
  });
  return filtered.join("\n");
}

function normalizeNetworkOutput(output: string): string {
  return output.split(/\r?\n/).filter((line) => !line.includes("network <idx>")).join("\n");
}

function getNetworkLineUrl(line: string): string | undefined {
  const parts = line.trim().split(/\s+/);
  if (/^\[[^\]]+\]$/.test(parts[0] ?? "") && parts.length >= 3) {
    return parts[2];
  }
  return parts.length >= 6 ? parts[5] : undefined;
}
