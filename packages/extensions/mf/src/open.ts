import { readFile } from "node:fs/promises";
import type { ParsedCliArgs } from "@divebell/cli";
import {
  createMfProxyInitScript,
  readMfProxyOverrides
} from "./proxy.js";

const observabilitySource = new URL(
  "./observability-chrome-devtool.iife.js",
  import.meta.url
);
const installerSource = new URL("./install-observability.js", import.meta.url);
const runtimeInstallerSource = new URL("./install-runtime-debug.js", import.meta.url);
const proxySdkSource = new URL("./vmok-proxy-sdk.iife.js", import.meta.url);

export function isMfInjectionEnabled(args?: ParsedCliArgs): boolean {
  const value = args?.options.get("mf")?.at(-1);
  if (value === undefined) return false;
  if (value === "true") return true;
  if (value === "false") return false;
  throw new Error(
    `Invalid --mf value ${JSON.stringify(value)}. Use --mf to enable MF debugging or omit it.`
  );
}

export async function openMfObservability(
  args?: ParsedCliArgs
): Promise<{ scripts: string[] }> {
  const overrides = await readMfProxyOverrides(args);
  const hasProxy = Object.keys(overrides).length > 0;
  const proxySdk = hasProxy
    ? await readFile(proxySdkSource, "utf8")
    : undefined;
  const proxyInit = createMfProxyInitScript(proxySdk, overrides);
  if (!isMfInjectionEnabled(args)) {
    return { scripts: [proxyInit] };
  }

  const [runtimeInstaller, observability, installer] = await Promise.all([
    readFile(runtimeInstallerSource, "utf8"),
    readFile(observabilitySource, "utf8"),
    readFile(installerSource, "utf8")
  ]);
  return {
    scripts: [
      `${proxyInit}\n;${runtimeInstaller}\n;${observability}\n;${installer}`
    ]
  };
}
