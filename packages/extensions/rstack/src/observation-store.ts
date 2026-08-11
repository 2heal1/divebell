import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  readdir,
  rename,
  unlink,
  writeFile
} from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

import { rstackError } from "./errors.js";
import type { ObservationManifest } from "./types.js";

export class ObservationStore {
  readonly directory: string;

  constructor(
    cwd = process.cwd(),
    home = resolve(process.env.DIVEBELL_HOME?.trim() || join(homedir(), ".divebell"))
  ) {
    const cwdHash = createHash("sha256").update(cwd).digest("hex").slice(0, 24);
    this.directory = join(home, "extensions", "rstack", "observations", cwdHash);
  }

  createId(): string {
    return `rstack-hmr-${Date.now().toString(36)}-${randomBytes(6).toString("hex")}`;
  }

  async write(observation: ObservationManifest): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    await chmod(this.directory, 0o700);
    const path = this.path(observation.observationId);
    const temporary = `${path}.${process.pid}.${randomBytes(4).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(observation, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx"
      });
      await rename(temporary, path);
      await chmod(path, 0o600);
    } catch (error) {
      await unlink(temporary).catch(() => undefined);
      throw error;
    }
  }

  async read(id?: string): Promise<ObservationManifest> {
    const resolvedId = id ?? await this.resolveSingleActiveId();
    try {
      const parsed: unknown = JSON.parse(await readFile(this.path(resolvedId), "utf8"));
      if (!isObservation(parsed) || parsed.observationId !== resolvedId) {
        throw new Error("Observation file has an unsupported schema.");
      }
      return parsed;
    } catch (error) {
      if (isMissingFile(error)) {
        throw rstackError({
          code: "RSTACK_HMR_OBSERVATION_NOT_FOUND",
          kind: "not_found",
          message: `HMR observation ${resolvedId} was not found in the current project.`,
          hint: "Run `divebell rstack hmr start` before changing code."
        });
      }
      throw error;
    }
  }

  async list(): Promise<ObservationManifest[]> {
    let names: string[];
    try {
      names = await readdir(this.directory);
    } catch (error) {
      if (isMissingFile(error)) return [];
      throw error;
    }
    const observations = await Promise.all(names
      .filter((name) => name.endsWith(".json"))
      .map(async (name) => {
        try {
          const parsed: unknown = JSON.parse(
            await readFile(join(this.directory, name), "utf8")
          );
          return isObservation(parsed) ? parsed : undefined;
        } catch {
          return undefined;
        }
      }));
    return observations
      .filter((item): item is ObservationManifest => item !== undefined)
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  }

  private path(id: string): string {
    if (!/^rstack-hmr-[a-z0-9-]+$/u.test(id)) {
      throw rstackError({
        code: "RSTACK_HMR_OBSERVATION_ID_INVALID",
        kind: "validation",
        message: `Invalid HMR observation ID ${JSON.stringify(id)}.`
      });
    }
    return join(this.directory, `${id}.json`);
  }

  private async resolveSingleActiveId(): Promise<string> {
    const active = (await this.list()).filter((item) =>
      item.status === "armed" || item.status === "observing"
    );
    if (active.length === 1) return (active[0] as ObservationManifest).observationId;
    if (active.length === 0) {
      throw rstackError({
        code: "RSTACK_HMR_OBSERVATION_REQUIRED",
        kind: "not_found",
        message: "No active HMR observation exists in the current project.",
        hint: "Run `divebell rstack hmr start` before changing code."
      });
    }
    throw rstackError({
      code: "RSTACK_HMR_OBSERVATION_AMBIGUOUS",
      kind: "validation",
      message: "More than one active HMR observation exists in the current project.",
      hint: "Pass one observation ID explicitly.",
      details: { candidates: active.map((item) => item.observationId) }
    });
  }
}

function isObservation(value: unknown): value is ObservationManifest {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { schemaVersion?: unknown }).schemaVersion === 1
    && typeof (value as { observationId?: unknown }).observationId === "string";
}

function isMissingFile(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "ENOENT";
}
