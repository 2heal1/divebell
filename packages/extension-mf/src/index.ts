import type { CliExtensionRunOptions, ParsedCliArgs } from "@openruntime/cli";

import { MfCommandError } from "./errors.js";
import { formatModuleInfo, formatStatus } from "./format.js";
import { readMfObservability } from "./reader.js";
import { createModuleInfoResult, createStatusResult } from "./results.js";
import type { RoleFilter } from "./types.js";

export async function runMfCommand(options: CliExtensionRunOptions): Promise<number> {
  const action = options.args.command[1];
  if (action !== "status" && action !== "module-info") {
    throw new MfCommandError({
      code: "MF_COMMAND_INVALID",
      kind: "validation",
      message: "mf requires status or module-info.",
      hint: "Run `openruntime mf status` or `openruntime mf module-info [remote]`."
    });
  }

  let readResult;
  try {
    readResult = await readMfObservability(options.openruntime.browser);
  } catch (error) {
    if (isOpenContextError(error)) {
      throw new MfCommandError({
        code: "MF_PAGE_CONTEXT_REQUIRED",
        kind: "validation",
        message: "There is no page opened by OpenRuntime for this command.",
        hint: "Run `openruntime open <url>` and then run the MF command again."
      });
    }
    throw new MfCommandError({
      code: "MF_BROWSER_READ_FAILED",
      kind: "browser",
      message: error instanceof Error ? error.message : String(error),
      hint: "Confirm that the current page is still open, then retry."
    });
  }
  if (!readResult.ok) throw unavailableError(readResult);

  if (action === "status") {
    const selectors = parseStatusSelectors(options.args);
    const result = createStatusResult(readResult.snapshot, selectors);
    writeResult(options, result, formatStatus(result));
    return 0;
  }

  const parsed = parseModuleInfoSelectors(options.args);
  const result = createModuleInfoResult(
    readResult.snapshot,
    {
      ...(parsed.name === undefined ? {} : { name: parsed.name }),
      ...(parsed.instanceRef === undefined ? {} : { instanceRef: parsed.instanceRef })
    },
    parsed.remote
  );
  writeResult(options, result, formatModuleInfo(result));
  return 0;
}

export { formatModuleInfo, formatStatus } from "./format.js";
export { MF_BROWSER_READ_SCRIPT, parseBrowserReadResult, parseRuntimeState } from "./reader.js";
export { createCompatibilitySummary, createModuleInfoResult, createStatusResult } from "./results.js";
export {
  hasRole,
  listRemoteCandidates,
  selectConsumer,
  selectRemote,
  selectStatusInstances,
  visibleInstanceName
} from "./selection.js";
export type * from "./types.js";

function parseStatusSelectors(args: ParsedCliArgs): {
  name?: string;
  role?: RoleFilter;
  instanceRef?: string;
} {
  if (args.command.length > 3) {
    throw usageError("status", "status accepts at most one name.");
  }
  const role = option(args, "role");
  if (role !== undefined && role !== "consumer" && role !== "producer") {
    throw new MfCommandError({
      code: "MF_ROLE_INVALID",
      kind: "validation",
      message: `Unsupported MF role ${role}.`,
      hint: "Use --role consumer or --role producer."
    });
  }
  const name = args.command[2];
  const instanceRef = option(args, "instance");
  return {
    ...(name === undefined ? {} : { name }),
    ...(role === undefined ? {} : { role }),
    ...(instanceRef === undefined ? {} : { instanceRef })
  };
}

function parseModuleInfoSelectors(args: ParsedCliArgs): {
  remote?: string;
  name?: string;
  instanceRef?: string;
} {
  if (args.command.length > 3) {
    throw usageError("module-info", "module-info accepts at most one remote name.");
  }
  const remote = args.command[2];
  const name = option(args, "mf");
  const instanceRef = option(args, "instance");
  return {
    ...(remote === undefined ? {} : { remote }),
    ...(name === undefined ? {} : { name }),
    ...(instanceRef === undefined ? {} : { instanceRef })
  };
}

function option(args: ParsedCliArgs, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

function writeResult(
  options: CliExtensionRunOptions,
  result: unknown,
  humanText: string
): void {
  if (options.args.options.has("json")) {
    options.output.ok(result);
  } else {
    options.stdout.write(humanText);
  }
}

function usageError(action: string, message: string): MfCommandError {
  return new MfCommandError({
    code: "MF_COMMAND_USAGE_INVALID",
    kind: "validation",
    message,
    hint: action === "status"
      ? "Run `openruntime mf status [name] [--role consumer|producer] [--instance <ref>]`."
      : "Run `openruntime mf module-info [remote] [--mf <name>] [--instance <ref>]`."
  });
}

function unavailableError(
  result: Exclude<Awaited<ReturnType<typeof readMfObservability>>, { ok: true }>
): MfCommandError {
  const common = {
    details: {
      observabilityMode: "unavailable",
      availableScopes: result.availableScopes,
      compatibleScopes: result.compatibleScopes,
      ...(result.injection === undefined ? {} : { injection: result.injection })
    }
  };
  if (result.reason === "multiple-readers") {
    return new MfCommandError({
      code: "MF_OBSERVABILITY_READER_AMBIGUOUS",
      kind: "needs_input",
      message: "More than one application Observability reader is available, so no reader was chosen implicitly.",
      hint: "Keep one application reader scope for this page, or remove the duplicate controller and reopen the page.",
      ...common
    });
  }
  if (result.reason === "incompatible") {
    return new MfCommandError({
      code: "MF_OBSERVABILITY_INCOMPATIBLE",
      kind: "runtime",
      message: "An Observability reader exists, but it does not provide the MF-Obs-00 safe runtime-state interface.",
      hint: "Upgrade the MF Observability Plugin, then reopen the page with `openruntime open <url>`.",
      ...common
    });
  }
  if (result.reason === "reader-error") {
    return new MfCommandError({
      code: "MF_OBSERVABILITY_READ_FAILED",
      kind: "runtime",
      message: `The public Observability reader failed: ${result.message}`,
      hint: "Inspect the application reader configuration, then reopen the page and retry.",
      ...common
    });
  }
  return new MfCommandError({
    code: "MF_OBSERVABILITY_UNAVAILABLE",
    kind: "not_found",
    message: "No public Module Federation Observability reader is available in the current page.",
    hint: "Reopen the page with `openruntime open <url>`. If the extension was installed after opening, close and reopen the page; alternatively configure the Observability Plugin in the application.",
    ...common
  });
}

function isOpenContextError(error: unknown): boolean {
  return error instanceof Error &&
    ((error as Error & { code?: string }).code === "OPEN_CONTEXT_REQUIRED" ||
      /No opened page context/i.test(error.message));
}
