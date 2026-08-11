import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import type { DivebellBrowserApi } from "@divebell/cli";

import { rstackError } from "./errors.js";
import type {
  StateCheckDefinition,
  StateCheckItem,
  StateCheckValue
} from "./types.js";

export async function loadStateCheck(path: string): Promise<StateCheckDefinition> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(resolve(path), "utf8"));
  } catch (error) {
    throw rstackError({
      code: "RSTACK_HMR_STATE_CHECK_INVALID",
      kind: "validation",
      message: `Could not read state check ${path}: ${
        error instanceof Error ? error.message : String(error)
      }`
    });
  }
  if (!isRecord(parsed) || !Array.isArray(parsed.checks) || parsed.checks.length === 0) {
    throw invalidStateCheck("State check must contain a non-empty checks array.");
  }
  const checks = parsed.checks.map((value, index) => parseCheck(value, index));
  if (new Set(checks.map((check) => check.name)).size !== checks.length) {
    throw invalidStateCheck("Every state check name must be unique.");
  }
  return { checks };
}

export async function captureState(
  browser: DivebellBrowserApi,
  definition: StateCheckDefinition
): Promise<StateCheckValue[]> {
  const script = [
    "((checks) => checks.map((check) => {",
    "  const element = document.querySelector(check.selector);",
    "  if (element === null) return { name: check.name, found: false };",
    "  let value;",
    "  if (check.attribute !== undefined) value = element.getAttribute(check.attribute);",
    "  else if (check.property !== undefined) value = element[check.property];",
    "  else value = element.textContent;",
    "  if (value === undefined) value = null;",
    "  return { name: check.name, found: true, value };",
    `}))(${JSON.stringify(definition.checks)})`
  ].join("\n");
  const value = await browser.eval<unknown>(script);
  if (!Array.isArray(value)) {
    throw rstackError({
      code: "RSTACK_HMR_STATE_CAPTURE_FAILED",
      kind: "browser",
      message: "The browser did not return an array for the HMR state check."
    });
  }
  const captured = value.flatMap((item): StateCheckValue[] => {
    if (!isRecord(item) || typeof item.name !== "string" || typeof item.found !== "boolean") {
      return [];
    }
    return [{
      name: item.name,
      found: item.found,
      ...("value" in item ? { value: item.value } : {})
    }];
  });
  if (
    captured.length !== definition.checks.length
    || captured.some((item, index) => item.name !== definition.checks[index]?.name)
  ) {
    throw rstackError({
      code: "RSTACK_HMR_STATE_CAPTURE_FAILED",
      kind: "browser",
      message: "The browser returned an incomplete or reordered HMR state check."
    });
  }
  return captured;
}

export function compareState(
  before: StateCheckValue[] | undefined,
  after: StateCheckValue[] | undefined
): "verified-preserved" | "verified-reset" | "not-verified" {
  if (before === undefined || after === undefined) return "not-verified";
  if (before.length === 0 || before.some((item) => !item.found)) {
    return "not-verified";
  }
  return JSON.stringify(before) === JSON.stringify(after)
    ? "verified-preserved"
    : "verified-reset";
}

function parseCheck(value: unknown, index: number): StateCheckItem {
  if (!isRecord(value)) {
    throw invalidStateCheck(`checks[${index}] must be an object.`);
  }
  if (typeof value.name !== "string" || value.name.length === 0) {
    throw invalidStateCheck(`checks[${index}].name must be a non-empty string.`);
  }
  if (typeof value.selector !== "string" || value.selector.length === 0) {
    throw invalidStateCheck(`checks[${index}].selector must be a non-empty string.`);
  }
  if (value.property !== undefined && typeof value.property !== "string") {
    throw invalidStateCheck(`checks[${index}].property must be a string.`);
  }
  if (value.attribute !== undefined && typeof value.attribute !== "string") {
    throw invalidStateCheck(`checks[${index}].attribute must be a string.`);
  }
  if (value.property !== undefined && value.attribute !== undefined) {
    throw invalidStateCheck(
      `checks[${index}] must use property or attribute, not both.`
    );
  }
  return {
    name: value.name,
    selector: value.selector,
    ...(value.property === undefined ? {} : { property: value.property }),
    ...(value.attribute === undefined ? {} : { attribute: value.attribute })
  };
}

function invalidStateCheck(message: string): Error {
  return rstackError({
    code: "RSTACK_HMR_STATE_CHECK_INVALID",
    kind: "validation",
    message
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
