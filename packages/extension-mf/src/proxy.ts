import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { ParsedCliArgs } from "@openruntime/cli";

export type MfProxyOverrides = Record<string, string>;

const MAX_PROXY_FILE_BYTES = 1024 * 1024;
const MAX_PROXY_RULES = 100;
const MAX_REMOTE_NAME_LENGTH = 240;
const MAX_PROXY_TARGET_LENGTH = 2048;

export async function readMfProxyOverrides(
  args?: ParsedCliArgs
): Promise<MfProxyOverrides> {
  const values = args?.options.get("mf-proxy") ?? [];
  const overrides = Object.create(null) as MfProxyOverrides;
  const sources = new Map<string, string>();

  for (const value of values) {
    if (value.includes("=")) {
      const equalsIndex = value.indexOf("=");
      addProxyRule(
        overrides,
        sources,
        value.slice(0, equalsIndex),
        value.slice(equalsIndex + 1),
        `--mf-proxy ${JSON.stringify(value)}`
      );
      continue;
    }

    const filePath = resolve(value);
    let source: string;
    try {
      source = await readFile(filePath, "utf8");
    } catch (error) {
      throw new Error(
        `Cannot read --mf-proxy JSON file ${JSON.stringify(filePath)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }
    if (Buffer.byteLength(source) > MAX_PROXY_FILE_BYTES) {
      throw new Error(
        `--mf-proxy JSON file ${JSON.stringify(filePath)} exceeds ${MAX_PROXY_FILE_BYTES} bytes.`
      );
    }
    const fileOverrides = parseProxyFile(source, filePath);
    for (const [remote, target] of Object.entries(fileOverrides)) {
      addProxyRule(overrides, sources, remote, target, filePath);
    }
  }

  return overrides;
}

export function createMfProxyInitScript(
  proxySdkSource: string | undefined,
  overrides: MfProxyOverrides
): string {
  if (Object.keys(overrides).length === 0) {
    return `(() => {
  const OWNER_KEY = "__OPENRUNTIME_MF_PROXY_OWNER__";
  const CONFIG_KEY = "__MF_DEVTOOLS__";
  const ENV_KEY = "MF_ENV";
  const setStorageValue = (storage, key, value) => {
    if (typeof value === "string") storage.setItem(key, value);
    else storage.removeItem(key);
  };
  try {
    const storage = globalThis.localStorage;
    if (!storage) return;
    const rawOwner = storage.getItem(OWNER_KEY);
    if (rawOwner === null) return;
    try {
      const owner = JSON.parse(rawOwner);
      if (
        owner &&
        owner.schemaVersion === 1 &&
        (typeof owner.config === "string" || owner.config === null) &&
        (typeof owner.env === "string" || owner.env === null)
      ) {
        setStorageValue(storage, CONFIG_KEY, owner.config);
        setStorageValue(storage, ENV_KEY, owner.env);
      }
    } catch {}
    storage.removeItem(OWNER_KEY);
  } catch {}
})()`;
  }

  const serializedOverrides = serializeForScript(overrides);
  const proxySdk = proxySdkSource ?? "";
  return `(() => {
  const OWNER_KEY = "__OPENRUNTIME_MF_PROXY_OWNER__";
  const CONFIG_KEY = "__MF_DEVTOOLS__";
  const ENV_KEY = "MF_ENV";
  const overrides = ${serializedOverrides};
  const setStorageValue = (storage, key, value) => {
    if (typeof value === "string") storage.setItem(key, value);
    else storage.removeItem(key);
  };
  const restoreOwnedState = (storage) => {
    const rawOwner = storage.getItem(OWNER_KEY);
    if (rawOwner === null) return;
    try {
      const owner = JSON.parse(rawOwner);
      if (
        owner &&
        owner.schemaVersion === 1 &&
        (typeof owner.config === "string" || owner.config === null) &&
        (typeof owner.env === "string" || owner.env === null)
      ) {
        setStorageValue(storage, CONFIG_KEY, owner.config);
        setStorageValue(storage, ENV_KEY, owner.env);
      }
    } catch {}
    storage.removeItem(OWNER_KEY);
  };
  let storage;
  try {
    storage = globalThis.localStorage;
    if (!storage) {
      throw new Error("localStorage is not available.");
    }
    restoreOwnedState(storage);
    storage.setItem(OWNER_KEY, JSON.stringify({
      schemaVersion: 1,
      config: storage.getItem(CONFIG_KEY),
      env: storage.getItem(ENV_KEY)
    }));
    ${proxySdk}
    if (
      typeof VmokProxySdk !== "object" ||
      VmokProxySdk === null ||
      typeof VmokProxySdk.bootstrapProxy !== "function"
    ) {
      throw new Error("The bundled Vmok Proxy SDK did not expose bootstrapProxy.");
    }
    VmokProxySdk.bootstrapProxy({ data: { overrides } });
    const federation = VmokProxySdk.ensureProxyRuntimeContext(globalThis);
    const snapshotOverridePlugin = {
      name: "openruntime-mf-proxy-snapshot-override",
      beforeLoadRemoteSnapshot(args) {
        try {
          const remote = args && args.moduleInfo;
          const origin = args && args.origin;
          if (!remote || typeof remote.name !== "string") return;
          const target = overrides[remote.name] ||
            (typeof remote.alias === "string" ? overrides[remote.alias] : undefined);
          if (!target) return;
          const snapshots = federation.moduleInfo;
          if (!snapshots || typeof snapshots !== "object") return;
          const hostName = origin && origin.options &&
            typeof origin.options.name === "string"
            ? origin.options.name
            : origin && typeof origin.name === "string"
              ? origin.name
              : undefined;
          if (!hostName) return;
          const hostVersion = origin && origin.options &&
            typeof origin.options.version === "string"
            ? origin.options.version
            : undefined;
          const hostEntries = Object.entries(snapshots).filter(([key, value]) =>
            value && typeof value === "object" &&
            (key === hostName || key.startsWith(hostName + ":"))
          );
          const hostSnapshot = snapshots[hostName] ||
            (hostVersion ? snapshots[hostName + ":" + hostVersion] : undefined) ||
            hostEntries.find(([, value]) =>
              hostVersion && value.version === hostVersion
            )?.[1] ||
            hostEntries[0]?.[1];
          if (
            !hostSnapshot ||
            typeof hostSnapshot !== "object" ||
            !hostSnapshot.remotesInfo ||
            typeof hostSnapshot.remotesInfo !== "object"
          ) {
            return;
          }
          const remoteInfoKey = Object.keys(hostSnapshot.remotesInfo).find(
            (key) => key === remote.name || key.endsWith(":" + remote.name)
          ) || remote.name;
          const currentRemoteInfo = hostSnapshot.remotesInfo[remoteInfoKey];
          hostSnapshot.remotesInfo = {
            ...hostSnapshot.remotesInfo,
            [remoteInfoKey]: {
              ...(currentRemoteInfo && typeof currentRemoteInfo === "object"
                ? currentRemoteInfo
                : {}),
              matchedVersion: target
            }
          };
        } catch (error) {
          console.error("[OpenRuntime MF Proxy Snapshot]", error);
        }
      }
    };
    if (!federation.__GLOBAL_PLUGIN__.some(
      (plugin) => plugin && plugin.name === snapshotOverridePlugin.name
    )) {
      federation.__GLOBAL_PLUGIN__.push(snapshotOverridePlugin);
    }
    globalThis.__OPENRUNTIME_MF_PROXY_INJECTION__ = {
      schemaVersion: 1,
      source: "openruntime/extension-mf",
      status: "installed",
      installedAt: Date.now(),
      overrides
    };
  } catch (error) {
    if (storage) restoreOwnedState(storage);
    const message = error instanceof Error ? error.message : String(error);
    globalThis.__OPENRUNTIME_MF_PROXY_INJECTION__ = {
      schemaVersion: 1,
      source: "openruntime/extension-mf",
      status: "error",
      installedAt: Date.now(),
      overrides,
      message
    };
    console.error("[OpenRuntime MF Proxy]", error);
  }
})()`;
}

function parseProxyFile(source: string, filePath: string): MfProxyOverrides {
  let parsed: unknown;
  try {
    parsed = JSON.parse(source);
  } catch (error) {
    throw new Error(
      `Invalid --mf-proxy JSON file ${JSON.stringify(filePath)}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
  if (!isRecord(parsed)) {
    throw new Error(
      `--mf-proxy JSON file ${JSON.stringify(filePath)} must contain an object.`
    );
  }

  let rawOverrides: Record<string, unknown> = parsed;
  if (isRecord(parsed.overrides)) {
    const unexpected = Object.keys(parsed).filter((key) => key !== "overrides");
    if (unexpected.length > 0) {
      throw new Error(
        `--mf-proxy JSON file ${JSON.stringify(filePath)} has unsupported fields: ${unexpected.join(", ")}.`
      );
    }
    rawOverrides = parsed.overrides;
  }

  const overrides = Object.create(null) as MfProxyOverrides;
  const sources = new Map<string, string>();
  for (const [remote, target] of Object.entries(rawOverrides)) {
    if (typeof target !== "string") {
      throw new Error(
        `Proxy target for ${JSON.stringify(remote)} in ${JSON.stringify(filePath)} must be a string.`
      );
    }
    addProxyRule(overrides, sources, remote, target, filePath);
  }
  if (Object.keys(overrides).length === 0) {
    throw new Error(
      `--mf-proxy JSON file ${JSON.stringify(filePath)} does not contain any proxy rules.`
    );
  }
  return overrides;
}

function addProxyRule(
  overrides: MfProxyOverrides,
  sources: Map<string, string>,
  rawRemote: string,
  rawTarget: string,
  source: string
): void {
  const remote = rawRemote.trim();
  const target = rawTarget.trim();
  if (remote.length === 0) {
    throw new Error(`MF proxy remote name must not be empty in ${source}.`);
  }
  if (remote.length > MAX_REMOTE_NAME_LENGTH) {
    throw new Error(
      `MF proxy remote name in ${source} exceeds ${MAX_REMOTE_NAME_LENGTH} characters.`
    );
  }
  if (["__proto__", "prototype", "constructor"].includes(remote)) {
    throw new Error(`MF proxy remote name ${JSON.stringify(remote)} is not allowed.`);
  }
  if (target.length === 0) {
    throw new Error(
      `MF proxy target for ${JSON.stringify(remote)} must not be empty.`
    );
  }
  if (target.length > MAX_PROXY_TARGET_LENGTH) {
    throw new Error(
      `MF proxy target for ${JSON.stringify(remote)} exceeds ${MAX_PROXY_TARGET_LENGTH} characters.`
    );
  }
  const previousSource = sources.get(remote);
  if (previousSource !== undefined) {
    throw new Error(
      `MF proxy remote ${JSON.stringify(remote)} is configured more than once in ${previousSource} and ${source}.`
    );
  }
  if (sources.size >= MAX_PROXY_RULES) {
    throw new Error(`MF proxy accepts at most ${MAX_PROXY_RULES} remote rules.`);
  }
  overrides[remote] = target;
  sources.set(remote, source);
}

function serializeForScript(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
