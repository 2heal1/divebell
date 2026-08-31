import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDivebellHomeDirectory } from "../../utils/home.js";
import type { BrowserNetworkRules, BrowserProxyDescriptor } from "./network-control.js";

export interface ManagedNetworkControl {
  fingerprint: string;
  pid: number;
  controlUrl: string;
  pacUrl?: string;
  token: string;
  configPath: string;
}

export interface NetworkControlStarter {
  start(config: {
    fingerprint: string;
    rules?: BrowserNetworkRules;
    proxy?: BrowserProxyDescriptor;
  }): Promise<ManagedNetworkControl>;
}

export interface NetworkControlProcessController {
  isRunning(pid: number): boolean;
  stop(pid: number): void;
}

export function createDetachedNetworkControlStarter(
  entryModuleUrl: string,
  homeDirectory = resolveDivebellHomeDirectory()
): NetworkControlStarter {
  return {
    start: async (config) => await startDetachedNetworkControl(entryModuleUrl, homeDirectory, config)
  };
}

export async function attachNetworkControl(control: ManagedNetworkControl, cdpUrl: string): Promise<void> {
  const response = await fetch(`${control.controlUrl}/attach?token=${encodeURIComponent(control.token)}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cdpUrl }),
    signal: AbortSignal.timeout(5_000)
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `Network control attach failed with HTTP ${response.status}.`);
  }
}

export async function stopNetworkControl(
  control: ManagedNetworkControl | undefined,
  processController: NetworkControlProcessController = defaultNetworkControlProcessController
): Promise<void> {
  if (control === undefined) return;
  try {
    await fetch(`${control.controlUrl}/stop?token=${encodeURIComponent(control.token)}`, {
      method: "POST",
      signal: AbortSignal.timeout(1_000)
    });
  } catch {
    // The browser lifecycle must still be able to continue when the child died.
  }
  if (processController.isRunning(control.pid)) processController.stop(control.pid);
  await rm(control.configPath, { force: true });
}

async function startDetachedNetworkControl(
  entryModuleUrl: string,
  homeDirectory: string,
  config: { fingerprint: string; rules?: BrowserNetworkRules; proxy?: BrowserProxyDescriptor }
): Promise<ManagedNetworkControl> {
  const directory = join(homeDirectory, "network-controls");
  await mkdir(directory, { recursive: true });
  const token = randomUUID();
  const id = randomUUID();
  const configPath = join(directory, `${id}.json`);
  await writeFile(configPath, `${JSON.stringify({ schemaVersion: 1, token, ...config }, null, 2)}\n`, "utf8");
  const child = spawn(process.execPath, [
    fileURLToPath(entryModuleUrl),
    "__network-control-server",
    "--config",
    configPath
  ], {
    detached: true,
    stdio: ["ignore", "ignore", "pipe", "ipc"]
  });
  return await new Promise((resolve, reject) => {
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer | string) => { stderr += String(chunk); });
    const timer = setTimeout(() => {
      cleanup();
      stopStartingControl(child.pid);
      releaseChild();
      void rm(configPath, { force: true });
      reject(new Error("Divebell network control did not report its listening address."));
    }, 5_000);
    const cleanup = () => {
      clearTimeout(timer);
      child.off("error", onError);
      child.off("exit", onExit);
      child.off("message", onMessage);
    };
    const releaseChild = () => {
      if (child.connected) child.disconnect();
      child.stderr?.destroy();
      child.unref();
    };
    const onError = (error: Error) => {
      cleanup();
      releaseChild();
      void rm(configPath, { force: true });
      reject(error);
    };
    const onExit = (code: number | null) => {
      cleanup();
      releaseChild();
      void rm(configPath, { force: true });
      reject(new Error(
        `Divebell network control exited before startup completed${code === null ? "." : ` with code ${code}.`}` +
        (stderr.trim().length === 0 ? "" : ` ${stderr.trim()}`)
      ));
    };
    const onMessage = (message: unknown) => {
      if (!isReadyMessage(message)) return;
      cleanup();
      releaseChild();
      if (child.pid === undefined) {
        void rm(configPath, { force: true });
        reject(new Error("Divebell network control did not provide a process ID."));
        return;
      }
      resolve({
        fingerprint: config.fingerprint,
        pid: child.pid,
        controlUrl: message.controlUrl,
        ...(message.pacUrl === undefined ? {} : { pacUrl: message.pacUrl }),
        token,
        configPath
      });
    };
    child.once("error", onError);
    child.once("exit", onExit);
    child.on("message", onMessage);
  });
}

function isReadyMessage(value: unknown): value is { type: "divebell.network-control.ready"; controlUrl: string; pacUrl?: string } {
  return value !== null && typeof value === "object" &&
    (value as { type?: unknown }).type === "divebell.network-control.ready" &&
    typeof (value as { controlUrl?: unknown }).controlUrl === "string" &&
    ((value as { pacUrl?: unknown }).pacUrl === undefined || typeof (value as { pacUrl?: unknown }).pacUrl === "string");
}

function stopStartingControl(pid: number | undefined): void {
  if (pid === undefined) return;
  try { process.kill(pid, "SIGTERM"); } catch {}
}

const defaultNetworkControlProcessController: NetworkControlProcessController = {
  isRunning: (pid) => {
    try { process.kill(pid, 0); return true; } catch { return false; }
  },
  stop: (pid) => {
    try { process.kill(pid, "SIGTERM"); } catch {}
  }
};
