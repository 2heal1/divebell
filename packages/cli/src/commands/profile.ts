import type { ParsedCliArgs } from "../utils/args.js";
import type { CliOperationLogStore } from "../utils/operation-log.js";
import {
  exportBrowserTempProfile,
  resolveBrowserProfileExportPath,
  validateBrowserTempProfileExport
} from "../features/browser/temp-profile.js";
import { createCommandOutput, createError } from "../utils/output.js";

export interface ProfileCloseResult {
  browserExitCode: number;
}

export async function runProfileCommand(options: {
  args: ParsedCliArgs;
  stdout: { write(chunk: string): void };
  operationLogStore: CliOperationLogStore;
  env?: NodeJS.ProcessEnv;
  cwd?: string;
  closeCurrentPage(afterBrowserClose: (result: ProfileCloseResult) => Promise<void>): Promise<void>;
}): Promise<number> {
  const { args } = options;
  if (
    args.command[1] !== "export"
    || args.command.length > 3
    || args.options.size > 0
  ) {
    throw createError({
      code: "PROFILE_COMMAND_USAGE_INVALID",
      kind: "validation",
      message: "Invalid Profile command usage.",
      retryable: false,
      hint: "Run `divebell profile export [path]` while a temporary Profile is open."
    });
  }

  const openContext = await options.operationLogStore.read();
  const tempProfile = openContext?.browserTempProfile;
  if (tempProfile === undefined) {
    throw createError({
      code: "PROFILE_EXPORT_TEMP_REQUIRED",
      kind: "validation",
      message: "The current page was not opened with a temporary Profile.",
      retryable: false,
      hint: "Run `divebell open <url> --ui --temp-profile`, sign in, then run `divebell profile export [path]`."
    });
  }

  const path = resolveBrowserProfileExportPath({
    ...(args.command[2] === undefined ? {} : { outputPath: args.command[2] }),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    ...(options.env === undefined ? {} : { env: options.env })
  });
  const exportOptions = {
    sourcePath: tempProfile.path,
    outputPath: path,
    ...(options.env === undefined ? {} : { env: options.env })
  };
  await validateBrowserTempProfileExport(exportOptions);
  await options.closeCurrentPage(async ({ browserExitCode }) => {
    if (browserExitCode !== 0) {
      throw createError({
        code: "PROFILE_EXPORT_BROWSER_CLOSE_FAILED",
        kind: "browser",
        message: "Could not close the browser cleanly before exporting its temporary Profile.",
        retryable: true,
        hint: "Retry `divebell profile export [path]`; the temporary Profile has not been removed.",
        details: { exitCode: browserExitCode }
      });
    }
    await exportBrowserTempProfile(exportOptions);
  });

  createCommandOutput(options.stdout, args.command.join(" ")).ok(
    { path },
    "Temporary Profile exported."
  );
  return 0;
}
