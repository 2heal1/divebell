import type {
  CliCommandErrorResult,
  CliCommandInvocation,
  CliCommandOkResult,
  ExtensionAddResult,
  ExtensionListResult,
  OpenPageResult,
  RuntimesResult,
  RuntimeResourceResult,
  StopResult
} from "@divebell/cli";
import type {
  GetEventsResult,
  RuntimeActionDescriptor,
  RuntimeActionResult,
  RuntimeSnapshot,
  RuntimeTargetDescriptor,
  RuntimeWaitResult
} from "@divebell/core";

export interface RuntimeTestCommandOptions {
  bridge?: string;
  runtime?: string;
  session?: string;
  url?: string;
}

export interface SnapshotTestCommandOptions extends RuntimeTestCommandOptions {
  id?: string;
}

export interface EventsTestCommandOptions extends RuntimeTestCommandOptions {
  limit?: number;
}

export interface RunActionTestCommandOptions extends RuntimeTestCommandOptions {
  payload?: unknown;
}

export interface WaitForTestCommandOptions extends RuntimeTestCommandOptions {
  where?: Record<string, unknown>;
  timeout?: number;
  next?: boolean;
  strict?: boolean;
}

export interface OpenTestCommandOptions {
  bridge?: string;
  mf?: boolean;
  noBridge?: boolean;
  session?: string;
  port?: number;
}

export type DivebellTestCommand<T> = CliCommandInvocation<
  T,
  CliCommandErrorResult
>;

export const divebellTestCommands = {
  extensions: {
    add(
      archive: string,
      options: { extensionsDirectory?: string } = {}
    ): DivebellTestCommand<ExtensionAddResult> {
      return command([
        "extensions",
        "add",
        archive,
        ...option("extensions-dir", options.extensionsDirectory)
      ]);
    },

    list(
      options: { extensionsDirectory?: string } = {}
    ): DivebellTestCommand<ExtensionListResult> {
      return command([
        "extensions",
        "list",
        ...option("extensions-dir", options.extensionsDirectory)
      ]);
    }
  },

  open(
    url: string,
    options: OpenTestCommandOptions = {}
  ): DivebellTestCommand<CliCommandOkResult<OpenPageResult>> {
    return command([
      "open",
      url,
      ...option("bridge", options.bridge),
      ...flag("mf", options.mf),
      ...flag("no-bridge", options.noBridge),
      ...option("session", options.session),
      ...numberOption("port", options.port)
    ]);
  },

  stop(): DivebellTestCommand<StopResult> {
    return command(["stop"]);
  },

  runtimes(
    options: RuntimeTestCommandOptions = {}
  ): DivebellTestCommand<RuntimesResult> {
    return command(["runtimes", ...runtimeSelectorArgs(options)]);
  },

  targets(
    options: RuntimeTestCommandOptions = {}
  ): DivebellTestCommand<RuntimeResourceResult<RuntimeTargetDescriptor[]>> {
    return command(["targets", ...runtimeSelectorArgs(options)]);
  },

  snapshot(
    options: SnapshotTestCommandOptions = {}
  ): DivebellTestCommand<RuntimeResourceResult<RuntimeSnapshot>> {
    return command([
      "snapshot",
      ...runtimeSelectorArgs(options),
      ...option("id", options.id)
    ]);
  },

  actions(
    options: RuntimeTestCommandOptions = {}
  ): DivebellTestCommand<RuntimeResourceResult<RuntimeActionDescriptor[]>> {
    return command(["actions", ...runtimeSelectorArgs(options)]);
  },

  runAction(
    actionName: string,
    options: RunActionTestCommandOptions = {}
  ): DivebellTestCommand<RuntimeResourceResult<RuntimeActionResult>> {
    return command([
      "run-action",
      actionName,
      ...runtimeSelectorArgs(options),
      ...jsonOption("payload", options.payload)
    ]);
  },

  waitFor(
    targetId: string,
    status: string,
    options: WaitForTestCommandOptions = {}
  ): DivebellTestCommand<RuntimeResourceResult<RuntimeWaitResult>> {
    return command([
      "wait-for",
      targetId,
      status,
      ...runtimeSelectorArgs(options),
      ...whereArgs(options.where),
      ...numberOption("timeout", options.timeout),
      ...flag("next", options.next),
      ...flag("strict", options.strict)
    ]);
  },

  events(
    options: EventsTestCommandOptions = {}
  ): DivebellTestCommand<RuntimeResourceResult<GetEventsResult>> {
    return command([
      "events",
      ...runtimeSelectorArgs(options),
      ...numberOption("limit", options.limit)
    ]);
  }
};

function command<T>(args: string[]): DivebellTestCommand<T> {
  return { args };
}

function runtimeSelectorArgs(options: RuntimeTestCommandOptions): string[] {
  return [
    ...option("bridge", options.bridge),
    ...option("runtime", options.runtime),
    ...option("session", options.session),
    ...option("url", options.url)
  ];
}

function whereArgs(where: Record<string, unknown> | undefined): string[] {
  if (where === undefined) return [];
  return Object.entries(where).flatMap(([path, value]) => [
    "--where",
    `${path}=${formatValue(value)}`
  ]);
}

function jsonOption(name: string, value: unknown): string[] {
  return value === undefined
    ? []
    : [`--${name}`, JSON.stringify(value) ?? String(value)];
}

function option(name: string, value: string | undefined): string[] {
  return value === undefined ? [] : [`--${name}`, value];
}

function numberOption(name: string, value: number | undefined): string[] {
  return value === undefined ? [] : [`--${name}`, String(value)];
}

function flag(name: string, enabled: boolean | undefined): string[] {
  return enabled === true ? [`--${name}`] : [];
}

function formatValue(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value) ?? String(value);
}
