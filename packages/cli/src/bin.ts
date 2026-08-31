#!/usr/bin/env node
import { runCli } from "./create.js";

runCli(process.argv.slice(2), { enableAutomaticUpdates: true }).then((exitCode) => {
  process.exitCode = exitCode;
});
