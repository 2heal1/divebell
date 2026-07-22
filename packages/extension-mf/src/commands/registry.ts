import type { MfCommandRegistration } from "../cli/router.js";
import {
  bridgeTraceCommandMetadata,
  moduleInfoCommandMetadata,
  statusCommandMetadata
} from "./metadata.js";

export const mfCommandRegistry: readonly MfCommandRegistration[] = [
  {
    ...statusCommandMetadata,
    load: async () => (await import("./status.js")).statusCommand
  },
  {
    ...moduleInfoCommandMetadata,
    load: async () => (await import("./module-info.js")).moduleInfoCommand
  },
  {
    ...bridgeTraceCommandMetadata,
    load: async () => (await import("./bridge-trace.js")).bridgeTraceCommand
  }
];
