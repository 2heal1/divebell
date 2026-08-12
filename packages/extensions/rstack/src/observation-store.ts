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
import type {
  HmrResult,
  HmrRuntimeCandidate,
  InstalledProbe,
  ObservationManifest,
  ReactRefreshRuntimeCandidate,
  RuntimeCandidate
} from "./types.js";

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
      const observation = normalizeObservation(parsed);
      if (observation === undefined || observation.observationId !== resolvedId) {
        throw new Error("Observation file has an unsupported schema.");
      }
      return observation;
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
          return normalizeObservation(parsed);
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
      item.status === "ready" || item.status === "observing"
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

function normalizeObservation(value: unknown): ObservationManifest | undefined {
  const valid = value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && (value as { schemaVersion?: unknown }).schemaVersion === 1
    && typeof (value as { observationId?: unknown }).observationId === "string";
  if (!valid) return undefined;
  const legacy = value as Omit<
    ObservationManifest,
    | "status"
    | "readyAtSequence"
    | "hmrRuntimes"
    | "reactRefreshRuntimes"
    | "installedProbes"
    | "result"
  > & {
    status: ObservationManifest["status"] | "armed";
    armedAtSequence?: number;
    readyAtSequence?: number;
    hmrRuntimes?: HmrRuntimeCandidate[];
    reactRefreshRuntimes?: ReactRefreshRuntimeCandidate[];
    installedProbes?: LegacyInstalledProbe[];
    runtimes?: RuntimeCandidate[];
    probes?: LegacyInstalledProbe[];
    result?: LegacyHmrResult;
  };
  const readyAtSequence = typeof legacy.readyAtSequence === "number"
    ? legacy.readyAtSequence
    : legacy.armedAtSequence;
  if (typeof readyAtSequence !== "number") return undefined;
  const hmrRuntimes = legacy.hmrRuntimes
    ?? legacy.runtimes?.filter(isHmrRuntime)
    ?? [];
  const reactRefreshRuntimes = legacy.reactRefreshRuntimes
    ?? legacy.runtimes?.filter(isReactRefreshRuntime)
    ?? [];
  const installedProbes = normalizeInstalledProbes(
    legacy.installedProbes ?? legacy.probes ?? [],
    hmrRuntimes,
    reactRefreshRuntimes
  );
  const result = normalizeHmrResult(legacy.result);
  const {
    armedAtSequence: _,
    runtimes: _runtimes,
    probes: _probes,
    hmrRuntimes: _hmrRuntimes,
    reactRefreshRuntimes: _reactRefreshRuntimes,
    installedProbes: _installedProbes,
    result: _result,
    ...current
  } = legacy;
  return {
    ...current,
    status: legacy.status === "armed" ? "ready" : legacy.status,
    readyAtSequence,
    hmrRuntimes,
    reactRefreshRuntimes,
    installedProbes,
    ...(result === undefined ? {} : { result })
  };
}

type LegacyHmrResult = Omit<
  HmrResult,
  "hmrRuntimes" | "reactRefreshRuntimes"
> & {
  runtimes?: RuntimeCandidate[];
  hmrRuntimes?: HmrRuntimeCandidate[];
  reactRefreshRuntimes?: ReactRefreshRuntimeCandidate[];
};

type LegacyInstalledProbe = Omit<InstalledProbe, "runtimeKind"> & {
  runtimeKind?: InstalledProbe["runtimeKind"];
};

function normalizeHmrResult(
  value: LegacyHmrResult | undefined
): HmrResult | undefined {
  if (value === undefined) return undefined;
  const hmrRuntimes = value.hmrRuntimes
    ?? value.runtimes?.filter(isHmrRuntime)
    ?? [];
  const reactRefreshRuntimes = value.reactRefreshRuntimes
    ?? value.runtimes?.filter(isReactRefreshRuntime)
    ?? [];
  const {
    runtimes: _runtimes,
    hmrRuntimes: _hmrRuntimes,
    reactRefreshRuntimes: _reactRefreshRuntimes,
    ...current
  } = value;
  return { ...current, hmrRuntimes, reactRefreshRuntimes };
}

function normalizeInstalledProbes(
  probes: LegacyInstalledProbe[],
  hmrRuntimes: HmrRuntimeCandidate[],
  reactRefreshRuntimes: ReactRefreshRuntimeCandidate[]
): InstalledProbe[] {
  const kinds = new Map<string, InstalledProbe["runtimeKind"]>([
    ...hmrRuntimes.map((runtime) => [runtime.runtimeId, runtime.kind] as const),
    ...reactRefreshRuntimes.map((runtime) => [runtime.runtimeId, runtime.kind] as const)
  ]);
  return probes.flatMap((probe) => {
    const runtimeKind = probe.runtimeKind ?? kinds.get(probe.runtimeId);
    return runtimeKind === undefined ? [] : [{ ...probe, runtimeKind }];
  });
}

function isHmrRuntime(
  runtime: RuntimeCandidate
): runtime is HmrRuntimeCandidate {
  return runtime.kind === "rspack-hmr";
}

function isReactRefreshRuntime(
  runtime: RuntimeCandidate
): runtime is ReactRefreshRuntimeCandidate {
  return runtime.kind === "react-refresh";
}

function isMissingFile(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "ENOENT";
}
