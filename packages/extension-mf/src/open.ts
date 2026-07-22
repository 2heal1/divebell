import { readFile } from "node:fs/promises";

const observabilitySource = new URL(
  "./observability-chrome-devtool.iife.js",
  import.meta.url
);
const installerSource = new URL("./install-observability.js", import.meta.url);

export async function openMfObservability(): Promise<{ scripts: string[] }> {
  const [observability, installer] = await Promise.all([
    readFile(observabilitySource, "utf8"),
    readFile(installerSource, "utf8")
  ]);
  return {
    scripts: [`${observability}\n;${installer}`]
  };
}
