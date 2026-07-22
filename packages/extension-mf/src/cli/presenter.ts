export interface CommandPresenter {
  status(options?: {
    instanceRef?: string;
    role?: "consumer" | "producer";
    json?: boolean;
  }): string;
  moduleInfo(options?: {
    remote?: string;
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
          : `--instance ${quote(options.instanceRef)}`,
        options.json === true ? "--json" : undefined
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
    }
  };
}

function quote(value: string): string {
  return JSON.stringify(value);
}
