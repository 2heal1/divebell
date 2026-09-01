import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";
import { resolveDivebellHomeDirectory } from "../../utils/home.js";
import type {
  CliUpdateNotice,
  CliUpdateResult,
  DivebellCliUpdater
} from "./types.js";

const CACHE_SCHEMA_VERSION = 1;
const DEFAULT_AUTO_UPDATE_INTERVAL_MS = 12 * 60 * 60 * 1000;
const AUTO_UPDATE_RETRY_THROTTLE_MS = 60 * 1000;
const UPDATE_LOCK_STALE_MS = 15 * 60 * 1000;
export const CLI_UPDATE_BACKGROUND_ENV = "DIVEBELL_CLI_UPDATE_BACKGROUND";

interface StoredCliUpdateNotice extends CliUpdateNotice {
  installationId: string;
}

interface CliUpdateCacheRecord {
  schemaVersion: 1;
  checkedAtMs?: number;
  currentVersion?: string;
  latestVersion?: string;
  lastAttemptAtMs?: number;
  lastError?: string;
  notice?: StoredCliUpdateNotice;
}

export interface CliUpdateRunOptions {
  check?: boolean;
  automatic?: boolean;
}

export interface CliUpdateDependencies {
  cachePath?: string;
  now?: () => number;
}

export interface CliUpdateScheduleDependencies extends CliUpdateDependencies {
  entryScript?: string;
  spawnBackground?: (entryScript: string, env: NodeJS.ProcessEnv) => void;
}

interface ParsedSemver {
  major: number;
  minor: number;
  patch: number;
  prerelease: readonly string[];
}

export function validateCliUpdater(updater: DivebellCliUpdater): DivebellCliUpdater {
  for (const key of ["id", "displayName", "currentVersion", "installationId"] as const) {
    if (typeof updater[key] !== "string" || updater[key].trim().length === 0) {
      throw new Error(`CLI updater ${key} must be a non-empty string.`);
    }
  }
  for (const key of [
    "canScheduleAutomaticUpdate",
    "isManagedInstallation",
    "getLatestVersion",
    "installVersion"
  ] as const) {
    if (typeof updater[key] !== "function") {
      throw new Error(`CLI updater ${key} must be a function.`);
    }
  }
  if (compareCliVersions(updater.currentVersion, updater.currentVersion) === null) {
    throw new Error(`CLI updater currentVersion is not valid SemVer: ${updater.currentVersion}.`);
  }
  if (
    updater.automaticUpdateIntervalMs !== undefined
    && (!Number.isFinite(updater.automaticUpdateIntervalMs)
      || updater.automaticUpdateIntervalMs <= 0)
  ) {
    throw new Error("CLI updater automaticUpdateIntervalMs must be a positive number.");
  }
  return updater;
}

export function compareCliVersions(left: string, right: string): number | null {
  const leftVersion = parseSemver(left);
  const rightVersion = parseSemver(right);
  if (leftVersion === null || rightVersion === null) return null;

  for (const key of ["major", "minor", "patch"] as const) {
    if (leftVersion[key] > rightVersion[key]) return 1;
    if (leftVersion[key] < rightVersion[key]) return -1;
  }

  if (leftVersion.prerelease.length === 0 && rightVersion.prerelease.length === 0) return 0;
  if (leftVersion.prerelease.length === 0) return 1;
  if (rightVersion.prerelease.length === 0) return -1;

  const length = Math.max(leftVersion.prerelease.length, rightVersion.prerelease.length);
  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = leftVersion.prerelease[index];
    const rightIdentifier = rightVersion.prerelease[index];
    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftNumber = numericIdentifier(leftIdentifier);
    const rightNumber = numericIdentifier(rightIdentifier);
    if (leftNumber !== null && rightNumber !== null) {
      return leftNumber > rightNumber ? 1 : -1;
    }
    if (leftNumber !== null) return -1;
    if (rightNumber !== null) return 1;
    return leftIdentifier > rightIdentifier ? 1 : -1;
  }
  return 0;
}

export function resolveCliUpdateCachePath(
  updater: DivebellCliUpdater,
  env: NodeJS.ProcessEnv = process.env
): string {
  const slug = updater.id
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .slice(0, 48) || "cli";
  const installationHash = createHash("sha256")
    .update(`${updater.id}\0${updater.installationId}`)
    .digest("hex")
    .slice(0, 16);
  return join(
    resolveDivebellHomeDirectory(env),
    "updates",
    `${slug}-${installationHash}.json`
  );
}

