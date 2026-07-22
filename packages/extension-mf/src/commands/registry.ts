import type { MfCommandRegistration } from "../cli/router.js";
import {
  bridgeTraceCommandMetadata,
  moduleInfoCommandMetadata,
  preloadTraceCommandMetadata,
  remoteCheckCommandMetadata,
  traceCommandMetadata,
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
  },
  {
    ...traceCommandMetadata,
    load: async () => (await import("./trace.js")).traceCommand
  },
  {
    ...remoteCheckCommandMetadata,
    load: async () => (await import("./remote-check.js")).remoteCheckCommand
  },
  {
    ...preloadTraceCommandMetadata,
    load: async () => (await import("./preload-trace.js")).preloadTraceCommand
  }
];
