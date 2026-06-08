export interface ParsedCliArgs {
  command: string[];
  options: Map<string, string[]>;
}

export function parseCliArgs(argv: string[]): ParsedCliArgs {
  const command: string[] = [];
  const options = new Map<string, string[]>();

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === undefined) continue;

    if (!arg.startsWith("--")) {
      command.push(arg);
      continue;
    }

    const option = arg.slice(2);
    const equalsIndex = option.indexOf("=");
    if (equalsIndex >= 0) {
      appendOption(options, option.slice(0, equalsIndex), option.slice(equalsIndex + 1));
      continue;
    }

    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith("--")) {
      appendOption(options, option, next);
      index += 1;
      continue;
    }

    appendOption(options, option, "true");
  }

  return {
    command,
    options
  };
}

export function getOptionValue(args: ParsedCliArgs, name: string): string | undefined {
  return args.options.get(name)?.at(-1);
}

export function getOptionValues(args: ParsedCliArgs, name: string): string[] {
  return args.options.get(name) ?? [];
}

export function getNumberOption(args: ParsedCliArgs, name: string): number | undefined {
  const value = getOptionValue(args, name);
  if (value === undefined) return undefined;

  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function appendOption(options: Map<string, string[]>, name: string, value: string): void {
  const values = options.get(name);
  if (values === undefined) {
    options.set(name, [value]);
    return;
  }
  values.push(value);
}
