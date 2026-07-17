import { getOptionValues, type ParsedCliArgs } from "../../utils/args.js";
export function createQuery(args: ParsedCliArgs, command: string): URLSearchParams {
  const params = new URLSearchParams();
  const names = getQueryOptionNames(command);
  for (const name of names) {
    for (const value of getOptionValues(args, name)) {
      params.append(name, value);
    }
  }
  return params;
}

function getQueryOptionNames(command: string): string[] {
  if (command === "targets" || command === "snapshot") {
    return ["id", "type", "source", "status", "query"];
  }
  if (command === "events") {
    return ["since", "target-id", "action", "type", "source", "status", "limit", "query"];
  }
  return ["name", "source", "risk", "enabled", "query"];
}
