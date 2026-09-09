import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { resolveDivebellHomeDirectory } from "../../utils/home.js";
import { createError } from "../../utils/output.js";

const DEFAULT_STATE_DIRECTORY = "states";
const DEFAULT_STATE_FILE = "default-state.json";

export interface DefaultBrowserState {
  path: string;
}

export function resolveDefaultBrowserStatePath(
  env: NodeJS.ProcessEnv = process.env
): string {
  return join(resolveDivebellHomeDirectory(env), DEFAULT_STATE_DIRECTORY, DEFAULT_STATE_FILE);
}

export async function readDefaultBrowserState(
  env: NodeJS.ProcessEnv = process.env
): Promise<DefaultBrowserState | undefined> {
  const path = resolveDefaultBrowserStatePath(env);
  try {
    validateBrowserState(JSON.parse(await readFile(path, "utf8")));
    return { path };
  } catch (error) {
    if (isMissingFileError(error)) return undefined;
    throw createError({
      code: "DEFAULT_STATE_INVALID",
      kind: "validation",
      message: `The configured default browser state is invalid: ${path}.`,
      hint: "Run `divebell config state clear`, then configure a valid state file."
    });
  }
}

export async function setDefaultBrowserState(
  sourcePath: string,
  env: NodeJS.ProcessEnv = process.env
): Promise<DefaultBrowserState> {
  const source = resolve(sourcePath);
  let contents: string;
  try {
    contents = await readFile(source, "utf8");
    validateBrowserState(JSON.parse(contents));
  } catch {
    throw createError({
      code: "DEFAULT_STATE_SOURCE_INVALID",
      kind: "validation",
      message: `Default browser state must be a valid agent-browser state file: ${source}.`
    });
  }

  const path = resolveDefaultBrowserStatePath(env);
  await mkdir(resolve(path, ".."), { recursive: true, mode: 0o700 });
  await writeFile(path, `${contents.trim()}\n`, { encoding: "utf8", mode: 0o600 });
  await chmod(path, 0o600);
  return { path };
}

export async function clearDefaultBrowserState(
  env: NodeJS.ProcessEnv = process.env
): Promise<void> {
  await rm(resolveDefaultBrowserStatePath(env), { force: true });
}

function validateBrowserState(value: unknown): void {
  if (
    value === null ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    !Array.isArray((value as Record<string, unknown>).cookies) ||
    !Array.isArray((value as Record<string, unknown>).origins)
  ) {
    throw new Error("invalid state");
  }
}

function isMissingFileError(error: unknown): boolean {
  return error !== null &&
    typeof error === "object" &&
    "code" in error &&
    error.code === "ENOENT";
}
