import type { ParsedCliArgs } from "../utils/args.js";
import { createCommandOutput, createError } from "../utils/output.js";
import {
  clearDefaultBrowserState,
  readDefaultBrowserState,
  setDefaultBrowserState
} from "../features/browser/default-state.js";

export async function runConfigCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  env: NodeJS.ProcessEnv;
}): Promise<number> {
  const [, section, value] = options.args.command;
  if (section !== "state" || options.args.command.length > 3 || options.args.options.size > 0) {
    throw createError({
      code: "CONFIG_USAGE_INVALID",
      kind: "validation",
      message: "Use `divebell config state [<path>|clear]`."
    });
  }

  if (value === undefined) {
    createCommandOutput(options.stdout, options.args.command.join(" ")).ok({
      state: await readDefaultBrowserState(options.env) ?? null
    });
    return 0;
  }
  if (value === "clear") {
    await clearDefaultBrowserState(options.env);
    createCommandOutput(options.stdout, options.args.command.join(" ")).ok(undefined);
    return 0;
  }
  createCommandOutput(options.stdout, options.args.command.join(" ")).ok({
    state: await setDefaultBrowserState(value, options.env)
  });
  return 0;
}
