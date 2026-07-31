import { createRequire } from "node:module";
import type { ParsedCliArgs } from "./types/shared.js";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version?: unknown };

if (typeof packageJson.version !== "string" || packageJson.version.length === 0) {
  throw new Error("The Divebell CLI package version is missing.");
}

export const CLI_VERSION = packageJson.version;

export function isCliVersionRequest(args: ParsedCliArgs): boolean {
  return args.command.length === 0 && args.options.has("version");
}
