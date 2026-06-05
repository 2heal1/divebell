#!/usr/bin/env node
import { createPackageInfo } from "@openruntime/core";

export const cliPackageInfo = createPackageInfo("@openruntime/cli", "agent command line");

export function getCliCommandName(): "openruntime" {
  return "openruntime";
}

