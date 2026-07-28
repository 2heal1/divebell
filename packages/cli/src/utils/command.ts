import type { RuntimeDataCondition } from "@divebell/core";
import { getOptionValue, getOptionValues, type ParsedCliArgs } from "./args.js";
import { createError } from "./output.js";

export function hasOption(args: ParsedCliArgs, name: string): boolean {
  return args.options.has(name);
}

export function requireOption(args: ParsedCliArgs, name: string): string {
  const value = getOptionValue(args, name);
  if (value === undefined || value.length === 0) {
    throw createError({
      code: "CLI_REQUIRED_OPTION_MISSING",
      kind: "validation",
      message: `Missing required option "--${name}".`,
      details: { option: name }
    });
  }
  return value;
}

export function requireCommandArgument(args: ParsedCliArgs, index: number, label: string): string {
  const value = args.command[index];
  if (value === undefined || value.length === 0) {
    throw createError({
      code: "CLI_REQUIRED_ARGUMENT_MISSING",
      kind: "validation",
      message: `Missing required ${label}.`,
      details: { argument: label, index }
    });
  }
  return value;
}

export function parsePayloadOption(args: ParsedCliArgs): Record<string, unknown> | undefined {
  const payload = getOptionValue(args, "payload");
  if (payload === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    throw createError({
      code: "CLI_PAYLOAD_INVALID_JSON",
      kind: "validation",
      message: "--payload must be valid JSON.",
      hint: "Pass --payload as a JSON object string."
    });
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw createError({
      code: "CLI_PAYLOAD_INVALID_SHAPE",
      kind: "validation",
      message: "--payload must be a JSON object.",
      hint: "Pass --payload as a JSON object string."
    });
  }
  return parsed as Record<string, unknown>;
}

export function parseHeadersOption(args: ParsedCliArgs): Readonly<Record<string, string>> | undefined {
  const headers = getOptionValue(args, "headers");
  if (headers === undefined) return undefined;

  let parsed: unknown;
  try {
    parsed = JSON.parse(headers);
  } catch {
    throw createError({
      code: "CLI_HEADERS_INVALID_JSON",
      kind: "validation",
      message: "--headers must be valid JSON.",
      hint: "Pass --headers as a JSON object with string values."
    });
  }

  if (
    parsed === null
    || typeof parsed !== "object"
    || Array.isArray(parsed)
    || !Object.values(parsed).every((value) => typeof value === "string")
  ) {
    throw createError({
      code: "CLI_HEADERS_INVALID_SHAPE",
      kind: "validation",
      message: "--headers must be a JSON object with string values.",
      hint: "Pass --headers as a JSON object with string values."
    });
  }
  return Object.freeze(parsed as Record<string, string>);
}

export function parseWhereOptions(args: ParsedCliArgs): RuntimeDataCondition[] | undefined {
  const values = getOptionValues(args, "where");
  if (values.length === 0) return undefined;

  return values.map((value) => {
    const equalsIndex = value.indexOf("=");
    if (equalsIndex <= 0) throw new Error("--where must use the form path=value.");
    const path = value.slice(0, equalsIndex).trim();
    if (path.length === 0) throw new Error("--where path must not be empty.");
    return { path, equals: parseWhereValue(value.slice(equalsIndex + 1)) };
  });
}

function parseWhereValue(rawValue: string): unknown {
  const value = rawValue.trim();
  if (value.length === 0) return "";
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

export function createOptionalNumberProperty<Name extends string>(
  name: Name,
  value: number | undefined
): Record<Name, number> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, number>;
}

export function createOptionalStringProperty<Name extends string>(
  name: Name,
  value: string | undefined
): Record<Name, string> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, string>;
}

export function createOptionalObjectProperty<Name extends string, Value extends object>(
  name: Name,
  value: Value | undefined
): Record<Name, Value> | Record<string, never> {
  return value === undefined ? {} : { [name]: value } as Record<Name, Value>;
}

export function writeJson(stdout: { write(chunk: string): void }, value: unknown): void {
  stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
