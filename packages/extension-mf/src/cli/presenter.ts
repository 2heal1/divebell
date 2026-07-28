export interface CommandPresenter {
  status(options?: {
    instanceRef?: string;
    role?: "consumer" | "producer";
  }): string;
  moduleInfo(options?: {
    remote?: string;
    instanceRef?: string;
  }): string;
  bridgeTrace(options?: {
    remote?: string;
    name?: string;
    instanceRef?: string;
    bridgeId?: string;
    operationId?: string;
  }): string;
  remoteTrace(options?: {
    target?: string;
    instanceRef?: string;
    traceId?: string;
    preload?: boolean;
  }): string;
  remoteStatus(options: {
    remote: string;
    instanceRef?: string;
  }): string;
}

export function createCommandPresenter(prefix: readonly string[]): CommandPresenter {
  const commandPrefix = prefix.join(" ");
  return {
    status(options = {}) {
      return [
        commandPrefix,
        "status",
        options.role === undefined ? undefined : `--role ${quote(options.role)}`,
        options.instanceRef === undefined
          ? undefined
          : `--instance ${quote(options.instanceRef)}`
      ].filter((value): value is string => value !== undefined).join(" ");
    },
    moduleInfo(options = {}) {
      return [
        commandPrefix,
        "module-info",
        options.remote === undefined ? undefined : quote(options.remote),
        options.instanceRef === undefined
          ? undefined
          : `--instance ${quote(options.instanceRef)}`
      ].filter((value): value is string => value !== undefined).join(" ");
    },
    bridgeTrace(options = {}) {
      return [
        commandPrefix,
        "bridge trace",
        options.remote === undefined ? undefined : quote(options.remote),
        options.name === undefined ? undefined : `--mf ${quote(options.name)}`,
        options.instanceRef === undefined
          ? undefined
          : `--instance ${quote(options.instanceRef)}`,
        options.bridgeId === undefined
          ? undefined
          : `--bridge-id ${quote(options.bridgeId)}`,
        options.operationId === undefined
          ? undefined
          : `--operation ${quote(options.operationId)}`
      ].filter((value): value is string => value !== undefined).join(" ");
    },
    remoteTrace(options = {}) {
      return remoteCommand(
        commandPrefix,
        ["remote", "trace"],
        options.target,
        options,
        options.preload === true ? "--preload" : undefined
      );
    },
    remoteStatus(options) {
      return remoteCommand(
        commandPrefix,
        ["remote", "status"],
        options.remote,
        options
      );
    }
  };
}

function remoteCommand(
  prefix: string,
  path: string[],
  target: string | undefined,
  options: { instanceRef?: string; traceId?: string },
  mode?: string
): string {
  return [
    prefix,
    ...path,
    target === undefined ? undefined : quote(target),
    mode,
    options.instanceRef === undefined ? undefined : `--instance ${quote(options.instanceRef)}`,
    options.traceId === undefined ? undefined : `--trace-id ${quote(options.traceId)}`
  ].filter((value): value is string => value !== undefined).join(" ");
}

function quote(value: string): string {
  return JSON.stringify(value);
}
