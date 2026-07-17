#!/usr/bin/env node
import { runCli } from "./create.js";

runCli().then((exitCode) => {
  process.exitCode = exitCode;
});
