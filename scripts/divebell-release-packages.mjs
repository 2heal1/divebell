import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

export async function readDivebellReleasePackages(repositoryRoot) {
  const config = JSON.parse(await readFile(
    resolve(repositoryRoot, ".changeset/config.json"),
    "utf8"
  ));
  const fixedPackages = config.fixed?.[0];
  if (!Array.isArray(fixedPackages) || fixedPackages.length === 0) {
    throw new Error("No fixed package group is configured in .changeset/config.json.");
  }
  if (new Set(fixedPackages).size !== fixedPackages.length) {
    throw new Error("The fixed package group contains duplicate package names.");
  }

  const packagesRoot = resolve(repositoryRoot, "packages");
  const entries = await readdir(packagesRoot, { withFileTypes: true });
  const packageByName = new Map();
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativePath = `packages/${entry.name}/package.json`;
    let packageJson;
    try {
      packageJson = JSON.parse(await readFile(resolve(repositoryRoot, relativePath), "utf8"));
    } catch (error) {
      if (error?.code === "ENOENT") continue;
      throw error;
    }
    if (packageByName.has(packageJson.name)) {
      throw new Error(`Duplicate workspace package name: ${packageJson.name}`);
    }
    packageByName.set(packageJson.name, {
      directory: `packages/${entry.name}`,
      relativePath,
      packageJson
    });
  }

  const missingPackages = fixedPackages.filter((name) => !packageByName.has(name));
  if (missingPackages.length > 0) {
    throw new Error(`Missing fixed package(s): ${missingPackages.join(", ")}`);
  }

  const publishablePackages = Array.from(packageByName.entries())
    .filter(([, item]) =>
      item.packageJson.private !== true &&
      item.packageJson.publishConfig?.access === "public"
    )
    .map(([name]) => name);
  const unmanagedPackages = publishablePackages.filter((name) => !fixedPackages.includes(name));
  if (unmanagedPackages.length > 0) {
    throw new Error(`Publishable package(s) missing from fixed group: ${unmanagedPackages.join(", ")}`);
  }

  const nonPublishablePackages = fixedPackages.filter((name) => {
    const packageJson = packageByName.get(name).packageJson;
    return packageJson.private === true || packageJson.publishConfig?.access !== "public";
  });
  if (nonPublishablePackages.length > 0) {
    throw new Error(`Fixed package(s) are not public: ${nonPublishablePackages.join(", ")}`);
  }

  return fixedPackages.map((name) => {
    const item = packageByName.get(name);
    return {
      name,
      directory: item.directory,
      relativePath: item.relativePath,
      filePrefix: name.replace(/^@/, "").replaceAll("/", "-"),
      packageJson: item.packageJson
    };
  });
}