export function readCliUpdateCache(cachePath: string): CliUpdateCacheRecord | null {
  try {
    const value: unknown = JSON.parse(readFileSync(cachePath, "utf8"));
    return normalizeCacheRecord(value);
  } catch {
    return null;
  }
}

export function isCliUpdateBackgroundProcess(
  updater: DivebellCliUpdater,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return env[CLI_UPDATE_BACKGROUND_ENV] === updater.id;
}

export function scheduleCliAutoUpdate(
  updater: DivebellCliUpdater,
  argv: readonly string[],
  env: NodeJS.ProcessEnv = process.env,
  dependencies: CliUpdateScheduleDependencies = {}
): boolean {
  try {
    return scheduleCliAutoUpdateBestEffort(updater, argv, env, dependencies);
  } catch {
    return false;
  }
}

function scheduleCliAutoUpdateBestEffort(
  updater: DivebellCliUpdater,
  argv: readonly string[],
  env: NodeJS.ProcessEnv,
  dependencies: CliUpdateScheduleDependencies
): boolean {
  if (
    argv[0] === "update"
    || isCliUpdateBackgroundProcess(updater, env)
    || automaticUpdateIsDisabled(updater, env)
    || !updater.canScheduleAutomaticUpdate(env)
  ) {
    return false;
  }

  const entryScript = dependencies.entryScript ?? process.argv[1];
  if (!entryScript) return false;

  const cachePath = dependencies.cachePath ?? resolveCliUpdateCachePath(updater, env);
  const cache = readCliUpdateCache(cachePath);
  const now = (dependencies.now ?? Date.now)();
  const interval = updater.automaticUpdateIntervalMs ?? DEFAULT_AUTO_UPDATE_INTERVAL_MS;
  const cachedLatestIsNewer = cache?.latestVersion !== undefined
    && compareCliVersions(cache.latestVersion, updater.currentVersion) === 1;
  const cacheExpired = cache?.checkedAtMs === undefined
    || now - cache.checkedAtMs >= interval;
  const recentlyAttempted = cache?.lastAttemptAtMs !== undefined
    && now - cache.lastAttemptAtMs < AUTO_UPDATE_RETRY_THROTTLE_MS;
  if ((!cacheExpired && !cachedLatestIsNewer) || recentlyAttempted) return false;

  writeCliUpdateCache(cachePath, {
    ...(cache ?? { schemaVersion: CACHE_SCHEMA_VERSION }),
    currentVersion: updater.currentVersion,
    lastAttemptAtMs: now
  });

  try {
    (dependencies.spawnBackground ?? spawnBackgroundUpdater)(entryScript, {
      ...env,
      [CLI_UPDATE_BACKGROUND_ENV]: updater.id
    });
    return true;
  } catch {
    return false;
  }
}

export function consumeCliUpdateNotice(
  updater: DivebellCliUpdater,
  env: NodeJS.ProcessEnv = process.env,
  cachePath?: string
): CliUpdateNotice | null {
  try {
    const resolvedCachePath = cachePath ?? resolveCliUpdateCachePath(updater, env);
    const cache = readCliUpdateCache(resolvedCachePath);
    const notice = cache?.notice;
    if (
      cache === null
      || notice === undefined
      || notice.toVersion !== updater.currentVersion
      || notice.installationId !== updater.installationId
    ) {
      return null;
    }

    const { notice: _notice, ...remaining } = cache;
    writeCliUpdateCache(resolvedCachePath, remaining);
    return {
      fromVersion: notice.fromVersion,
      toVersion: notice.toVersion,
      completedAtMs: notice.completedAtMs
    };
  } catch {
    return null;
  }
}

export function formatCliUpdateNotice(
  updater: DivebellCliUpdater,
  notice: CliUpdateNotice
): string {
  try {
    return updater.formatUpdatedNotice?.(notice)
      ?? defaultUpdatedNotice(updater, notice);
  } catch {
    return defaultUpdatedNotice(updater, notice);
  }
}

function defaultUpdatedNotice(
  updater: DivebellCliUpdater,
  notice: CliUpdateNotice
): string {
  return `✓ ${updater.displayName} auto-updated: ${notice.fromVersion} -> ${notice.toVersion}.`;
}

