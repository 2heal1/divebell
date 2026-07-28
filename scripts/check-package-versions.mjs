import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { readDivebellReleasePackages } from "./divebell-release-packages.mjs";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const packages = await readDivebellReleasePackages(repositoryRoot);
const versions = new Map();
for (const item of packages) {
  const packagesForVersion = versions.get(item.packageJson.version) ?? [];
  packagesForVersion.push(`${item.name} (${item.directory})`);
  versions.set(item.packageJson.version, packagesForVersion);
}

if (versions.size > 1) {
  const details = Array.from(versions.entries())
    .map(([version, packages]) => `- ${version}: ${packages.join(", ")}`)
    .join("\n");
  throw new Error(`Divebell package versions must stay aligned:\n${details}`);
}

const [version] = versions.keys();
console.log(`[version:check] ${packages.length} packages share version ${version}.`);
