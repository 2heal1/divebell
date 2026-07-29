import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const packageRoot = await resolveDivebellTestPackageRoot();

const requireFromTestPackage = createRequire(join(packageRoot, "package.json"));

export async function importFromTestPackage(packageName) {
  const entry = requireFromTestPackage.resolve(packageName);
  return import(pathToFileURL(entry).href);
}

export async function resolvePackagePathFromTestPackage(packageName, relativePath) {
  return join(await resolvePackageRootFromTestPackage(packageName), relativePath);
}

export async function resolvePackageRootFromTestPackage(packageName) {
  const entry = requireFromTestPackage.resolve(packageName);
  const packageRoot = await findPackageRoot(dirname(entry), packageName);
  if (packageRoot !== undefined) return packageRoot;
  throw new Error(`Could not resolve package root for ${packageName}.`);
}

async function resolveDivebellTestPackageRoot() {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const directPackageRoot = await findPackageRoot(currentDirectory, "@divebell/test");
  if (directPackageRoot !== undefined) return directPackageRoot;

  const repositoryPackageRoot = resolve(currentDirectory, "../../..", "packages/test");
  const repositoryPackage = await findPackageRoot(repositoryPackageRoot, "@divebell/test");
  if (repositoryPackage !== undefined) return repositoryPackage;

  throw new Error("Could not resolve @divebell/test package root.");
}

async function findPackageRoot(startDirectory, packageName) {
  let directory = startDirectory;
  while (directory !== dirname(directory)) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, "package.json"), "utf8"));
      if (manifest.name === packageName) return directory;
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
    directory = dirname(directory);
  }
  return undefined;
}
