import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const config = JSON.parse(readFileSync(new URL("../.changeset/config.json", import.meta.url), "utf8"));
const fixedPackages = config.fixed?.[0] ?? [];

if (!Array.isArray(fixedPackages) || fixedPackages.length === 0) {
  throw new Error("No fixed package group is configured in .changeset/config.json.");
}

const packageMetaByName = new Map();
const packagesRoot = join(root.pathname, "packages");

for (const entry of readdirSync(packagesRoot, { withFileTypes: true })) {
  if (!entry.isDirectory()) {
    continue;
  }

  const packagePath = join(packagesRoot, entry.name, "package.json");
  if (!existsSync(packagePath)) {
    continue;
  }
  const pkg = JSON.parse(readFileSync(packagePath, "utf8"));
  packageMetaByName.set(pkg.name, {
    dir: `packages/${entry.name}`,
    publishable: pkg.private !== true && pkg.publishConfig?.access === "public",
    version: pkg.version
  });
}

const missingPackages = fixedPackages.filter((name) => !packageMetaByName.has(name));
if (missingPackages.length > 0) {
  throw new Error(`Missing fixed package(s): ${missingPackages.join(", ")}`);
}

const publishablePackages = Array.from(packageMetaByName.entries())
  .filter(([, meta]) => meta.publishable)
  .map(([name]) => name);
const unmanagedPackages = publishablePackages.filter((name) => !fixedPackages.includes(name));
if (unmanagedPackages.length > 0) {
  throw new Error(`Publishable package(s) missing from fixed group: ${unmanagedPackages.join(", ")}`);
}

const versions = new Map();
for (const name of fixedPackages) {
  const meta = packageMetaByName.get(name);
  const packagesForVersion = versions.get(meta.version) ?? [];
  packagesForVersion.push(`${name} (${meta.dir})`);
  versions.set(meta.version, packagesForVersion);
}

if (versions.size > 1) {
  const details = Array.from(versions.entries())
    .map(([version, packages]) => `- ${version}: ${packages.join(", ")}`)
    .join("\n");
  throw new Error(`Divebell package versions must stay aligned:\n${details}`);
}

const [version] = versions.keys();
console.log(`[version:check] ${fixedPackages.length} packages share version ${version}.`);