export async function runCliUpdateWithLock(
  updater: DivebellCliUpdater,
  options: CliUpdateRunOptions = {},
  env: NodeJS.ProcessEnv = process.env,
  dependencies: CliUpdateDependencies = {}
): Promise<CliUpdateResult> {
  const cachePath = dependencies.cachePath ?? resolveCliUpdateCachePath(updater, env);
  const release = acquireUpdateLock(cachePath, (dependencies.now ?? Date.now)());
  if (release === null) {
    return buildResult(updater, {
      action: "skipped",
      automatic: options.automatic === true,
      installedVersion: updater.currentVersion,
      latestVersion: readCliUpdateCache(cachePath)?.latestVersion ?? null,
      message: `Another ${updater.displayName} update is already in progress.`
    });
  }

  try {
    return await runCliUpdate(updater, options, env, {
      ...dependencies,
      cachePath
    });
  } finally {
    release();
  }
}

export async function runCliUpdateBackgroundWorker(
  updater: DivebellCliUpdater,
  env: NodeJS.ProcessEnv = process.env,
  dependencies: CliUpdateDependencies = {}
): Promise<number> {
  try {
    await runCliUpdateWithLock(updater, { automatic: true }, env, dependencies);
    return 0;
  } catch (error) {
    try {
      const cachePath = dependencies.cachePath ?? resolveCliUpdateCachePath(updater, env);
      const existing = readCliUpdateCache(cachePath);
      writeCliUpdateCache(cachePath, {
        ...(existing ?? { schemaVersion: CACHE_SCHEMA_VERSION }),
        lastAttemptAtMs: (dependencies.now ?? Date.now)(),
        lastError: error instanceof Error ? error.message : String(error)
      });
    } catch {
      // The detached worker must not surface state-directory failures.
    }
    return 1;
  }
}

async function runCliUpdate(
  updater: DivebellCliUpdater,
  options: CliUpdateRunOptions,
  env: NodeJS.ProcessEnv,
  dependencies: CliUpdateDependencies & { cachePath: string }
): Promise<CliUpdateResult> {
  const automatic = options.automatic === true;
  const now = (dependencies.now ?? Date.now)();

  if (automatic && !(await updater.isManagedInstallation(env))) {
    const existing = readCliUpdateCache(dependencies.cachePath);
    writeCliUpdateCache(dependencies.cachePath, {
      ...(existing ?? { schemaVersion: CACHE_SCHEMA_VERSION }),
      checkedAtMs: now,
      currentVersion: updater.currentVersion,
      lastAttemptAtMs: now
    });
    return buildResult(updater, {
      action: "skipped",
      automatic,
      installedVersion: updater.currentVersion,
      latestVersion: null,
      message: `Automatic update does not manage this ${updater.displayName} installation.`
    });
  }

  const latestVersion = await updater.getLatestVersion(env);
  if (compareCliVersions(latestVersion, latestVersion) === null) {
    throw new Error(`The ${updater.displayName} updater returned invalid SemVer: ${latestVersion}.`);
  }
  const existing = readCliUpdateCache(dependencies.cachePath);
  const { lastError: _lastError, ...cacheWithoutError } = existing ?? {
    schemaVersion: CACHE_SCHEMA_VERSION
  };
  writeCliUpdateCache(dependencies.cachePath, {
    ...cacheWithoutError,
    checkedAtMs: now,
    currentVersion: updater.currentVersion,
    latestVersion,
    lastAttemptAtMs: now
  });

  const comparison = compareCliVersions(latestVersion, updater.currentVersion);
  if (comparison === null) {
    throw new Error(
      `Cannot compare ${updater.displayName} versions ${updater.currentVersion} and ${latestVersion}.`
    );
  }
  if (comparison !== 1) {
    const message = comparison === 0
      ? `${updater.displayName} is already at the latest version (${updater.currentVersion}).`
      : `Current ${updater.displayName} version ${updater.currentVersion} is newer than ${latestVersion}; no downgrade was attempted.`;
    return buildResult(updater, {
      action: "already_current",
      automatic,
      installedVersion: updater.currentVersion,
      latestVersion,
      message
    });
  }

  if (options.check === true) {
    return buildResult(updater, {
      action: "update_available",
      automatic,
      installedVersion: updater.currentVersion,
      latestVersion,
      message: `${updater.displayName} update available: ${updater.currentVersion} -> ${latestVersion}.`
    });
  }

  if (!(await updater.isManagedInstallation(env))) {
    return buildResult(updater, {
      action: "skipped",
      automatic,
      installedVersion: updater.currentVersion,
      latestVersion,
      message: `Current invocation is not a managed ${updater.displayName} installation; nothing was changed.`
    });
  }

  await updater.installVersion(latestVersion, env);
  const afterInstall = readCliUpdateCache(dependencies.cachePath);
  const {
    lastError: _installError,
    notice: _previousNotice,
    ...cacheAfterInstall
  } = afterInstall ?? { schemaVersion: CACHE_SCHEMA_VERSION };
  writeCliUpdateCache(dependencies.cachePath, {
    ...cacheAfterInstall,
    checkedAtMs: now,
    currentVersion: updater.currentVersion,
    latestVersion,
    lastAttemptAtMs: now,
    ...(automatic
      ? {
          notice: {
            fromVersion: updater.currentVersion,
            toVersion: latestVersion,
            completedAtMs: now,
            installationId: updater.installationId
          }
        }
      : {})
  });
  return buildResult(updater, {
    action: "updated",
    automatic,
    installedVersion: latestVersion,
    latestVersion,
    message: `Updated ${updater.displayName} from ${updater.currentVersion} to ${latestVersion}.`
  });
}

