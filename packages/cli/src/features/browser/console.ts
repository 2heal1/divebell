import { getNumberOption, getOptionValue, getOptionValues, type ParsedCliArgs } from "../../utils/args.js";
import { createOptionalNumberProperty, createOptionalObjectProperty, createOptionalStringProperty, isRecord, writeJson } from "../../utils/command.js";
import { parseBrowserJsonOutput, type BrowserRunner } from "./runner.js";
import type { BrowserConsoleEntry, BrowserConsoleLevel } from "./types.js";
export async function runConsoleCommand(
  args: ParsedCliArgs,
  stdout: { write(chunk: string): void },
  stderr: { write(chunk: string): void },
  browserRunner: BrowserRunner
): Promise<number> {
  const result = await browserRunner.run(["console", "--json"]);
  if (result.exitCode !== 0) {
    if (result.stdout.length > 0) {
      stdout.write(result.stdout.endsWith("\n") ? result.stdout : `${result.stdout}\n`);
    }
    if (result.stderr.length > 0) {
      stderr.write(result.stderr.endsWith("\n") ? result.stderr : `${result.stderr}\n`);
    }
    return result.exitCode;
  }

  const entries = filterConsoleEntries(
    parseConsoleEntries(parseBrowserJsonOutput(result.stdout)),
    {
      ...createOptionalObjectProperty("levels", parseConsoleLevels(args)),
      ...createOptionalStringProperty("query", getOptionValue(args, "query")),
      ...createOptionalNumberProperty("limit", getNumberOption(args, "limit"))
    }
  );
  writeJson(stdout, {
    entries,
    summary: summarizeConsoleEntries(entries)
  });
  return 0;
}

function parseConsoleEntries(value: unknown): BrowserConsoleEntry[] {
  const rawEntries = Array.isArray(value)
    ? value
    : isRecord(value) && Array.isArray(value.messages)
      ? value.messages
      : [];

  return rawEntries.flatMap((entry): BrowserConsoleEntry[] => {
    if (entry === null || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const level = normalizeConsoleLevel(item.level ?? item.type);
    if (level === undefined) return [];
    return [{
      level,
      args: typeof item.text === "string"
        ? item.text
        : typeof item.args === "string"
          ? item.args
          : String(item.args ?? ""),
      ...createOptionalNumberProperty("timestamp", typeof item.timestamp === "number" ? item.timestamp : undefined)
    }];
  });
}

function parseConsoleLevels(args: ParsedCliArgs): Set<BrowserConsoleLevel> | undefined {
  const values = getOptionValues(args, "level");
  if (values.length === 0) return undefined;

  const levels = new Set<BrowserConsoleLevel>();
  for (const value of values) {
    for (const rawLevel of value.split(",")) {
      const level = normalizeConsoleLevel(rawLevel.trim());
      if (level === undefined) {
        throw new Error(`Unsupported console level "${rawLevel}". Use log, info, warn, or error.`);
      }
      levels.add(level);
    }
  }
  return levels;
}

function normalizeConsoleLevel(value: unknown): BrowserConsoleLevel | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.toLowerCase();
  if (normalized === "warning") return "warn";
  if (normalized === "log" || normalized === "info" || normalized === "warn" || normalized === "error") {
    return normalized;
  }
  return undefined;
}

function filterConsoleEntries(
  entries: BrowserConsoleEntry[],
  options: {
    levels?: Set<BrowserConsoleLevel>;
    query?: string;
    limit?: number;
  }
): BrowserConsoleEntry[] {
  const normalizedQuery = options.query?.toLowerCase();
  const filtered = entries.filter((entry) =>
    (options.levels === undefined || options.levels.has(entry.level)) &&
    (normalizedQuery === undefined ||
      entry.level.includes(normalizedQuery) ||
      entry.args.toLowerCase().includes(normalizedQuery))
  );

  if (options.limit === undefined || options.limit < 0) return filtered;
  return filtered.slice(-options.limit);
}

function summarizeConsoleEntries(entries: BrowserConsoleEntry[]): {
  total: number;
  log: number;
  info: number;
  warn: number;
  error: number;
} {
  const summary = {
    total: entries.length,
    log: 0,
    info: 0,
    warn: 0,
    error: 0
  };
  for (const entry of entries) {
    summary[entry.level] += 1;
  }
  return summary;
}
