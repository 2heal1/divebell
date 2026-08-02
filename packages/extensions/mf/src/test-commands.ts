import type {
  CliCommandErrorResult,
  CliCommandInvocation,
  CliCommandOkResult
} from "@divebell/cli";

import type {
  ModuleInfoResult,
  RoleFilter,
  StatusResult
} from "./types.js";
import type { RemoteStatusResult } from "./remote/types.js";
import type { ModulePerformanceResult } from "./module-performance/types.js";

export interface MfTestSelector {
  mf?: string;
  instance?: string;
}

export interface MfStatusTestOptions extends MfTestSelector {
  name?: string;
  role?: RoleFilter;
  verbose?: boolean;
}

export interface MfModuleInfoTestOptions extends MfTestSelector {
  remote?: string;
}

export interface MfRemoteStatusTestOptions extends MfTestSelector {
  remote: string;
}

export interface MfModulePerformanceTestOptions extends MfTestSelector {
  target?: string;
}

type MfTestCommand<T> = CliCommandInvocation<
  CliCommandOkResult<T>,
  CliCommandErrorResult
>;

export const mfTestCommands = {
  status(options: MfStatusTestOptions = {}): MfTestCommand<StatusResult> {
    return command([
      "mf",
      "status",
      ...optionalArgument(options.name),
      ...selectorArgs(options),
      ...flag("verbose", options.verbose)
    ]);
  },

  moduleInfo(
    options: MfModuleInfoTestOptions = {}
  ): MfTestCommand<ModuleInfoResult> {
    return command([
      "mf",
      "module-info",
      ...optionalArgument(options.remote),
      ...selectorArgs(options)
    ]);
  },

  modulePerformance(
    options: MfModulePerformanceTestOptions = {}
  ): MfTestCommand<ModulePerformanceResult> {
    return command([
      "mf",
      "module-perf",
      ...optionalArgument(options.target),
      ...selectorArgs(options)
    ]);
  },

  remoteStatus(
    options: MfRemoteStatusTestOptions
  ): MfTestCommand<RemoteStatusResult> {
    return command([
      "mf",
      "remote",
      "status",
      options.remote,
      ...selectorArgs(options)
    ]);
  }
};

function command<T>(args: string[]): MfTestCommand<T> {
  return { args };
}

function selectorArgs(options: MfTestSelector): string[] {
  return [
    ...option("mf", options.mf),
    ...option("instance", options.instance)
  ];
}

function option(name: string, value: string | undefined): string[] {
  return value === undefined ? [] : [`--${name}`, value];
}

function flag(name: string, enabled: boolean | undefined): string[] {
  return enabled === true ? [`--${name}`] : [];
}

function optionalArgument(value: string | undefined): string[] {
  return value === undefined ? [] : [value];
}
