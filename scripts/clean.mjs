import { rmSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url);
const packageDirs = [
  "core",
  "bridge",
  "chunk-map",
  "rspack-plugin",
  "cli",
  "modern-plugin",
  "extensions/code-usage",
  "extensions/imitate",
  "extensions/memory",
  "extensions/mf",
  "extensions/rstack"
];

for (const dir of packageDirs) {
  rmSync(join(root.pathname, "packages", dir, "dist"), { force: true, recursive: true });
}
