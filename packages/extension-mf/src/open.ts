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

export function isMfDebugInjectionEnabled(args?: ParsedCliArgs): boolean {
  const value = args?.options.get("mf-debug")?.at(-1);
  if (value === undefined || value === "true") return true;
  if (value === "false") return false;
  throw new Error(
    `Invalid --mf-debug value ${JSON.stringify(value)}. Use --mf-debug=true or --mf-debug=false.`
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
  if (!isMfDebugInjectionEnabled(args)) {
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
