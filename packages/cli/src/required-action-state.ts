import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

export const REQUIRED_ACTION_KIND = "openruntime.requiredAction";
export const REQUIRED_ACTION_SCHEMA_VERSION = 1;

export type RequiredActionStatus = "pending" | "blocked";

export interface RequiredActionState {
  schemaVersion: 1;
  kind: typeof REQUIRED_ACTION_KIND;
  key: string;
  cwd: string;
  source: string;
  status: RequiredActionStatus;
  code: string;
  sourceEditable: boolean;
  canFallback: false;
  allowedNextActions: string[];
  forbiddenCommands: string[];
  integration: {
    install: string[];
    use: string[];
    required: true;
  };
  requiredAction: Record<string, unknown>;
  connected?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  stateFile: string;
}

export interface RequiredActionStateStore {
  stateFile: string;
  read(): Promise<RequiredActionState | undefined>;
  write(state: Omit<RequiredActionState, "schemaVersion" | "kind" | "key" | "cwd" | "stateFile">): Promise<void>;
  remove(): Promise<void>;
}

export function createFileRequiredActionStateStore(
  cwd = process.cwd(),
  stateDirectory = createDefaultRequiredActionStateDirectory()
): RequiredActionStateStore {
  const normalizedCwd = resolve(cwd);
  const key = createRequiredActionStateKey(normalizedCwd);
  const stateFile = join(stateDirectory, `${key}.json`);

  return {
    stateFile,
    read: async () => {
      try {
        const parsed: unknown = JSON.parse(await readFile(stateFile, "utf8"));
        if (!isRequiredActionState(parsed)) return undefined;
        return {
          ...parsed,
          stateFile
        };
      } catch {
        return undefined;
      }
    },
    write: async (state) => {
      await mkdir(stateDirectory, { recursive: true });
      await writeFile(stateFile, `${JSON.stringify({
        schemaVersion: REQUIRED_ACTION_SCHEMA_VERSION,
        kind: REQUIRED_ACTION_KIND,
        key,
        cwd: normalizedCwd,
        ...state,
        stateFile
      }, null, 2)}\n`, "utf8");
    },
    remove: async () => {
      await rm(stateFile, { force: true });
    }
  };
}

export function createDefaultRequiredActionStateDirectory(): string {
  return join(homedir(), ".openruntime", "required-actions");
}

export function createRequiredActionStateKey(cwd: string): string {
  return `required-action-${createHash("sha256").update(resolve(cwd)).digest("hex").slice(0, 16)}`;
}

export function isRequiredActionState(value: unknown): value is RequiredActionState {
  if (value === null || typeof value !== "object") return false;
  const state = value as Partial<RequiredActionState>;
  return state.schemaVersion === REQUIRED_ACTION_SCHEMA_VERSION &&
    state.kind === REQUIRED_ACTION_KIND &&
    typeof state.key === "string" &&
    typeof state.cwd === "string" &&
    (state.status === "pending" || state.status === "blocked") &&
    typeof state.code === "string" &&
    typeof state.source === "string" &&
    typeof state.sourceEditable === "boolean" &&
    state.canFallback === false &&
    Array.isArray(state.allowedNextActions) &&
    Array.isArray(state.forbiddenCommands) &&
    isIntegration(state.integration) &&
    isRecord(state.requiredAction) &&
    typeof state.createdAt === "string" &&
    typeof state.updatedAt === "string";
}

function isIntegration(value: unknown): value is RequiredActionState["integration"] {
  if (!isRecord(value)) return false;
  return Array.isArray(value.install) &&
    value.install.every((item) => typeof item === "string") &&
    Array.isArray(value.use) &&
    value.use.every((item) => typeof item === "string") &&
    value.required === true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
