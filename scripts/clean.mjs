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
  "command-code-usage",
  "command-trobule-shooting",
  "command-imitate",
  "command-memory"
];

for (const dir of packageDirs) {
  rmSync(join(root.pathname, "packages", dir, "dist"), { force: true, recursive: true });
}
