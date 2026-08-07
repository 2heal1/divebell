import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const packageDirectory = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = resolve(packageDirectory, "../../skills/divebell");
const destination = resolve(packageDirectory, "skills/divebell");

await mkdir(dirname(destination), { recursive: true });
await cp(source, destination, { recursive: true, force: true });
