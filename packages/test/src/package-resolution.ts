import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const packageRoot = await resolveDivebellTestPackageRoot();

const requireFromTestPackage = createRequire(join(packageRoot, "package.json"));

export async function importFromTestPackage<T>(packageName: string): Promise<T> {
  const entry = requireFromTestPackage.resolve(packageName);
  return await import(pathToFileURL(entry).href) as T;
}

export async function resolvePackagePathFromTestPackage(
  packageName: string,
  relativePath: string
): Promise<string> {
  return join(await resolvePackageRootFromTestPackage(packageName), relativePath);
}

export async function resolvePackageRootFromTestPackage(
  packageName: string
): Promise<string> {
  const entry = requireFromTestPackage.resolve(packageName);
  const packageRoot = await findPackageRoot(dirname(entry), packageName);
  if (packageRoot !== undefined) return packageRoot;
  throw new Error(`Could not resolve package root for ${packageName}.`);
}

async function resolveDivebellTestPackageRoot(): Promise<string> {
  const currentDirectory = dirname(fileURLToPath(import.meta.url));
  const directPackageRoot = await findPackageRoot(currentDirectory, "@divebell/test");
  if (directPackageRoot !== undefined) return directPackageRoot;

  const repositoryPackageRoot = resolve(currentDirectory, "../../..", "packages/test");
  const repositoryPackage = await findPackageRoot(repositoryPackageRoot, "@divebell/test");
  if (repositoryPackage !== undefined) return repositoryPackage;

  throw new Error("Could not resolve @divebell/test package root.");
}

async function findPackageRoot(
  startDirectory: string,
  packageName: string
): Promise<string | undefined> {
  let directory = startDirectory;
  while (directory !== dirname(directory)) {
    try {
      const manifest = JSON.parse(
        await readFile(join(directory, "package.json"), "utf8")
      ) as { name?: unknown };
      if (manifest.name === packageName) return directory;
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") throw error;
    }
    directory = dirname(directory);
  }
  return undefined;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error;
}
