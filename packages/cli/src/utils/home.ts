import {
  chmodSync,
  closeSync,
  lstatSync,
  mkdirSync,
  openSync,
  unlinkSync
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const DIVEBELL_HOME_ENV = "DIVEBELL_HOME";

let probeCounter = 0;

export interface DivebellHomeResolutionOptions {
  homeDirectory?: string;
  temporaryDirectory?: string;
  uid?: number;
  pid?: number;
}

export function resolveDivebellHomeDirectory(
  env: NodeJS.ProcessEnv = process.env,
  options: DivebellHomeResolutionOptions = {}
): string {
  const explicit = env[DIVEBELL_HOME_ENV]?.trim();
  if (explicit) return resolve(explicit);

  const defaultDirectory = join(options.homeDirectory ?? homedir(), ".divebell");
  if (directoryIsWritable(defaultDirectory)) return defaultDirectory;

  const temporaryDirectory = options.temporaryDirectory ?? tmpdir();
  const uid = options.uid ?? getEffectiveUserId();
  const pid = options.pid ?? process.pid;
  const name = uid === undefined ? "divebell" : `divebell-${uid}`;
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const directory = join(
      temporaryDirectory,
      suffix === 0 ? name : `${name}-${suffix}`
    );
    if (preparePrivateDirectory(directory, uid)) return directory;
  }

  const processDirectory = join(temporaryDirectory, `${name}-${pid}`);
  if (preparePrivateDirectory(processDirectory, uid)) return processDirectory;
  throw new Error("Divebell could not create a private writable state directory.");
}

function getEffectiveUserId(): number | undefined {
  return typeof process.geteuid === "function" ? process.geteuid() : undefined;
}

function preparePrivateDirectory(directory: string, uid: number | undefined): boolean {
  try {
    mkdirSync(directory, { recursive: false, mode: 0o700 });
  } catch (error) {
    if (!isAlreadyExistsError(error)) return false;
  }

  try {
    const stats = lstatSync(directory);
    if (!stats.isDirectory() || stats.isSymbolicLink()) return false;
    if (uid !== undefined && stats.uid !== uid) return false;
    chmodSync(directory, 0o700);
    return directoryIsWritable(directory);
  } catch {
    return false;
  }
}

function directoryIsWritable(directory: string): boolean {
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const probe = join(
      directory,
      `.write-probe-${process.pid}-${probeCounter}`
    );
    probeCounter += 1;
    const descriptor = openSync(probe, "wx", 0o600);
    closeSync(descriptor);
    unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function isAlreadyExistsError(error: unknown): boolean {
  return error !== null
    && typeof error === "object"
    && "code" in error
    && error.code === "EEXIST";
}