function buildResult(
  updater: DivebellCliUpdater,
  input: Omit<CliUpdateResult, "currentVersion" | "updaterId">
): CliUpdateResult {
  return {
    ...input,
    currentVersion: updater.currentVersion,
    updaterId: updater.id
  };
}

function automaticUpdateIsDisabled(
  updater: DivebellCliUpdater,
  env: NodeJS.ProcessEnv
): boolean {
  const variable = updater.disableAutomaticUpdateEnvironmentVariable;
  return variable !== undefined && env[variable] === "1";
}

function spawnBackgroundUpdater(entryScript: string, env: NodeJS.ProcessEnv): void {
  const child = spawn(process.execPath, [entryScript], {
    detached: true,
    env,
    stdio: "ignore"
  });
  child.unref();
}

function normalizeCacheRecord(value: unknown): CliUpdateCacheRecord | null {
  if (!isRecord(value) || value.schemaVersion !== CACHE_SCHEMA_VERSION) return null;
  const record: CliUpdateCacheRecord = { schemaVersion: CACHE_SCHEMA_VERSION };
  for (const key of ["checkedAtMs", "lastAttemptAtMs"] as const) {
    const candidate = value[key];
    if (typeof candidate === "number" && Number.isFinite(candidate) && candidate >= 0) {
      record[key] = candidate;
    }
  }
  for (const key of ["currentVersion", "latestVersion", "lastError"] as const) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.length > 0) record[key] = candidate;
  }
  if (isRecord(value.notice)) {
    const fromVersion = value.notice.fromVersion;
    const toVersion = value.notice.toVersion;
    const completedAtMs = value.notice.completedAtMs;
    const installationId = value.notice.installationId;
    if (
      typeof fromVersion === "string"
      && typeof toVersion === "string"
      && typeof completedAtMs === "number"
      && Number.isFinite(completedAtMs)
      && typeof installationId === "string"
      && installationId.length > 0
    ) {
      record.notice = { fromVersion, toVersion, completedAtMs, installationId };
    }
  }
  return record;
}

function writeCliUpdateCache(cachePath: string, record: CliUpdateCacheRecord): void {
  try {
    mkdirSync(dirname(cachePath), { recursive: true, mode: 0o700 });
    const temporaryPath = `${cachePath}.tmp-${process.pid}-${Math.random()
      .toString(16)
      .slice(2)}`;
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, {
        encoding: "utf8",
        flag: "wx",
        mode: 0o600
      });
      renameSync(temporaryPath, cachePath);
    } finally {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath);
    }
  } catch {
    // Update state is best effort and must not block unrelated CLI commands.
  }
}

function acquireUpdateLock(cachePath: string, now: number): (() => void) | null {
  const lockPath = `${cachePath}.lock`;
  mkdirSync(dirname(lockPath), { recursive: true, mode: 0o700 });
  const token = `${process.pid}:${now}:${Math.random().toString(16).slice(2)}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const descriptor = openSync(lockPath, "wx", 0o600);
      writeFileSync(descriptor, token, "utf8");
      closeSync(descriptor);
      return () => {
        try {
          if (readFileSync(lockPath, "utf8") === token) unlinkSync(lockPath);
        } catch {
          // A replaced or already released lock is not ours to remove.
        }
      };
    } catch {
      try {
        if (now - statSync(lockPath).mtimeMs < UPDATE_LOCK_STALE_MS) return null;
        unlinkSync(lockPath);
      } catch {
        return null;
      }
    }
  }
  return null;
}

function parseSemver(value: string): ParsedSemver | null {
  const match = /^(?:v)?(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(
    value.trim()
  );
  if (match === null) return null;
  const prerelease = match[4]?.split(".") ?? [];
  if (prerelease.some((identifier) => identifier.length === 0)) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    prerelease
  };
}

function numericIdentifier(value: string): number | null {
  return /^(?:0|[1-9]\d*)$/u.test(value) ? Number(value) : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
