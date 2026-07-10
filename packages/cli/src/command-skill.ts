import { accessSync, constants, existsSync, statSync } from "node:fs";
import { basename, isAbsolute } from "node:path";

export interface OpenRuntimeCommandSkill {
  path: string;
}

export function validateCommandSkill(value: unknown, commandName: string): OpenRuntimeCommandSkill {
  if (typeof value !== "object" || value === null) {
    throw new Error(`Command "${commandName}" skill must be an object.`);
  }

  const path = (value as Partial<OpenRuntimeCommandSkill>).path;
  if (typeof path !== "string" || path.length === 0 || !isAbsolute(path) || basename(path) !== "SKILL.md") {
    throw new Error(`Command "${commandName}" skill.path must be an absolute path to SKILL.md.`);
  }
  if (!existsSync(path)) {
    throw new Error(`Command "${commandName}" skill does not exist: ${path}`);
  }
  if (!statSync(path).isFile()) {
    throw new Error(`Command "${commandName}" skill must point to a file: ${path}`);
  }
  try {
    accessSync(path, constants.R_OK);
  } catch {
    throw new Error(`Command "${commandName}" skill is not readable: ${path}`);
  }

  return { path };
}
